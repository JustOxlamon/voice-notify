// voice-notify — server-side OpenCode V2 plugin.
//
// The server plugin receives the public event stream (`ctx.event.subscribe`)
// and can spawn the local TTS player. It speaks the session title when a turn
// finishes, asks a question, needs permission, or a subagent finishes.
//
// Speech is queued and played sequentially; a cross-process lock prevents two
// plugin instances from talking over each other.

import fs from "node:fs"
import path from "node:path"
import {
  CACHE_DIR,
  PLUGIN_DIR,
  cacheKey,
  cachedFile,
  defaultFfmpeg,
  defaultFfplay,
  defaultPython,
  playAndWait,
  pruneCache,
  speakSapi,
  stopPlayback,
  synthesize,
} from "./audio.ts"
import type { AudioOptions } from "./audio.ts"
import {
  DEFAULT_VOICES,
  VOICE_NOTIFY_EVENTS,
  VoiceNotifyRpc,
  type VoiceNotifyEvent,
  type VoiceNotifySettings,
  type VoiceNotifyStrategy,
} from "./rpc.ts"
import { basename, preprocess, shapeForStrategy, type Segment, type Strategy } from "./speech.ts"

type Kind = "success" | "failed" | "interrupted" | "question" | "permission" | "subagent" | "retry"

type Options = {
  strategy: Strategy | "auto"
  voiceRu: string
  voiceEn: string
  voicePool: string[]
  template: string
  templateFailed: string
  templateInterrupted: string
  templateQuestion: string
  templatePermission: string
  templateSubagent: string
  templateRetry: string
  events: string[]
  subagents: boolean
  maxTitleChars: number
  maxToolChars: number
  rate: string
  pitch: string
  volume: number
  fallbackSapi: boolean
  voiceVariants: boolean
  python: string
  ffmpeg: string
  ffplay: string
}

const DEFAULT_VOICE_POOL = [...DEFAULT_VOICES]

const DEFAULTS: Options = {
  strategy: "auto",
  voiceRu: "ru-RU-SvetlanaNeural",
  voiceEn: "ru-RU-SvetlanaNeural",
  voicePool: DEFAULT_VOICE_POOL,
  template: "Готово: {title}",
  templateFailed: "Ошибка: {title}",
  templateInterrupted: "Прервано: {title}",
  templateQuestion: "Вопрос: {title}",
  templatePermission: "Требуется разрешение: {title}",
  templateSubagent: "Сабагент готов: {title}",
  templateRetry: "Повторная попытка: {title}",
  events: ["success", "failed", "interrupted", "question", "permission", "subagent"],
  subagents: true,
  maxTitleChars: 120,
  maxToolChars: 2000,
  rate: "+0%",
  pitch: "+0Hz",
  volume: 0.8,
  fallbackSapi: false,
  voiceVariants: true,
  python: "",
  ffmpeg: "",
  ffplay: "",
}

/** Rate presets, all on Svetlana. Different sessions get a stable one. */
const VOICE_VARIANTS = [
  { rate: "+0%", pitch: "+0Hz" },
  { rate: "-3%", pitch: "+0Hz" },
  { rate: "+3%", pitch: "+0Hz" },
  { rate: "-5%", pitch: "+0Hz" },
  { rate: "+5%", pitch: "+0Hz" },
  { rate: "-1%", pitch: "+0Hz" },
  { rate: "+1%", pitch: "+0Hz" },
  { rate: "-7%", pitch: "+0Hz" },
]

const KINDS = {
  success: "session.execution.succeeded",
  failed: "session.execution.failed",
  interrupted: "session.execution.interrupted",
  question: "form.created",
  permission: "permission.asked",
  retry: "session.retry.scheduled",
} as const

const EVENT_NAMES = [
  "session.execution.started",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.renamed",
  "form.created",
  "permission.asked",
  "session.retry.scheduled",
] as const

const PREWARM_WAIT_MS = 15000
const PREWARM_DEBOUNCE_MS = 350
const DUPLICATE_WINDOW_MS = 1200
const MAX_QUEUE = 20
const PLAY_LOCK_STALE_MS = 30000
const PLAY_LOCK_WAIT_MS = 30000

function normalizeOptions(raw: unknown): Options {
  const input = (raw ?? {}) as Record<string, unknown>
  const pick = <K extends keyof Options>(key: K): Options[K] => {
    const value = input[key]
    return (value === undefined ? DEFAULTS[key] : value) as Options[K]
  }
  const events = Array.isArray(input.events)
    ? (input.events as unknown[]).map((value) => String(value).toLowerCase())
    : DEFAULTS.events
  const strategy = String(pick("strategy") ?? "auto").toLowerCase()
  const voicePoolRaw = Array.isArray(input.voicePool)
    ? (input.voicePool as unknown[]).map((value) => String(value).trim()).filter(Boolean)
    : DEFAULTS.voicePool
  const voicePool = voicePoolRaw.length > 0 ? voicePoolRaw : DEFAULTS.voicePool
  return {
    strategy:
      strategy === "auto" ||
      strategy === "hybrid" ||
      strategy === "transliterate" ||
      strategy === "whole" ||
      strategy === "cmu"
        ? (strategy as Strategy | "auto")
        : "auto",
    voiceRu: String(pick("voiceRu")),
    voiceEn: String(pick("voiceEn")),
    voicePool,
    template: String(pick("template")),
    templateFailed: String(pick("templateFailed")),
    templateInterrupted: String(pick("templateInterrupted")),
    templateQuestion: String(pick("templateQuestion")),
    templatePermission: String(pick("templatePermission")),
    templateSubagent: String(pick("templateSubagent")),
    templateRetry: String(pick("templateRetry")),
    events: events.length > 0 ? events : DEFAULTS.events,
    subagents: pick("subagents") !== false,
    maxTitleChars: Math.max(20, Number(pick("maxTitleChars")) || DEFAULTS.maxTitleChars),
    maxToolChars: Math.max(100, Number(pick("maxToolChars")) || DEFAULTS.maxToolChars),
    rate: String(pick("rate")),
    pitch: String(pick("pitch")),
    volume: Math.max(0, Math.min(1, Number(pick("volume")) || 0)),
    fallbackSapi: pick("fallbackSapi") === true,
    voiceVariants: pick("voiceVariants") !== false,
    python: String(pick("python") ?? ""),
    ffmpeg: String(pick("ffmpeg") ?? ""),
    ffplay: String(pick("ffplay") ?? ""),
  }
}

function toAudioOptions(options: Options) {
  return {
    python: options.python.trim() ? options.python.trim() : defaultPython(),
    ffmpeg: options.ffmpeg.trim() ? options.ffmpeg.trim() : defaultFfmpeg(),
    ffplay: options.ffplay.trim() ? options.ffplay.trim() : defaultFfplay(),
    rate: options.rate,
    pitch: options.pitch,
    volume: options.volume,
    fallbackSapi: options.fallbackSapi,
    voiceRu: options.voiceRu,
    voiceEn: options.voiceEn,
    strategy: options.strategy,
  }
}

const SETTINGS_FILE = path.join(PLUGIN_DIR, "settings.json")

const KIND_FOR_EVENT: Record<string, VoiceNotifyEvent> = Object.fromEntries(
  Object.entries(KINDS).map(([kind, event]) => [event, kind as VoiceNotifyEvent]),
)

function eventKind(value: unknown): VoiceNotifyEvent | undefined {
  const text = String(value ?? "").trim()
  if (!text) return undefined
  const lower = text.toLowerCase()
  if ((VOICE_NOTIFY_EVENTS as readonly string[]).includes(lower)) return lower as VoiceNotifyEvent
  return KIND_FOR_EVENT[text] ?? KIND_FOR_EVENT[lower]
}

/** The user-facing subset of the internal options. */
function settingsFrom(options: Options): VoiceNotifySettings {
  const events = [
    ...new Set(
      options.events
        .map(eventKind)
        .filter((value): value is VoiceNotifyEvent => value !== undefined),
    ),
  ]
  return {
    events: events.length > 0 ? events : [...DEFAULTS.events] as VoiceNotifyEvent[],
    subagents: options.subagents,
    voicePool: [...options.voicePool],
    voiceVariants: options.voiceVariants,
    rate: options.rate,
    volume: options.volume,
    fallbackSapi: options.fallbackSapi,
    strategy: options.strategy as VoiceNotifyStrategy,
    template: options.template,
    templateFailed: options.templateFailed,
    templateInterrupted: options.templateInterrupted,
    templateQuestion: options.templateQuestion,
    templatePermission: options.templatePermission,
    templateSubagent: options.templateSubagent,
    templateRetry: options.templateRetry,
    maxTitleChars: options.maxTitleChars,
    maxToolChars: options.maxToolChars,
  }
}

function readSettingsFile(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code !== "ENOENT") console.warn("[voice-notify] could not read settings.json", error)
    return {}
  }
}

function writeSettingsFile(settings: VoiceNotifySettings) {
  const temp = `${SETTINGS_FILE}.tmp`
  fs.writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`, "utf8")
  fs.renameSync(temp, SETTINGS_FILE)
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return promise
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
    promise.then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function sessionPayload(result: any): any {
  return result?.data ?? result
}

export default {
  id: "voice-notify",
  async setup(ctx: any) {
    if (!ctx || typeof ctx.event?.subscribe !== "function") return () => {}

    const rawOptions = (ctx.options ?? {}) as Record<string, unknown>
    const savedSettings = readSettingsFile()
    let options = normalizeOptions({ ...rawOptions, ...savedSettings })
    let audioOptions = toAudioOptions(options)
    const cleanups: Array<() => void | Promise<void>> = []
    const inflight = new Map<string, Promise<string>>()
    const debounces = new Map<string, ReturnType<typeof setTimeout>>()
    const queue: Array<{
      text: string
      lockKey: string
      segments: Segment[]
      key: string
      priority: number
      audio: AudioOptions
      waitMs?: number
      done?: (ok: boolean) => void
    }> = []
    const lastPlayFile = path.join(CACHE_DIR, "last-play.json")
    const playLockFile = path.join(CACHE_DIR, "play.lock")
    const toolSpoken = new Map<string, number>()
    let disposed = false
    let lastKey = ""
    let lastPlayedAt = 0
    let draining = false

    function hashSession(sessionID: string): number {
      let hash = 2166136261
      for (let index = 0; index < sessionID.length; index += 1) {
        hash ^= sessionID.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
      }
      return hash >>> 0
    }

    function sessionVoice(sessionID: string): { voice: string; rate: string; pitch: string } {
      const pool = options.voicePool.length > 0 ? options.voicePool : DEFAULTS.voicePool
      const voice = pool[hashSession(`voice:${sessionID}`) % pool.length]
      const variant = options.voiceVariants
        ? VOICE_VARIANTS[hashSession(`rate:${sessionID}`) % VOICE_VARIANTS.length]
        : { rate: options.rate, pitch: options.pitch }
      return { voice, rate: variant.rate, pitch: variant.pitch }
    }

    function resolveStrategy(requested: string, voice: string): Strategy {
      if (requested === "auto") return voice.startsWith("ru-") ? "cmu" : "whole"
      if (
        requested === "hybrid" ||
        requested === "transliterate" ||
        requested === "whole" ||
        requested === "cmu"
      ) {
        return requested
      }
      return voice.startsWith("ru-") ? "cmu" : "whole"
    }

    function audioFor(sessionID: string, overrides: Partial<AudioOptions> = {}): AudioOptions {
      const variant = sessionVoice(sessionID)
      const voice = String(overrides.voiceRu ?? variant.voice)
      const strategy = resolveStrategy(String(overrides.strategy ?? options.strategy).toLowerCase(), voice)
      return {
        ...audioOptions,
        voiceRu: voice,
        voiceEn: String(overrides.voiceEn ?? voice),
        rate: variant.rate,
        pitch: variant.pitch,
        ...overrides,
        strategy,
      }
    }

    function currentSettings(): VoiceNotifySettings {
      return settingsFrom(options)
    }

    function applySettings(patch: Partial<VoiceNotifySettings>): VoiceNotifySettings {
      const next = normalizeOptions({ ...options, ...(patch ?? {}) })
      const publicNext = settingsFrom(next)
      writeSettingsFile(publicNext)
      options = next
      audioOptions = toAudioOptions(next)
      return publicNext
    }

    function resetSettings(): VoiceNotifySettings {
      try {
        fs.unlinkSync(SETTINGS_FILE)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException | undefined)?.code
        if (code !== "ENOENT") throw error
      }
      options = normalizeOptions(rawOptions)
      audioOptions = toAudioOptions(options)
      return currentSettings()
    }

    function recentlyPlayed(lockKey: string): boolean {
      try {
        const raw = fs.readFileSync(lastPlayFile, "utf8")
        const last = JSON.parse(raw) as { key?: string; at?: number }
        return last.key === lockKey && Date.now() - Number(last.at ?? 0) < 5000
      } catch {
        return false
      }
    }

    function markPlayed(lockKey: string) {
      try {
        fs.writeFileSync(lastPlayFile, JSON.stringify({ key: lockKey, at: Date.now() }), "utf8")
      } catch {
        /* ignore */
      }
    }

    /**
     * Cross-process playback mutex. Parallel plugin instances are rare, but a
     * parent/subagent pair can otherwise start two ffplay processes at once.
     */
    async function withPlayLock<T>(fn: () => Promise<T>): Promise<T> {
      const started = Date.now()
      let acquired = false
      while (!disposed && !acquired) {
        try {
          const fd = fs.openSync(playLockFile, "wx")
          try {
            fs.writeFileSync(fd, String(process.pid))
          } finally {
            fs.closeSync(fd)
          }
          acquired = true
        } catch {
          try {
            const stat = fs.statSync(playLockFile)
            if (Date.now() - stat.mtimeMs > PLAY_LOCK_STALE_MS) {
              try {
                fs.unlinkSync(playLockFile)
              } catch {
                /* ignore */
              }
              continue
            }
          } catch {
            /* lock disappeared */
          }
          if (Date.now() - started >= PLAY_LOCK_WAIT_MS) break
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }
      if (!acquired && disposed) return undefined as T
      try {
        return await fn()
      } finally {
        if (acquired) {
          try {
            fs.unlinkSync(playLockFile)
          } catch {
            /* ignore */
          }
        }
      }
    }

    async function getSession(sessionID: string): Promise<any> {
      try {
        return sessionPayload(await ctx.session.get({ sessionID }))
      } catch {
        return undefined
      }
    }

    function titleFor(session: any, overrideTitle?: string): string {
      if (overrideTitle !== undefined) {
        const value = String(overrideTitle).trim()
        if (value) return value
      }
      const directory = String(session?.directory ?? session?.path ?? ctx?.location?.directory ?? "")
      const dirName = basename(directory)
      const title = String(session?.title ?? "").trim()
      const titleIsPlaceholder = /^(new|untitled)[\s-]*session$/i.test(title)
      return (title && !titleIsPlaceholder ? title : "") || dirName || "сессия"
    }

    function buildText(session: any, template: string, overrideTitle?: string): string {
      const directory = String(session?.directory ?? session?.path ?? ctx?.location?.directory ?? "")
      const dirName = basename(directory)
      const values: Record<string, string> = {
        title: titleFor(session, overrideTitle),
        project: dirName || "проект",
        directory: dirName || directory || "проект",
      }
      let text = String(template || DEFAULTS.template)
      text = text.replace(/\{(title|project|directory)\}/gi, (match, key: string) => {
        const value = values[key.toLowerCase()]
        return value === undefined ? match : value
      })
      return preprocess(text, options.maxTitleChars)
    }

    function templateFor(kind: Kind): string {
      switch (kind) {
        case "failed":
          return options.templateFailed
        case "interrupted":
          return options.templateInterrupted
        case "question":
          return options.templateQuestion
        case "permission":
          return options.templatePermission
        case "subagent":
          return options.templateSubagent
        case "retry":
          return options.templateRetry
        default:
          return options.template
      }
    }

    function wanted(kind: Kind): boolean {
      if (options.events.includes(kind)) return true
      const eventName = (KINDS as Record<string, string>)[kind]
      return eventName !== undefined && options.events.includes(eventName)
    }

    function shapeFor(
      text: string,
      audio: AudioOptions,
      maxChars = options.maxTitleChars,
    ): { segments: Segment[]; key: string } {
      const strategy = audio.strategy as Strategy
      const segments = shapeForStrategy(text, strategy, maxChars)
      const key = cacheKey({
        strategy: audio.strategy,
        voiceRu: audio.voiceRu,
        voiceEn: audio.voiceEn,
        rate: audio.rate,
        pitch: audio.pitch,
        text: segments.map((s) => `${s.lang}:${s.text}`).join("|"),
      })
      return { segments, key }
    }

    function startSynthesis(segments: Segment[], key: string, audio: AudioOptions): Promise<string> {
      const existing = inflight.get(key)
      if (existing) return existing
      const promise = synthesize(audio, { segments, key }).finally(() => {
        inflight.delete(key)
      })
      inflight.set(key, promise)
      return promise
    }

    async function fileFor(
      segments: Segment[],
      key: string,
      audio: AudioOptions,
      waitMs = PREWARM_WAIT_MS,
    ): Promise<string> {
      const cached = cachedFile(key)
      if (cached) return cached
      const pending = inflight.get(key)
      if (pending) {
        const result = await withTimeout(pending, waitMs, "prewarmed speech")
        return cachedFile(key) ?? result
      }
      const fresh = startSynthesis(segments, key, audio)
      return withTimeout(fresh, waitMs, "speech synthesis")
    }

    function schedulePrewarm(key: string, segments: Segment[], audio: AudioOptions) {
      if (disposed) return
      if (cachedFile(key)) return
      const timer = debounces.get(key)
      if (timer) clearTimeout(timer)
      debounces.set(
        key,
        setTimeout(() => {
          debounces.delete(key)
          if (disposed) return
          startSynthesis(segments, key, audio).catch(() => {
            /* prewarm is best effort */
          })
        }, PREWARM_DEBOUNCE_MS),
      )
    }

    async function drainQueue() {
      if (draining || disposed) return
      draining = true
      try {
        while (!disposed && queue.length > 0) {
          const item = queue.shift()!
          let played = false
          try {
            const file = await fileFor(item.segments, item.key, item.audio, item.waitMs)
            if (disposed) break
            await withPlayLock(() => playAndWait(item.audio, file))
            played = true
          } catch (error) {
            if (options.fallbackSapi && !disposed) {
              console.warn("[voice-notify] edge-tts failed; using SAPI fallback", error)
              try {
                await withPlayLock(() => speakSapi(item.audio, item.text))
                played = true
              } catch {
                /* give up quietly */
              }
            }
          }
          item.done?.(played)
        }
      } finally {
        draining = false
        if (!disposed && queue.length > 0) void drainQueue()
      }
    }

    function enqueue(
      text: string,
      segments: Segment[],
      key: string,
      lockKey: string,
      priority: number,
      audio: AudioOptions,
      wait = false,
      waitMs = PREWARM_WAIT_MS,
    ): Promise<boolean> {
      if (disposed) return Promise.resolve(false)
      if (queue.some((item) => item.lockKey === lockKey)) return Promise.resolve(false)
      if (queue.length >= MAX_QUEUE) {
        const dropped = queue.shift()
        dropped?.done?.(false)
      }
      let resolveDone: ((ok: boolean) => void) | undefined
      const done = wait
        ? new Promise<boolean>((resolve) => {
            resolveDone = resolve
          })
        : undefined
      const item = { text, segments, key, lockKey, priority, audio, waitMs, done: resolveDone }
      const index = queue.findIndex((queued) => queued.priority < priority)
      if (index === -1) queue.push(item)
      else queue.splice(index, 0, item)
      void drainQueue()
      return done ?? Promise.resolve(true)
    }

    function announce(kind: Kind, sessionID: string, session: any, overrideTitle?: string) {
      if (disposed || !wanted(kind)) return
      if (session?.parentID && !options.subagents && kind !== "question" && kind !== "permission") return
      if (kind !== "question" && kind !== "permission") {
        const lastTool = toolSpoken.get(sessionID) ?? 0
        if (Date.now() - lastTool < 15000) return
      }
      const template = templateFor(kind)
      const text = buildText(session, template, overrideTitle)
      if (!text) return
      const audio = audioFor(sessionID)
      const { segments, key } = shapeFor(text, audio)
      const lockKey = `${sessionID}:${kind}:${key}`
      if (recentlyPlayed(lockKey)) return
      markPlayed(lockKey)

      const now = Date.now()
      const memoryKey = `${kind}:${key}`
      if (memoryKey === lastKey && now - lastPlayedAt < DUPLICATE_WINDOW_MS) return
      lastKey = memoryKey
      lastPlayedAt = now
      const priority = kind === "question" || kind === "permission" || kind === "failed" ? 1 : 0
      void enqueue(text, segments, key, lockKey, priority, audio)
    }

    async function handle(event: any) {
      const type = String(event?.type ?? "")
      const data = event?.data ?? {}
      const sessionID = data.sessionID

      if (type === KINDS.question) {
        const form = data.form
        if (!form?.sessionID) return
        const session = (await getSession(form.sessionID)) ?? data.session ?? data
        announce("question", form.sessionID, session, form.title ?? "нужен ответ")
        return
      }

      if (!sessionID) return

      if (type === "session.execution.started" || type === "session.renamed") {
        const session = (await getSession(sessionID)) ?? data.session ?? data
        if (type === "session.renamed" && data.title) session.title = data.title
        if (session?.parentID && !options.subagents) return
        const kind: Kind = session?.parentID ? "subagent" : "success"
        if (!wanted(kind)) return
        const text = buildText(session, templateFor(kind))
        if (!text) return
        const audio = audioFor(sessionID)
        const { segments, key } = shapeFor(text, audio)
        schedulePrewarm(key, segments, audio)
        return
      }

      if (type === KINDS.permission) {
        const action = String(data.action ?? "").trim()
        const resources = Array.isArray(data.resources)
          ? data.resources.filter((value: unknown) => typeof value === "string" && value.length > 0).slice(0, 2).join(", ")
          : ""
        const title = String(data.message ?? "").trim() || [action, resources].filter(Boolean).join(": ") || "разрешение"
        const session = (await getSession(sessionID)) ?? data.session ?? data
        announce("permission", sessionID, session, title)
        return
      }

      if (type === KINDS.retry) {
        const session = (await getSession(sessionID)) ?? data.session ?? data
        announce("retry", sessionID, session)
        return
      }

      const kind: Kind | undefined =
        type === KINDS.success
          ? "success"
          : type === KINDS.failed
            ? "failed"
            : type === KINDS.interrupted
              ? "interrupted"
              : undefined
      if (!kind) return

      const session = (await getSession(sessionID)) ?? data.session ?? data
      if (kind === "success" && session?.parentID) {
        announce("subagent", sessionID, session)
        return
      }
      announce(kind, sessionID, session)
    }

    async function speakText(
      rawText: string,
      sessionID: string,
      overrides: Partial<AudioOptions> = {},
      wait = false,
    ): Promise<{ ok: boolean; played: boolean; error?: string }> {
      if (disposed) return { ok: false, played: false, error: "plugin is disposed" }
      const text = preprocess(String(rawText ?? ""), options.maxToolChars)
      if (!text) return { ok: false, played: false, error: "empty text" }
      const audio = audioFor(sessionID, overrides)
      const { segments, key } = shapeFor(text, audio, options.maxToolChars)
      const lockKey = `tool:${sessionID}:${Date.now()}:${Math.random().toString(36).slice(2)}`
      toolSpoken.set(sessionID, Date.now())
      const ok = await enqueue(text, segments, key, lockKey, 2, audio, wait, 20000)
      return { ok, played: wait && ok, ...(ok ? {} : { error: "not queued" }) }
    }

    if (ctx.rpc && typeof ctx.rpc.register === "function") {
      try {
        const rpcRegistration = await ctx.rpc.register(VoiceNotifyRpc, {
          get: async () => currentSettings(),
          update: async (input: any) => applySettings((input ?? {}) as Partial<VoiceNotifySettings>),
          reset: async () => resetSettings(),
          test: async (input: any) => {
            const text =
              String(input?.text ?? "").trim() ||
              "Привет! Это проверка голоса Voice Notify."
            const voice =
              typeof input?.voice === "string" && input.voice.trim()
                ? input.voice.trim()
                : undefined
            const overrides: Partial<AudioOptions> = {}
            if (voice) {
              overrides.voiceRu = voice
              overrides.voiceEn = voice
            }
            try {
              const result = await speakText(text, "settings-test", overrides, false)
              return {
                ok: result.ok,
                queued: result.ok,
                ...(result.ok ? {} : { error: result.error ?? "not queued" }),
              }
            } catch (error) {
              return { ok: false, queued: false, error: String(error) }
            }
          },
        })
        if (rpcRegistration && typeof rpcRegistration.dispose === "function") {
          cleanups.push(() => rpcRegistration.dispose())
        }
      } catch (error) {
        console.warn("[voice-notify] settings RPC registration failed", error)
      }
    }

    try {
      const toolRegistration = await ctx.tool.transform((editor: any) => {
        editor.add({
          name: "speak",
          description:
            "Read text aloud through the local speakers using one of the configured Russian-capable voices " +
            "(Svetlana, Ava, Seraphina). Use when the user explicitly asks you to say, read, or announce " +
            "something out loud. Do not use it for every reply. English words are transliterated by default.",
          input: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description: "Text to read aloud. Markdown is stripped; up to 2000 characters.",
              },
              voice: {
                type: "string",
                enum: options.voicePool,
                description: "Optional voice from the configured pool. Default: the session's stable voice.",
              },
              variant: {
                type: "integer",
                minimum: 0,
                maximum: VOICE_VARIANTS.length - 1,
                description: "Optional voice variant (rate preset). Default: the session's stable variant.",
              },
              rate: {
                type: "string",
                description: "Optional rate override, e.g. '+0%' or '-10%'.",
              },
              pitch: {
                type: "string",
                description: "Optional pitch override, e.g. '+0Hz' or '-5Hz'.",
              },
              strategy: {
                type: "string",
                enum: ["auto", "whole", "cmu", "transliterate"],
                description:
                  "Text shaping strategy. Default: auto (native Russian voice → cmu, multilingual voice → whole).",
              },
              wait: {
                type: "boolean",
                description: "Wait until the clip finishes playing before returning. Default false.",
              },
            },
            required: ["text"],
            additionalProperties: false,
          },
          execute: async (input: any, toolContext: any) => {
            const text = String(input?.text ?? "")
            const sessionID = String(toolContext?.sessionID ?? "tool")
            const variantIndex = typeof input?.variant === "number" ? input.variant : undefined
            const session = sessionVoice(sessionID)
            const variant =
              variantIndex === undefined
                ? session
                : {
                    ...session,
                    ...VOICE_VARIANTS[Math.max(0, Math.min(VOICE_VARIANTS.length - 1, variantIndex))],
                  }
            const overrides: Partial<AudioOptions> = {
              rate: typeof input?.rate === "string" && input.rate.trim() ? input.rate.trim() : variant.rate,
              pitch: typeof input?.pitch === "string" && input.pitch.trim() ? input.pitch.trim() : variant.pitch,
            }
            if (typeof input?.voice === "string" && options.voicePool.includes(input.voice)) {
              overrides.voiceRu = input.voice
              overrides.voiceEn = input.voice
            }
            if (typeof input?.strategy === "string") overrides.strategy = input.strategy
            const result = await speakText(text, sessionID, overrides, input?.wait === true)
            if (!result.ok) return { content: `Speech failed: ${result.error ?? "unknown error"}` }
            return { content: result.played ? "Speech played." : "Speech queued." }
          },
        })
      })
      if (toolRegistration && typeof toolRegistration.dispose === "function") {
        cleanups.push(() => toolRegistration.dispose())
      }
    } catch (error) {
      console.warn("[voice-notify] speak tool registration failed", error)
    }

    const controller = new AbortController()
    const consuming = (async () => {
      for await (const event of ctx.event.subscribe({
        types: [...EVENT_NAMES],
        signal: controller.signal,
      })) {
        if (disposed) break
        try {
          await handle(event)
        } catch (error) {
          console.warn("[voice-notify] failed to handle event", error)
        }
      }
    })().catch((error) => {
      if (!controller.signal.aborted) console.warn("[voice-notify] event subscription failed", error)
    })

    cleanups.push(() => controller.abort())
    cleanups.push(() => consuming)
    cleanups.push(() => stopPlayback())
    cleanups.push(() => {
      for (const item of queue.splice(0)) item.done?.(false)
      toolSpoken.clear()
      for (const timer of debounces.values()) clearTimeout(timer)
      debounces.clear()
      inflight.clear()
    })

    try {
      pruneCache()
    } catch {
      /* ignore */
    }

    return async () => {
      disposed = true
      for (const cleanup of cleanups.splice(0)) {
        try {
          await cleanup()
        } catch {
          /* ignore */
        }
      }
    }
  },
}

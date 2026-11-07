// Audio layer: synthesis (edge-tts), hybrid concatenation (ffmpeg), playback
// (ffplay), the on-disk cache, and the SAPI fallback.
//
// Only Node built-ins are used. Every external process is spawned with an
// argument array and windowsHide, never through a shell string.

import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Segment } from "./speech.ts"

const HERE = (() => {
  const meta = import.meta as unknown as { dir?: string; url: string }
  if (typeof meta.dir === "string") return meta.dir
  return path.dirname(fileURLToPath(meta.url))
})()

export const PLUGIN_DIR = HERE
export const CACHE_DIR = path.join(PLUGIN_DIR, "cache")
export const ASSETS_DIR = path.join(PLUGIN_DIR, "assets")

const MAX_CACHE_FILES = 100
const SAMPLE_RATE = 24000
/** 50 ms of silence between hybrid segments reads more naturally. */
const GAP_MS = 50
/** Trim edge-tts leading/trailing padding down to this much. */
const HEAD_TAIL_MS = 40

export type AudioOptions = {
  python: string
  ffmpeg: string
  ffplay: string
  rate: string
  pitch: string
  volume: number
  fallbackSapi: boolean
  voiceRu: string
  voiceEn: string
  strategy: string
}

/** Prefer an explicit option, then the well-known install, then PATH. */
export function resolveBinary(candidate: string | undefined, fallbackPath: string, name: string): string {
  if (candidate && candidate.trim()) return candidate.trim()
  try {
    if (fs.existsSync(fallbackPath)) return fallbackPath
  } catch {
    /* ignore */
  }
  return name
}

export function defaultPython(): string {
  return resolveBinary(process.env.VOICE_NOTIFY_PYTHON, "C:\\Python310\\python.exe", "python")
}

export function defaultFfmpeg(): string {
  return resolveBinary(process.env.VOICE_NOTIFY_FFMPEG, "C:\\Users\\JustO\\ffmpeg\\bin\\ffmpeg.exe", "ffmpeg")
}

export function defaultFfplay(): string {
  return resolveBinary(process.env.VOICE_NOTIFY_FFPLAY, "C:\\Users\\JustO\\ffmpeg\\bin\\ffplay.exe", "ffplay")
}

type RunResult = { code: number; stdout: string; stderr: string }

function run(command: string, args: string[], timeoutMs = 30000, stdin?: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(command, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
    } catch (error) {
      reject(error)
      return
    }
    let stdout = ""
    let stderr = ""
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      reject(new Error(`${path.basename(command)} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.on("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr })
    })
    if (stdin !== undefined && child.stdin) {
      child.stdin.on("error", () => {})
      child.stdin.end(stdin, "utf8")
    } else {
      child.stdin?.end()
    }
  })
}

function ensureDir(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    /* ignore */
  }
}

export function cacheKey(parts: {
  strategy: string
  voiceRu: string
  voiceEn: string
  text: string
  rate?: string
  pitch?: string
}): string {
  return createHash("sha256")
    .update(
      `${parts.strategy}|${parts.voiceRu}|${parts.voiceEn}|${parts.rate ?? ""}|${parts.pitch ?? ""}|${parts.text}`,
    )
    .digest("hex")
}

export function cachePath(key: string): string {
  return path.join(CACHE_DIR, `${key}.mp3`)
}

export function cachedFile(key: string): string | null {
  const file = cachePath(key)
  try {
    const stat = fs.statSync(file)
    if (stat.size > 1024) {
      const now = new Date()
      try {
        fs.utimesSync(file, now, now)
      } catch {
        /* ignore */
      }
      return file
    }
  } catch {
    /* miss */
  }
  return null
}

/** Oldest-first eviction so the cache cannot grow without bound. */
export function pruneCache(max = MAX_CACHE_FILES) {
  try {
    ensureDir(CACHE_DIR)
    const entries = fs
      .readdirSync(CACHE_DIR)
      .filter((name) => name.endsWith(".mp3"))
      .map((name) => {
        const full = path.join(CACHE_DIR, name)
        try {
          return { full, mtime: fs.statSync(full).mtimeMs }
        } catch {
          return null
        }
      })
      .filter((entry): entry is { full: string; mtime: number } => entry !== null)
      .sort((a, b) => a.mtime - b.mtime)
    const excess = entries.length - max
    for (let i = 0; i < excess; i += 1) {
      try {
        fs.unlinkSync(entries[i].full)
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

const SYNTH_LOCK_FILE = path.join(CACHE_DIR, "synth.lock")
const LOCK_STALE_MS = 30000
const LOCK_WAIT_MS = 30000

/** Serialize edge-tts requests across plugin instances. */
async function withSynthLock<T>(fn: () => Promise<T>): Promise<T> {
  ensureDir(CACHE_DIR)
  const started = Date.now()
  let acquired = false
  while (!acquired) {
    try {
      const fd = fs.openSync(SYNTH_LOCK_FILE, "wx")
      try {
        fs.writeFileSync(fd, String(process.pid))
      } finally {
        fs.closeSync(fd)
      }
      acquired = true
    } catch {
      try {
        const stat = fs.statSync(SYNTH_LOCK_FILE)
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          try {
            fs.unlinkSync(SYNTH_LOCK_FILE)
          } catch {
            /* ignore */
          }
          continue
        }
      } catch {
        /* lock disappeared */
      }
      if (Date.now() - started >= LOCK_WAIT_MS) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  try {
    return await fn()
  } finally {
    if (acquired) {
      try {
        fs.unlinkSync(SYNTH_LOCK_FILE)
      } catch {
        /* ignore */
      }
    }
  }
}

async function synthOne(options: AudioOptions, voice: string, text: string, outFile: string): Promise<void> {
  ensureDir(path.dirname(outFile))
  const args = [
    "-m",
    "edge_tts",
    `--voice=${voice}`,
    `--text=${text}`,
    `--write-media=${outFile}`,
    `--rate=${options.rate}`,
  ]
  if (options.pitch && options.pitch !== "+0Hz" && options.pitch !== "0Hz") {
    args.push(`--pitch=${options.pitch}`)
  }
  args.push("--no-progress")

  let lastError = "unknown error"
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await withSynthLock(() => run(options.python, args, 30000))
    if (result.code === 0) {
      try {
        const stat = fs.statSync(outFile)
        if (stat.size > 0) return
        lastError = "edge-tts produced an empty file"
      } catch (error) {
        lastError = `edge-tts output missing: ${String(error)}`
      }
    } else {
      const detail = (result.stderr || result.stdout).trim().split("\n").slice(-3).join(" ").slice(0, 400)
      lastError = `edge-tts exited ${result.code}${detail ? `: ${detail}` : ""}`
    }
    try {
      fs.unlinkSync(outFile)
    } catch {
      /* ignore */
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
  }
  throw new Error(`edge-tts failed after 3 attempts: ${lastError}`)
}

/** Trim edge-tts' silence padding so concatenated segments do not drift apart. */
async function trimPadding(options: AudioOptions, src: string, dst: string): Promise<string> {
  const head = `silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:start_silence=${HEAD_TAIL_MS / 1000}`
  const filter = `${head},areverse,${head},areverse,aresample=${SAMPLE_RATE}`
  const result = await run(options.ffmpeg, ["-y", "-loglevel", "error", "-i", src, "-af", filter, "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", dst], 20000)
  if (result.code !== 0) {
    // Trimming is cosmetic: fall back to the untrimmed clip.
    try {
      fs.copyFileSync(src, dst)
    } catch {
      throw new Error(`ffmpeg trim failed: ${result.stderr.slice(0, 300)}`)
    }
  }
  return dst
}

async function makeSilence(options: AudioOptions, file: string): Promise<void> {
  const result = await run(options.ffmpeg, [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=${SAMPLE_RATE}:cl=mono`,
    "-t",
    String(GAP_MS / 1000),
    "-c:a",
    "libmp3lame",
    "-b:a",
    "48k",
    file,
  ], 15000)
  if (result.code !== 0) throw new Error(`ffmpeg silence failed: ${result.stderr.slice(0, 200)}`)
}

async function concatWithGaps(options: AudioOptions, parts: string[], outFile: string): Promise<void> {
  const silence = path.join(path.dirname(outFile), `silence-${GAP_MS}.mp3`)
  await makeSilence(options, silence)

  const args: string[] = []
  const labels: string[] = []
  let index = 0
  for (let i = 0; i < parts.length; i += 1) {
    args.push("-i", parts[i])
    labels.push(`[${index}:a]`)
    index += 1
    if (i < parts.length - 1) {
      args.push("-i", silence)
      labels.push(`[${index}:a]`)
      index += 1
    }
  }
  const filter = `${labels.join("")}concat=n=${labels.length}:v=0:a=1[out]`
  const result = await run(
    options.ffmpeg,
    [
      "-y",
      "-loglevel",
      "error",
      ...args,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      "1",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "64k",
      outFile,
    ],
    30000,
  )
  if (result.code !== 0) throw new Error(`ffmpeg concat failed: ${result.stderr.slice(0, 300)}`)
}

export async function durationMs(options: AudioOptions, file: string): Promise<number> {
  const result = await run(options.ffmpeg.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace(/ffmpeg/i, "ffprobe")), [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ], 10000)
  const value = Number.parseFloat(result.stdout.trim())
  return Number.isFinite(value) ? value * 1000 : 0
}

export type SynthRequest = {
  segments: Segment[]
  key: string
}

/**
 * Synthesize the shaped segments into the cache. Returns the playable file.
 * Writes to a temp file first so a crash cannot leave a truncated clip that
 * later looks like a cache hit.
 */
export async function synthesize(options: AudioOptions, request: SynthRequest): Promise<string> {
  ensureDir(CACHE_DIR)
  const finalFile = cachePath(request.key)
  const existing = cachedFile(request.key)
  if (existing) return existing

  const tempRoot = path.join(CACHE_DIR, `.tmp-${request.key.slice(0, 12)}-${process.pid}-${Date.now()}`)
  ensureDir(tempRoot)
  try {
    const spoken: string[] = []
    for (let i = 0; i < request.segments.length; i += 1) {
      const segment = request.segments[i]
      const voice = segment.lang === "en" ? options.voiceEn : options.voiceRu
      const raw = path.join(tempRoot, `part-${i}.mp3`)
      await synthOne(options, voice, segment.text, raw)
      const trimmed = await trimPadding(options, raw, path.join(tempRoot, `part-${i}-trim.mp3`))
      spoken.push(trimmed)
    }

    if (spoken.length === 0) throw new Error("nothing to speak")

    if (spoken.length === 1) {
      try {
        fs.copyFileSync(spoken[0], finalFile)
      } catch (error) {
        throw new Error(`could not write cache file: ${String(error)}`)
      }
    } else {
      const joined = path.join(tempRoot, "joined.mp3")
      await concatWithGaps(options, spoken, joined)
      try {
        fs.copyFileSync(joined, finalFile)
      } catch (error) {
        throw new Error(`could not write cache file: ${String(error)}`)
      }
    }

    const ms = await durationMs(options, finalFile)
    if (ms < 250) throw new Error(`synthesized audio is too short (${Math.round(ms)}ms)`)
    pruneCache()
    return finalFile
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ playback */

let currentPlayer: import("node:child_process").ChildProcess | null = null

/** Kill the previous notification so two clips never overlap. */
export function stopPlayback() {
  const player = currentPlayer
  currentPlayer = null
  if (!player) return
  try {
    player.kill()
  } catch {
    /* ignore */
  }
}

export function play(options: AudioOptions, file: string): void {
  stopPlayback()
  const volume = Math.max(0, Math.min(100, Math.round(options.volume * 100)))
  try {
    const child = spawn(options.ffplay, ["-nodisp", "-autoexit", "-loglevel", "quiet", "-volume", String(volume), file], {
      stdio: "ignore",
      windowsHide: true,
    })
    currentPlayer = child
    child.on("close", () => {
      if (currentPlayer === child) currentPlayer = null
    })
    child.on("error", () => {
      if (currentPlayer === child) currentPlayer = null
    })
  } catch {
    currentPlayer = null
  }
}

/** Play one clip and resolve when ffplay exits (or after `timeoutMs`). */
export function playAndWait(options: AudioOptions, file: string, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve) => {
    let child: import("node:child_process").ChildProcess | null = null
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const volume = Math.max(0, Math.min(100, Math.round(options.volume * 100)))

    const finish = () => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (currentPlayer === child) currentPlayer = null
      resolve()
    }

    try {
      child = spawn(
        options.ffplay,
        ["-nodisp", "-autoexit", "-loglevel", "quiet", "-volume", String(volume), file],
        { stdio: "ignore", windowsHide: true },
      )
      currentPlayer = child
      child.on("close", finish)
      child.on("error", finish)
    } catch {
      finish()
      return
    }

    timer = setTimeout(() => {
      try {
        child?.kill()
      } catch {
        /* ignore */
      }
      finish()
    }, timeoutMs)
    timer.unref?.()
  })
}

/** Windows SAPI fallback, used only when edge-tts synthesis fails. */
export async function speakSapi(options: AudioOptions, text: string): Promise<void> {
  const volume = Math.max(0, Math.min(100, Math.round(options.volume * 100)))
  // edge-tts rate is a percentage delta; SAPI wants -10..10.
  const rateDelta = Number.parseInt(options.rate.replace(/[^-\d]/g, ""), 10)
  const sapiRate = Number.isFinite(rateDelta) ? Math.max(-10, Math.min(10, Math.round(rateDelta / 10))) : 0
  const script = [
    "Add-Type -AssemblyName System.Speech",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    "try { $s.SelectVoice('Microsoft Irina Desktop') } catch { }",
    `$s.Volume = ${volume}`,
    `$s.Rate = ${sapiRate}`,
    "$t = [Console]::In.ReadToEnd()",
    "if ($t) { $s.Speak($t) }",
  ].join("; ")

  await new Promise<void>((resolve, reject) => {
    let child
    try {
      child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        windowsHide: true,
        stdio: ["pipe", "ignore", "ignore"],
      })
    } catch (error) {
      reject(error)
      return
    }
    child.on("error", reject)
    child.on("close", () => resolve())
    child.stdin?.on("error", () => {})
    child.stdin?.end(text, "utf8")
  })
}

export const paths = { PLUGIN_DIR, CACHE_DIR, ASSETS_DIR, MAX_CACHE_FILES }

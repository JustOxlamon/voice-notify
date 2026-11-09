// TUI settings for Voice Notify.
//
// OpenCode's built-in /settings dialog is a static core list, so a plugin
// cannot inject rows into it. This module adds the supported alternative: a
// first-class command with a small dialog-driven settings screen. The values
// live in the server plugin (settings.json) and are reached over RPC.

import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import {
  DEFAULT_VOICES,
  EVENT_LABELS,
  RATE_PRESETS,
  STRATEGY_LABELS,
  VOICE_NOTIFY_EVENTS,
  VoiceNotifyRpc,
  type VoiceNotifyEvent,
  type VoiceNotifySettings,
  type VoiceNotifyStrategy,
} from "./rpc.ts"

type SettingsApi = {
  get(input: Record<string, never>): Promise<VoiceNotifySettings>
  update(input: Partial<VoiceNotifySettings>): Promise<VoiceNotifySettings>
  test(input: { text?: string; voice?: string }): Promise<{ ok: boolean; queued: boolean; error?: string }>
  reset(input: Record<string, never>): Promise<VoiceNotifySettings>
}

type TemplateKey =
  | "template"
  | "templateFailed"
  | "templateInterrupted"
  | "templateQuestion"
  | "templatePermission"
  | "templateSubagent"
  | "templateRetry"

const TEMPLATE_FIELDS: ReadonlyArray<{ key: TemplateKey; title: string; description: string }> = [
  { key: "template", title: "Успех", description: "Готово: {title}" },
  { key: "templateFailed", title: "Ошибка", description: "Ошибка: {title}" },
  { key: "templateInterrupted", title: "Прервано", description: "Прервано: {title}" },
  { key: "templateQuestion", title: "Вопрос", description: "Вопрос: {title}" },
  { key: "templatePermission", title: "Разрешение", description: "Требуется разрешение: {title}" },
  { key: "templateSubagent", title: "Сабагент", description: "Сабагент готов: {title}" },
  { key: "templateRetry", title: "Повтор", description: "Повторная попытка: {title}" },
]

const VOICE_LABELS: Record<string, string> = {
  "ru-RU-SvetlanaNeural": "Svetlana",
  "en-US-AvaMultilingualNeural": "Ava",
  "de-DE-SeraphinaMultilingualNeural": "Seraphina",
}

const VOLUME_STEPS = Array.from({ length: 11 }, (_, index) => index / 10)

let opening = false

function api(context: Context): SettingsApi {
  return context.client.rpc(VoiceNotifyRpc as never) as unknown as SettingsApi
}

function textOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

function toastError(context: Context, error: unknown) {
  context.ui.toast.show({
    title: "Voice Notify",
    message: textOf(error),
    variant: "error",
    duration: 5000,
  })
}

function toast(context: Context, message: string, variant: "success" | "info" = "success") {
  context.ui.toast.show({ title: "Voice Notify", message, variant, duration: 3000 })
}

function voiceLabel(voice: string): string {
  return VOICE_LABELS[voice] ?? voice
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function currentVolume(settings: VoiceNotifySettings): number {
  return Math.max(0, Math.min(1, Math.round(settings.volume * 10) / 10))
}

function menuOptions(settings: VoiceNotifySettings) {
  return [
    {
      title: "События",
      value: "events",
      category: "Основное",
      description: `${settings.events.length} из ${VOICE_NOTIFY_EVENTS.length}: какие события озвучивать`,
    },
    {
      title: "Голоса",
      value: "voices",
      category: "Основное",
      description: settings.voicePool.map(voiceLabel).join(", ") || "пул не задан",
    },
    {
      title: "Громкость",
      value: "volume",
      category: "Основное",
      description: `${Math.round(currentVolume(settings) * 100)}%`,
    },
    {
      title: "Скорость",
      value: "rate",
      category: "Основное",
      description: settings.voiceVariants
        ? `${settings.rate} (переопределяется вариантом сессии)`
        : settings.rate,
    },
    {
      title: "Сабагенты",
      value: "subagents",
      category: "Поведение",
      description: settings.subagents ? "озвучиваются" : "не озвучиваются",
    },
    {
      title: "Разные голоса по сессиям",
      value: "voiceVariants",
      category: "Поведение",
      description: settings.voiceVariants ? "включено" : "выключено",
    },
    {
      title: "SAPI fallback",
      value: "fallbackSapi",
      category: "Поведение",
      description: settings.fallbackSapi ? "включён" : "выключен",
    },
    {
      title: "Стратегия текста",
      value: "strategy",
      category: "Поведение",
      description: STRATEGY_LABELS[settings.strategy]?.title ?? settings.strategy,
    },
    {
      title: "Фразы",
      value: "phrases",
      category: "Текст",
      description: "Шаблоны объявлений: {title}, {project}, {directory}",
    },
    {
      title: "Лимиты",
      value: "limits",
      category: "Текст",
      description: `Заголовок ${settings.maxTitleChars}, инструмент ${settings.maxToolChars}`,
    },
    {
      title: "Проверить голос",
      value: "test",
      category: "Сервис",
      description: "Проиграть короткий пример",
    },
    {
      title: "Сбросить настройки",
      value: "reset",
      category: "Сервис",
      description: "Вернуть значения из конфигурации плагина",
    },
  ] as const
}

async function editEvents(context: Context, settings: VoiceNotifySettings): Promise<VoiceNotifySettings> {
  let current = settings
  while (true) {
    const choice = await context.ui.dialog.select<VoiceNotifyEvent | "back">({
      title: "События",
      placeholder: "Какие события озвучивать",
      options: [
        ...VOICE_NOTIFY_EVENTS.map((id) => {
          const enabled = current.events.includes(id)
          return {
            title: `[${enabled ? "x" : " "}] ${EVENT_LABELS[id].title}`,
            value: id,
            description: EVENT_LABELS[id].description,
          }
        }),
        { title: "← Назад", value: "back", description: "Вернуться в настройки" },
      ],
    })
    if (choice === undefined || choice === "back") return current
    const enabled = current.events.includes(choice)
    if (enabled && current.events.length <= 1) {
      toastError(context, "Должно остаться хотя бы одно событие")
      continue
    }
    current = await api(context).update({
      events: enabled ? current.events.filter((id) => id !== choice) : [...current.events, choice],
    })
  }
}

async function editVoices(context: Context, settings: VoiceNotifySettings): Promise<VoiceNotifySettings> {
  let current = settings
  while (true) {
    const voices = unique([...DEFAULT_VOICES, ...current.voicePool])
    const choice = await context.ui.dialog.select<string>({
      title: "Голоса",
      placeholder: "Пул голосов для разных сессий",
      options: [
        ...voices.map((voice) => {
          const enabled = current.voicePool.includes(voice)
          return {
            title: `[${enabled ? "x" : " "}] ${voiceLabel(voice)}`,
            value: voice,
            description: voice,
          }
        }),
        { title: "Добавить голос…", value: "__add", description: "Ввести имя голоса edge-tts вручную" },
        { title: "← Назад", value: "__back", description: "Вернуться в настройки" },
      ],
    })
    if (choice === undefined || choice === "__back") return current
    if (choice === "__add") {
      const voice = await context.ui.dialog.prompt({
        title: "Добавить голос",
        description: "Имя голоса edge-tts, например ru-RU-DariyaNeural",
        placeholder: "ru-RU-DariyaNeural",
      })
      const trimmed = voice?.trim()
      if (!trimmed) continue
      if (current.voicePool.includes(trimmed)) {
        toastError(context, "Этот голос уже в пуле")
        continue
      }
      current = await api(context).update({ voicePool: [...current.voicePool, trimmed] })
      continue
    }
    const enabled = current.voicePool.includes(choice)
    if (enabled && current.voicePool.length <= 1) {
      toastError(context, "В пуле должен остаться хотя бы один голос")
      continue
    }
    current = await api(context).update({
      voicePool: enabled ? current.voicePool.filter((voice) => voice !== choice) : [...current.voicePool, choice],
    })
  }
}

async function editVolume(context: Context, settings: VoiceNotifySettings): Promise<void> {
  const choice = await context.ui.dialog.select<number>({
    title: "Громкость",
    options: VOLUME_STEPS.map((value) => ({
      title: `${Math.round(value * 100)}%`,
      value,
      description: value === currentVolume(settings) ? "текущая" : undefined,
    })),
  })
  if (choice === undefined) return
  await api(context).update({ volume: choice })
}

async function editRate(context: Context, settings: VoiceNotifySettings): Promise<void> {
  const choice = await context.ui.dialog.select<string>({
    title: "Скорость",
    description: "Используется, когда разные варианты по сессиям выключены",
    options: RATE_PRESETS.map((value) => ({
      title: value,
      value,
      description: value === settings.rate ? "текущая" : undefined,
    })),
  })
  if (choice === undefined) return
  await api(context).update({ rate: choice })
}

async function editStrategy(context: Context, settings: VoiceNotifySettings): Promise<void> {
  const choice = await context.ui.dialog.select<VoiceNotifyStrategy>({
    title: "Стратегия текста",
    options: (Object.keys(STRATEGY_LABELS) as VoiceNotifyStrategy[]).map((value) => ({
      title: STRATEGY_LABELS[value].title,
      value,
      description: STRATEGY_LABELS[value].description,
    })),
  })
  if (choice === undefined) return
  await api(context).update({ strategy: choice })
}

async function editPhrases(context: Context, settings: VoiceNotifySettings): Promise<void> {
  const choice = await context.ui.dialog.select<TemplateKey | "back">({
    title: "Фразы",
    placeholder: "Шаблон объявления",
    options: [
      ...TEMPLATE_FIELDS.map((field) => ({
        title: field.title,
        value: field.key,
        description: settings[field.key],
      })),
      { title: "← Назад", value: "back", description: "Вернуться в настройки" },
    ],
  })
  if (choice === undefined || choice === "back") return
  const field = TEMPLATE_FIELDS.find((item) => item.key === choice)
  if (!field) return
  const value = await context.ui.dialog.prompt({
    title: `Фраза: ${field.title}`,
    description: "Доступны {title}, {project}, {directory}",
    value: settings[field.key],
    placeholder: field.description,
  })
  if (value === undefined) return
  const trimmed = value.trim()
  if (!trimmed) {
    toastError(context, "Фраза не может быть пустой")
    return
  }
  await api(context).update({ [field.key]: trimmed } as Partial<VoiceNotifySettings>)
}

async function editLimits(context: Context, settings: VoiceNotifySettings): Promise<void> {
  const title = await context.ui.dialog.prompt({
    title: "Лимит заголовка",
    description: "Максимум символов в автоматической фразе",
    value: String(settings.maxTitleChars),
  })
  if (title === undefined) return
  const titleChars = Number.parseInt(title, 10)
  if (!Number.isFinite(titleChars) || titleChars < 20) {
    toastError(context, "Лимит заголовка должен быть не меньше 20")
    return
  }
  const tool = await context.ui.dialog.prompt({
    title: "Лимит текста инструмента",
    description: "Максимум символов для speak",
    value: String(settings.maxToolChars),
  })
  if (tool === undefined) return
  const toolChars = Number.parseInt(tool, 10)
  if (!Number.isFinite(toolChars) || toolChars < 100) {
    toastError(context, "Лимит инструмента должен быть не меньше 100")
    return
  }
  await api(context).update({ maxTitleChars: titleChars, maxToolChars: toolChars })
}

async function testVoice(context: Context, settings: VoiceNotifySettings): Promise<void> {
  const choice = await context.ui.dialog.select<string>({
    title: "Проверить голос",
    options: [
      ...settings.voicePool.map((voice) => ({
        title: voiceLabel(voice),
        value: voice,
        description: voice,
      })),
      { title: "← Назад", value: "__back" },
    ],
  })
  if (choice === undefined || choice === "__back") return
  const result = await api(context).test({
    text: "Привет! Это проверка голоса Voice Notify.",
    voice: choice,
  })
  if (!result.ok) {
    toastError(context, result.error ?? "не удалось поставить тест в очередь")
    return
  }
  toast(context, `Тест поставлен в очередь: ${voiceLabel(choice)}`)
}

async function reset(context: Context): Promise<boolean> {
  const confirmed = await context.ui.dialog.confirm({
    title: "Сбросить настройки?",
    message: "Будут удалены переопределения, сохранённые из этого экрана.",
    label: { confirm: "Сбросить", cancel: "Отмена" },
  })
  if (!confirmed) return false
  await api(context).reset({})
  toast(context, "Настройки сброшены")
  return true
}

async function openSettings(context: Context) {
  if (opening) return
  opening = true
  try {
    while (true) {
      let settings: VoiceNotifySettings
      try {
        settings = await api(context).get({})
      } catch (error) {
        toastError(context, `Сервер Voice Notify недоступен: ${textOf(error)}`)
        return
      }

      const choice = await context.ui.dialog.select<string>({
        title: "Voice Notify",
        placeholder: "Настройки озвучки",
        options: menuOptions(settings),
      })
      if (choice === undefined) return

      try {
        switch (choice) {
          case "events":
            await editEvents(context, settings)
            break
          case "voices":
            await editVoices(context, settings)
            break
          case "volume":
            await editVolume(context, settings)
            break
          case "rate":
            await editRate(context, settings)
            break
          case "subagents":
            await api(context).update({ subagents: !settings.subagents })
            break
          case "voiceVariants":
            await api(context).update({ voiceVariants: !settings.voiceVariants })
            break
          case "fallbackSapi":
            await api(context).update({ fallbackSapi: !settings.fallbackSapi })
            break
          case "strategy":
            await editStrategy(context, settings)
            break
          case "phrases":
            await editPhrases(context, settings)
            break
          case "limits":
            await editLimits(context, settings)
            break
          case "test":
            await testVoice(context, settings)
            break
          case "reset":
            if (await reset(context)) return
            break
        }
      } catch (error) {
        toastError(context, error)
      }
    }
  } finally {
    opening = false
  }
}

export default Plugin.define({
  id: "voice-notify.tui",
  setup(context: Context) {
    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "voice-notify.settings",
          title: "Voice Notify: настройки",
          description: "Голоса, события, громкость и фразы озвучки",
          group: "Voice Notify",
          palette: true,
          suggested: true,
          slash: { name: "voice-notify" },
          run: () => openSettings(context),
        },
      ],
    }))
  },
})

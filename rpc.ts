// Shared contract between the Voice Notify server plugin and its TUI settings
// screen. The contract is intentionally dependency-free: the server bundle and
// the TUI loader can both import this file without pulling in OpenCode internals.

export const VOICE_NOTIFY_EVENTS = [
  "success",
  "failed",
  "interrupted",
  "question",
  "permission",
  "subagent",
  "retry",
] as const

export type VoiceNotifyEvent = (typeof VOICE_NOTIFY_EVENTS)[number]

export type VoiceNotifyStrategy = "auto" | "whole" | "hybrid" | "transliterate" | "cmu"

export type VoiceNotifySettings = {
  events: VoiceNotifyEvent[]
  subagents: boolean
  voicePool: string[]
  voiceVariants: boolean
  rate: string
  volume: number
  fallbackSapi: boolean
  strategy: VoiceNotifyStrategy
  template: string
  templateFailed: string
  templateInterrupted: string
  templateQuestion: string
  templatePermission: string
  templateSubagent: string
  templateRetry: string
  maxTitleChars: number
  maxToolChars: number
}

export const DEFAULT_VOICES = [
  "ru-RU-SvetlanaNeural",
  "en-US-AvaMultilingualNeural",
  "de-DE-SeraphinaMultilingualNeural",
] as const

export const RATE_PRESETS = ["-7%", "-5%", "-3%", "-1%", "+0%", "+1%", "+3%", "+5%"] as const

export const EVENT_LABELS: Record<VoiceNotifyEvent, { title: string; description: string }> = {
  success: { title: "Ход завершён", description: "Основная сессия закончила ответ" },
  failed: { title: "Ошибка", description: "Ход завершился с ошибкой" },
  interrupted: { title: "Прервано", description: "Ход был прерван" },
  question: { title: "Вопрос", description: "Агенту нужен ответ пользователя" },
  permission: { title: "Разрешение", description: "Запрошено подтверждение действия" },
  subagent: { title: "Сабагент готов", description: "Дочерняя сессия завершилась" },
  retry: { title: "Повтор", description: "Запланирована повторная попытка" },
}

export const STRATEGY_LABELS: Record<VoiceNotifyStrategy, { title: string; description: string }> = {
  auto: {
    title: "Авто",
    description: "Русский голос — CMU, мультиязычный — обычный текст",
  },
  whole: { title: "Целиком", description: "Отдать текст голосу без транслитерации" },
  cmu: { title: "CMU", description: "Английские слова транслитерировать в кириллицу" },
  transliterate: { title: "Транслитерация", description: "Упрощённая русская транслитерация" },
  hybrid: { title: "Гибрид", description: "Разбивать текст на русские и английские сегменты" },
}

const settingsProperties = {
  events: {
    type: "array",
    items: { type: "string", enum: [...VOICE_NOTIFY_EVENTS] },
    uniqueItems: true,
  },
  subagents: { type: "boolean" },
  voicePool: { type: "array", items: { type: "string" }, minItems: 1 },
  voiceVariants: { type: "boolean" },
  rate: { type: "string" },
  volume: { type: "number", minimum: 0, maximum: 1 },
  fallbackSapi: { type: "boolean" },
  strategy: {
    type: "string",
    enum: ["auto", "whole", "hybrid", "transliterate", "cmu"],
  },
  template: { type: "string" },
  templateFailed: { type: "string" },
  templateInterrupted: { type: "string" },
  templateQuestion: { type: "string" },
  templatePermission: { type: "string" },
  templateSubagent: { type: "string" },
  templateRetry: { type: "string" },
  maxTitleChars: { type: "integer", minimum: 20 },
  maxToolChars: { type: "integer", minimum: 100 },
} as const

const settingsRequired = Object.keys(settingsProperties)

const SettingsSchema = {
  type: "object",
  properties: settingsProperties,
  required: settingsRequired,
  additionalProperties: false,
} as const

const SettingsPatchSchema = {
  type: "object",
  properties: settingsProperties,
  additionalProperties: false,
} as const

const EmptyInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const

const TestInputSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    voice: { type: "string" },
  },
  additionalProperties: false,
} as const

const TestOutputSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    queued: { type: "boolean" },
    error: { type: "string" },
  },
  required: ["ok", "queued"],
  additionalProperties: false,
} as const

/**
 * Plain JSON-schema contract. Keeping it as data means the server bundle does
 * not need a runtime import from @opencode/plugin/rpc.
 */
export const VoiceNotifyRpc = {
  id: "voice-notify",
  methods: {
    get: {
      input: EmptyInputSchema,
      output: SettingsSchema,
    },
    update: {
      input: SettingsPatchSchema,
      output: SettingsSchema,
    },
    test: {
      input: TestInputSchema,
      output: TestOutputSchema,
    },
    reset: {
      input: EmptyInputSchema,
      output: SettingsSchema,
    },
  },
  events: {},
} as const

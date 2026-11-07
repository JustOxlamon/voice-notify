// English → Russian practical transcription for the single-voice strategy.
//
// CMUdict gives ARPAbet phonemes; edge-tts cannot consume phonemes directly,
// so we turn them into Cyrillic text and let Svetlana read that. Stress digits
// become combining acute accents on the stressed vowel.
//
// This is a heuristic, not a linguistic standard. Known tech terms and
// acronyms are overridden explicitly; unknown words fall back to their Latin
// spelling, which Svetlana reads with Russian letter-to-sound rules.

import { dictionary } from "./vendor/cmudict.js"

const ACRONYMS: Record<string, string> = {
  api: "эй пи ай",
  pr: "пи ар",
  cli: "си эл ай",
  tui: "ти ю ай",
  ui: "ю ай",
  url: "ю ар эл",
  http: "эйч ти ти пи",
  https: "эйч ти ти пи эс",
  json: "джейсон",
  yaml: "ямл",
  yml: "ямл",
  sql: "эс кью эл",
  css: "си эс эс",
  html: "эйч ти эм эл",
  js: "джей эс",
  ts: "ти эс",
  npm: "эн пи эм",
  gpt: "джи пи ти",
  ai: "эй ай",
  ml: "эм эл",
  llm: "эл эл эм",
  ssh: "эс эс эйч",
  tcp: "ти си пи",
  udp: "ю ди пи",
  dns: "ди эн эс",
  cdn: "си ди эн",
  aws: "эй даблю эс",
  gcp: "джи си пи",
  s3: "эс три",
  ids: "ай ди эс",
  ide: "ай ди и",
  sdk: "эс ди кей",
  orm: "о ар эм",
  jwt: "джей даблю ти",
  uuid: "ю ю ай ди",
  cpu: "си пи ю",
  gpu: "джи пи ю",
  ssd: "эс эс ди",
  usb: "ю эс би",
  pdf: "пи ди эф",
  csv: "си эс ви",
  xml: "экс эм эл",
  toml: "томл",
  wsl: "вэ эс эл",
  rtc: "ар ти си",
  rpc: "ар пи си",
  grpc: "джи ар пи си",
  graphql: "граф кью эл",
}

const OVERRIDES: Record<string, string> = {
  opencode: "оупенкоуд",
  typescript: "тайпскрипт",
  javascript: "джаваскрипт",
  github: "гитхаб",
  gitlab: "гитлаб",
  webhook: "вебхук",
  websocket: "вебсокет",
  frontend: "фронтенд",
  backend: "бэкенд",
  runtime: "рантайм",
  kubernetes: "кубернетес",
  nginx: "энджинкс",
  oauth: "о аут",
  refactor: "рефактор",
  refactoring: "рефакторинг",
  manager: "менеджер",
  deploy: "деплой",
  deployment: "деплоймент",
  token: "токен",
  postgres: "постгрес",
  postgresql: "постгрес кью эл",
  mongodb: "монго ди би",
  sqlite: "эс кью лайт",
  redis: "редис",
  node: "нод",
  react: "реакт",
  vue: "вью",
  angular: "ангуляр",
  svelte: "свелт",
  linux: "линукс",
  windows: "виндоус",
  macos: "макос",
  ios: "ай ос",
  openai: "оупен эй ай",
  anthropic: "антропик",
  claude: "клод",
  gemini: "джемини",
  deepseek: "дипсик",
  qwen: "квен",
  llama: "лама",
  mistral: "мистраль",
  ollama: "оллама",
  ffmpeg: "эф эф эм пэг",
  ffplay: "эф эф плэй",
  powershell: "пауэршелл",
  zsh: "зэш",
  readme: "редими",
  constructor: "конструктор",
  prototype: "прототип",
  function: "функция",
  method: "метод",
  class: "класс",
  object: "объект",
  array: "эррей",
  string: "стринг",
  boolean: "булиан",
  integer: "интеджер",
  variable: "вэриабл",
  parameter: "параметр",
  argument: "аргумент",
  config: "конфиг",
  configuration: "конфигурация",
  server: "сервер",
  client: "клиент",
  response: "респонс",
  error: "эррор",
  schema: "схема",
  migration: "миграция",
  module: "модуль",
  package: "пакет",
  library: "лайбрари",
  environment: "инвайронмент",
  development: "девелопмент",
  branch: "брэнч",
  rebase: "ребейс",
  release: "релиз",
  version: "версия",
  auth: "аут",
  authentication: "аутентификация",
  authorization: "авторизация",
  credentials: "креденшлс",
  secret: "сикрет",
  database: "дейтабейс",
  query: "квери",
}

const LETTER_NAMES: Record<string, string> = {
  a: "эй",
  b: "би",
  c: "си",
  d: "ди",
  e: "и",
  f: "эф",
  g: "джи",
  h: "эйч",
  i: "ай",
  j: "джей",
  k: "кей",
  l: "эл",
  m: "эм",
  n: "эн",
  o: "оу",
  p: "пи",
  q: "кью",
  r: "ар",
  s: "эс",
  t: "ти",
  u: "ю",
  v: "ви",
  w: "даблю",
  x: "экс",
  y: "уай",
  z: "зед",
}

const VOWELS: Record<string, string> = {
  AA: "а",
  AE: "э",
  AH: "а",
  AO: "о",
  AW: "ау",
  AY: "ай",
  EH: "э",
  ER: "ер",
  EY: "эй",
  IH: "и",
  IY: "и",
  OW: "оу",
  OY: "ой",
  UH: "у",
  UW: "у",
}

/**
 * Artificial stress marks make Svetlana sound mechanical, so they are off by
 * default. The engine assigns Russian stress itself from the Cyrillic text.
 */
const USE_STRESS_MARKS = false

const CONSONANTS: Record<string, string> = {
  B: "б",
  CH: "ч",
  D: "д",
  DH: "з",
  F: "ф",
  G: "г",
  HH: "х",
  JH: "дж",
  K: "к",
  L: "л",
  M: "м",
  N: "н",
  NG: "нг",
  P: "п",
  R: "р",
  S: "с",
  SH: "ш",
  T: "т",
  TH: "с",
  V: "в",
  W: "в",
  Y: "й",
  Z: "з",
  ZH: "ж",
}

type Phone = { base: string; stress: string }

function isVowelBase(base: string): boolean {
  return Object.prototype.hasOwnProperty.call(VOWELS, base)
}

function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined
}

function parsePhones(arpabet: string): Phone[] {
  const phones: Phone[] = []
  for (const raw of arpabet.trim().split(/\s+/)) {
    const match = raw.match(/^([A-Z]+)([012])?$/)
    if (match) phones.push({ base: match[1], stress: match[2] ?? "" })
  }
  return phones
}

function cyrillicFromPhones(phones: Phone[]): string {
  let out = ""
  for (let index = 0; index < phones.length; index += 1) {
    const phone = phones[index]
    const previous = phones[index - 1]
    const next = phones[index + 1]

    // "queue", "cute", "you": Y + UW is a /ju/ glide, not "й" + "у".
    if (phone.base === "Y" && next?.base === "UW") {
      out += out.length > 0 ? "ью" : "ю"
      index += 1
      continue
    }

    if (isVowelBase(phone.base)) {
      const previousConsonant = previous !== undefined && !isVowelBase(previous.base)
      const nextConsonant = next !== undefined && !isVowelBase(next.base)
      let syllable = VOWELS[phone.base]

      if (phone.base === "AH" && phone.stress === "0") {
        syllable = previousConsonant && nextConsonant ? "е" : "а"
      }
      if (phone.base === "EH") {
        syllable = previousConsonant ? "е" : "э"
      }
      if (phone.base === "ER") {
        syllable = phone.stress === "1" ? "ёр" : "ер"
      }
      if (USE_STRESS_MARKS && phone.stress === "1" && phone.base !== "ER") {
        syllable = `${syllable[0]}\u0301${syllable.slice(1)}`
      }
      out += syllable
    } else {
      out += CONSONANTS[phone.base] ?? ""
    }
  }
  return out
}

function spellAcronym(word: string): string {
  return [...word.toLowerCase()]
    .map((letter) => LETTER_NAMES[letter] ?? letter)
    .join(" ")
}

function splitCamel(word: string): string[] {
  return word
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean)
}

function isRussianOrDigits(text: string): boolean {
  return text.length > 0 && !/[A-Za-z]/.test(text)
}

function lookupWord(raw: string): string {
  const word = raw.trim()
  if (!word) return ""

  const possessive = word.match(/^([A-Za-z][A-Za-z0-9]*)['’]s$/)
  if (possessive) return `${lookupWord(possessive[1])}с`

  const lower = word.toLowerCase()
  const acronym = own(ACRONYMS, lower)
  if (acronym) return acronym
  const override = own(OVERRIDES, lower)
  if (override) return override

  const trailingDigits = word.match(/^([A-Za-z][A-Za-z]*)(\d+)$/)
  if (trailingDigits) return `${lookupWord(trailingDigits[1])}${trailingDigits[2]}`

  const entry = own(dictionary, lower)
  if (entry) return cyrillicFromPhones(parsePhones(entry))

  // Unknown all-caps token: spell it. Short ones are usually acronyms.
  if (/^[A-Z]{2,5}$/.test(word)) return spellAcronym(word)

  const camel = splitCamel(word)
  if (camel.length > 1) {
    const parts = camel.map(lookupWord)
    if (parts.every(isRussianOrDigits)) return parts.join(" ")
  }

  const pieces = word.split(/[._-]+/).filter(Boolean)
  if (pieces.length > 1) {
    const parts = pieces.map(lookupWord)
    if (parts.every(isRussianOrDigits)) return parts.join(" ")
  }

  // Try a two-word compound: type+script, front+end, web+hook, etc.
  for (let split = 3; split <= lower.length - 2; split += 1) {
    const left = lower.slice(0, split)
    const right = lower.slice(split)
    if (own(dictionary, left) === undefined && own(OVERRIDES, left) === undefined) continue
    if (own(dictionary, right) === undefined && own(OVERRIDES, right) === undefined) continue
    const leftText = lookupWord(left)
    const rightText = lookupWord(right)
    if (isRussianOrDigits(leftText) && isRussianOrDigits(rightText)) return leftText + rightText
  }

  // Unknown word: keep the Latin spelling and let Svetlana read it.
  return word
}

function truncateAtWord(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(" ")
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim()
}

/** Convert English runs inside a Russian phrase into practical Cyrillic. */
export function transcribeCmu(raw: string, maxChars: number): string {
  let text = String(raw ?? "")

  text = text.replace(/[A-Za-z][A-Za-z0-9]*(?:['’][A-Za-z]+)?/g, (word) => lookupWord(word))

  // Tokens like 3D or 4K: keep the number, transcribe the letter part.
  text = text.replace(/\b(\d+)\s*([A-Za-z][A-Za-z0-9]*)\b/g, (_match, digits: string, word: string) => {
    return `${digits} ${lookupWord(word)}`
  })

  text = text.replace(/\s+/g, " ").trim()
  return truncateAtWord(text, maxChars)
}

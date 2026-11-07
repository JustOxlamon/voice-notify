// Text shaping for the voice notification.
//
// Everything here is pure: no I/O, no timers. Given the same session and the
// same options it produces the same spoken text, which keeps the synthesis
// cache key stable across prewarm and playback.

import { transcribeCmu } from "./cmu.ts"

export type Strategy = "whole" | "hybrid" | "transliterate" | "cmu"

export type Segment = { lang: "ru" | "en"; text: string }

const CYRILLIC = /[\u0400-\u04FF]/
const LATIN = /[A-Za-z]/

/** Phrases that read badly when handed to a Russian voice. Longest first. */
const TECH_LEXICON: Array<[string, string]> = [
  ["pull request", "пул реквест"],
  ["pull requests", "пул реквесты"],
  ["open code", "оупен код"],
  ["opencode", "оупен код"],
  ["typescript", "тайпскрипт"],
  ["javascript", "джаваскрипт"],
  ["github", "гитхаб"],
  ["gitlab", "гитлаб"],
  ["ffmpeg", "эф-эф-эм-пэг"],
  ["ffplay", "эф-эф-плэй"],
  ["docker", "докер"],
  ["kubernetes", "кубернетес"],
  ["python", "пайтон"],
  ["windows", "виндоус"],
  ["linux", "линукс"],
  ["refactor", "рефакторинг"],
  ["refactoring", "рефакторинг"],
  ["repository", "репозиторий"],
  ["database", "база данных"],
  ["frontend", "фронтенд"],
  ["backend", "бэкенд"],
  ["endpoint", "эндпоинт"],
  ["manager", "менеджер"],
  ["timeout", "таймаут"],
  ["component", "компонент"],
  ["review", "ревью"],
  ["feature", "фича"],
  ["release", "релиз"],
  ["session", "сессия"],
  ["plugin", "плагин"],
  ["commit", "коммит"],
  ["deploy", "деплой"],
  ["merge", "мёрдж"],
  ["branch", "ветка"],
  ["issue", "ишью"],
  ["token", "токен"],
  ["cache", "кэш"],
  ["config", "конфиг"],
  ["server", "сервер"],
  ["client", "клиент"],
  ["build", "билд"],
  ["tests", "тесты"],
  ["test", "тест"],
  ["fix", "фикс"],
  ["update", "апдейт"],
  ["module", "модуль"],
  ["api", "эй-пи-ай"],
  ["pr", "пи-ар"],
  ["ui", "ю-ай"],
  ["tui", "ти-ю-ай"],
  ["cli", "си-эл-ай"],
  ["bug", "баг"],
  ["docs", "доки"],
  ["npm", "эн-пи-эм"],
  ["git", "гит"],
  ["repo", "репа"],
]

const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2B00}-\u{2BFF}]/gu

/** Strip markdown, emoji and characters that confuse the TTS engine. */
export function preprocess(raw: string, maxChars: number): string {
  let text = String(raw ?? "")
  // Fenced code blocks and inline code: drop the fences, keep the words.
  text = text.replace(/```[\s\S]*?```/g, " ")
  text = text.replace(/`([^`]*)`/g, "$1")
  // Images -> alt text, links -> label.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  // Headings, quotes, list bullets, emphasis.
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "")
  text = text.replace(/^\s{0,3}>\s?/gm, "")
  text = text.replace(/^\s{0,3}[-*+]\s+/gm, "")
  text = text.replace(/(\*\*|__|\*|~~)/g, "")
  // Emoji and pictographs.
  text = text.replace(EMOJI, " ")
  // Symbols the engine reads as pauses or noise.
  text = text.replace(/[_./\\|#@^~<>{}[\]]/g, " ")
  text = text.replace(/[«»"]/g, " ")
  // Collapse whitespace.
  text = text.replace(/\s+/g, " ").trim()
  if (text.length > maxChars) {
    const cut = text.slice(0, maxChars)
    const lastSpace = cut.lastIndexOf(" ")
    text = (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim()
  }
  // Do not leave a dangling separator behind after truncation.
  return text.replace(/[\s,;:—-]+$/u, "").trim()
}

/** Replace known English tech words with Russian phonetic equivalents. */
export function transliterate(text: string, maxChars: number): string {
  let out = text
  for (const [term, replacement] of TECH_LEXICON) {
    const pattern = new RegExp(`(?<![\\p{L}\\d])${escapeRegExp(term)}(?![\\p{L}\\d])`, "giu")
    out = out.replace(pattern, replacement)
  }
  out = out.replace(/\s+/g, " ").trim()
  return out.length > maxChars ? preprocess(out, maxChars) : out
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Split into maximal Cyrillic / Latin runs. Digits, punctuation and spaces
 * attach to the run they appear in, so "pull request #42" stays one English
 * chunk instead of being broken around the number.
 */
export function splitSegments(text: string): Segment[] {
  const raw: Segment[] = []
  let current = ""
  let currentLang: "ru" | "en" | null = null

  for (const char of text) {
    const lang = CYRILLIC.test(char) ? "ru" : LATIN.test(char) ? "en" : null
    if (lang && currentLang && lang !== currentLang) {
      raw.push({ lang: currentLang, text: current })
      current = char
      currentLang = lang
    } else {
      current += char
      if (lang) currentLang = lang
    }
  }
  if (current.trim()) raw.push({ lang: currentLang ?? "ru", text: current })

  const segments: Segment[] = []
  for (const segment of raw) {
    // Trim separators that ended up at the seam between two runs.
    const text = segment.text.replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/gu, "").trim()
    if (!text) continue
    if (!CYRILLIC.test(text) && !LATIN.test(text)) {
      // Pure digits / punctuation run: glue it onto the previous segment so it
      // is spoken by the same voice instead of becoming its own clip.
      if (segments.length > 0) segments[segments.length - 1].text += " " + text
      continue
    }
    segments.push({ lang: segment.lang, text })
  }
  return segments
}

/** The exact text handed to a voice for a given strategy. */
export function shapeForStrategy(text: string, strategy: Strategy, maxChars: number): Segment[] {
  if (strategy === "hybrid") return splitSegments(text)
  if (strategy === "transliterate") {
    return [{ lang: "ru", text: transliterate(text, maxChars) }]
  }
  if (strategy === "cmu") {
    return [{ lang: "ru", text: transcribeCmu(text, maxChars) }]
  }
  return [{ lang: "ru", text }]
}

/** basename without a node:path import, tolerant of both separators. */
export function basename(input: string | undefined | null): string {
  const value = String(input ?? "").replace(/[\\/]+$/, "")
  if (!value) return ""
  const parts = value.split(/[\\/]/)
  return parts[parts.length - 1] ?? ""
}

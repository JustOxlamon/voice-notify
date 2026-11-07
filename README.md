# Voice Notify for OpenCode

[Русская версия](README.ru.md)

A server-side plugin for **OpenCode V2** that speaks session events through local
TTS. It reads the session title when a turn finishes, asks for attention on
questions and permission requests, announces subagent completion, and exposes a
`speak` tool so the model can deliberately read text aloud.

## Features

- Speaks on root turn completion, questions/forms, permission requests, failures,
  interruptions, and subagent completion. Optional retry announcements.
- Voice pool with a **stable voice per session**: Svetlana (native Russian),
  Ava and Seraphina (multilingual, Russian with an accent).
- English words inside Russian phrases are converted to Russian practical
  transcription using CMUdict; the same voice reads the result.
- Per-session speaking-rate preset, no robotic pitch shifts.
- One speech queue with priorities; phrases never overlap.
- `speak` tool: the model can read arbitrary text on demand.
- edge-tts retries, serialized synthesis, on-disk cache, and optional SAPI
  fallback (off by default).
- Tested on Windows; works on macOS/Linux with `ffmpeg`/`ffplay`. SAPI fallback
  is Windows-only.

## Voice examples

Short demos are in [`examples/`](examples/README.md):

- Svetlana: [raw text](examples/svetlana-raw.mp3), [CMU transcription](examples/svetlana-plugin-cmu.mp3)
- Ava: [raw text](examples/ava-raw.mp3), [CMU transcription](examples/ava-plugin-cmu.mp3)
- Seraphina: [raw text](examples/seraphina-raw.mp3), [CMU transcription](examples/seraphina-plugin-cmu.mp3)

Svetlana is a Microsoft Edge TTS voice; see
[`examples/README.md`](examples/README.md) for the source and licensing notes.

## Requirements

- OpenCode **V2** (tested with 2.2.x).
- Python 3.9+ and `edge-tts`:
  ```sh
  python -m pip install --user edge-tts
  python -m edge_tts --version
  ```
- `ffmpeg` and `ffplay` available in `PATH` (or configure explicit paths).
- Optional: PowerShell on Windows if you want the SAPI fallback.

## Installation

### 1. Clone into the OpenCode plugins directory

Global (all projects):

```sh
# macOS / Linux
git clone https://github.com/JustOxlamon/voice-notify.git ~/.config/opencode/plugins/voice-notify
```

```powershell
# Windows PowerShell
git clone https://github.com/JustOxlamon/voice-notify.git "$env:USERPROFILE\.config\opencode\plugins\voice-notify"
```

Project-local:

```sh
git clone https://github.com/JustOxlamon/voice-notify.git .opencode/plugins/voice-notify
```

OpenCode discovers plugins under `<config>/plugins/<name>/` automatically. The
plugin directory must contain `server.js` (or `index.ts`) at its root; cloning
directly into `voice-notify` gives the right layout.

### 2. Install edge-tts

```sh
python -m pip install --user edge-tts
python -m edge_tts --version
```

### 3. Check ffmpeg/ffplay

```sh
ffplay -version
ffmpeg -version
```

If they are not on `PATH`, pass explicit paths in the plugin options:

```jsonc
{
  "ffmpeg": "C:/tools/ffmpeg/bin/ffmpeg.exe",
  "ffplay": "C:/tools/ffmpeg/bin/ffplay.exe"
}
```

or set `VOICE_NOTIFY_FFMPEG` / `VOICE_NOTIFY_FFPLAY` environment variables.

### 4. Reload OpenCode

```sh
opencode reload
opencode plugin list
```

`voice-notify` should appear in the plugin list. The plugin is auto-discovered;
no `cli.json` entry is required.

### 5. Optional: silence the built-in completion blips

The TUI already has its own attention sounds. To avoid a blip before the spoken
phrase, silence only `done` and `subagent_done` in
`~/.config/opencode/cli.json`:

```jsonc
{
  "attention": {
    "sound": true,
    "sounds": {
      "done": "C:/Users/<you>/.config/opencode/plugins/voice-notify/assets/silence.mp3",
      "subagent_done": "C:/Users/<you>/.config/opencode/plugins/voice-notify/assets/silence.mp3"
    }
  }
}
```

Use the absolute path to `assets/silence.mp3` in your clone. Other attention
sounds (`permission`, `question`, `error`) can stay enabled as an immediate cue.

### 6. Test

Finish a turn and listen, or ask the model:

> Read this aloud: "Voice notify is installed."

The model will call the `speak` tool.

## Configuration

Defaults live in `index.ts`. To override them without rebuilding, add an explicit
plugin entry to `~/.config/opencode/opencode.jsonc` (or the project config):

```jsonc
{
  "plugins": [
    {
      "package": "file:///C:/Users/<you>/.config/opencode/plugins/voice-notify",
      "options": {
        "strategy": "cmu",
        "voicePool": [
          "ru-RU-SvetlanaNeural",
          "en-US-AvaMultilingualNeural",
          "de-DE-SeraphinaMultilingualNeural"
        ],
        "voiceRu": "ru-RU-SvetlanaNeural",
        "voiceEn": "ru-RU-SvetlanaNeural",
        "voiceVariants": true,
        "template": "Готово: {title}",
        "templateQuestion": "Вопрос: {title}",
        "templatePermission": "Требуется разрешение: {title}",
        "templateSubagent": "Сабагент готов: {title}",
        "templateFailed": "Ошибка: {title}",
        "templateInterrupted": "Прервано: {title}",
        "templateRetry": "Повторная попытка: {title}",
        "events": ["success", "failed", "interrupted", "question", "permission", "subagent"],
        "subagents": true,
        "maxTitleChars": 120,
        "maxToolChars": 2000,
        "rate": "+0%",
        "pitch": "+0Hz",
        "volume": 0.8,
        "fallbackSapi": false,
        "python": "python",
        "ffmpeg": "ffmpeg",
        "ffplay": "ffplay"
      }
    }
  ]
}
```

Replace the `package` path with your clone:

- Windows: `file:///C:/Users/<you>/.config/opencode/plugins/voice-notify`
- macOS/Linux: `file:///home/<you>/.config/opencode/plugins/voice-notify`
- Project-local: `file:///path/to/project/.opencode/plugins/voice-notify`

If the plugin is already discovered, the explicit entry is only needed to pass
options; OpenCode deduplicates the target.

### Main options

| Option | Default | Meaning |
|---|---|---|
| `strategy` | `cmu` | `cmu` — Russian + CMU practical transcription; `whole` — read exactly as written; `transliterate` — small tech dictionary. |
| `voicePool` | Svetlana, Ava, Seraphina | Voices used for the stable per-session selection. |
| `voiceVariants` | `true` | Pick a rate preset per session; `false` uses `rate`/`pitch`. |
| `events` | success, failed, interrupted, question, permission, subagent | Events to voice. Add `retry` if wanted. |
| `subagents` | `true` | Announce subagent completions/failures. Questions and permissions from subagents are always announced. |
| `fallbackSapi` | `false` | Use `Microsoft Irina Desktop` if edge-tts fails. Off by default to avoid a different voice. |
| `maxTitleChars` | `120` | Limit for automatic event phrases. |
| `maxToolChars` | `2000` | Limit for `speak` text. |
| `volume` | `0.8` | ffplay volume, 0..1. |

### Voice pool and per-session selection

The default pool:

- `ru-RU-SvetlanaNeural` — native Russian female;
- `en-US-AvaMultilingualNeural` — multilingual female, Russian with an accent;
- `de-DE-SeraphinaMultilingualNeural` — multilingual female, Russian with an accent.

The plugin hashes the session ID to choose a voice and a rate preset. The same
session always gets the same combination; different sessions sound different.
Pitch stays at `+0Hz` to keep the voice natural.

To use only Svetlana:

```jsonc
"voicePool": ["ru-RU-SvetlanaNeural"]
```

### Strategies

- `cmu` (default) — Russian text is read as-is; English runs are converted with
  CMUdict: `OpenCode API` → `оупенкоуд эй пи ай`. No artificial stress marks.
- `whole` — the voice reads the original text, including Latin words.
- `transliterate` — one voice plus a small English-tech dictionary.

## `speak` tool

The plugin registers a server tool named `speak`. It is available to the model
in every session.

Input:

```jsonc
{
  "text": "Проверка инструмента Speak. OpenCode API.",
  "voice": "en-US-AvaMultilingualNeural",
  "variant": 3,
  "strategy": "cmu",
  "wait": true
}
```

- `text` — required; markdown is stripped; up to `maxToolChars`.
- `voice` — optional, one of `voicePool`; default is the session's stable voice.
- `variant` — optional 0..7 rate preset.
- `rate` / `pitch` — optional manual overrides.
- `strategy` — `whole`, `cmu`, or `transliterate`.
- `wait` — wait for playback before returning.

Returns `Speech played.`, `Speech queued.`, or `Speech failed: ...`.

Using the tool suppresses the automatic `Готово` completion for 15 seconds, so
the model does not read the same thing twice.

## How it works

1. The server plugin subscribes to `ctx.event.subscribe`.
2. It resolves the session, checks `parentID`, and builds the phrase from the
   template.
3. `cmu` applies CMUdict practical transcription to English runs.
4. edge-tts synthesizes a clip; ffmpeg trims/concats; ffplay plays it.
5. A priority queue serializes speech. Questions, permissions, and failures jump
   ahead of ordinary completions.
6. Cross-process locks (`cache/synth.lock`, `cache/play.lock`) prevent duplicate
   synthesis and overlapping playback; `cache/last-play.json` deduplicates events.
7. `session.execution.started` and `session.renamed` prewarm the phrase; the
   cache keeps up to 100 clips.

Audio plays on the machine running the OpenCode **server**. A remote server would
play audio on the remote host, not on the client.

## Build from source

`server.js` is committed and ready to use. After editing `index.ts`, `audio.ts`,
`speech.ts`, or `cmu.ts`:

```sh
cd ~/.config/opencode/plugins/voice-notify
npx esbuild index.ts --bundle --platform=node --format=esm --outfile=server.js
opencode reload
```

`vendor/cmudict.js` is the `cmu-pronouncing-dictionary` 3.0.0 data (134k English
words, ARPAbet, ISC/public domain; see `vendor/cmudict-license.txt`).

## Troubleshooting

**No sound**

- `opencode plugin list` should show `voice-notify`.
- `opencode service status` should be healthy.
- `python -m edge_tts --version` and `ffplay -version`.
- Check `~/.local/share/opencode/log/opencode.log` for `voice-notify` errors.

**It speaks with Microsoft Irina**

`fallbackSapi` is enabled. Set it to `false` (the default) so a failed edge-tts
request stays silent instead of changing voice.

**edge-tts failures / silence**

- Check network access to the edge-tts service.
- Run a manual check:
  ```sh
  python -m edge_tts --voice=ru-RU-SvetlanaNeural --text="проверка" --write-media=test.mp3 --rate=+0% --no-progress
  ```
- Delete stale locks if a process crashed:
  `cache/synth.lock`, `cache/play.lock`, `cache/last-play.json`.
- The plugin retries three times and serializes synthesis; a transient
  `NoAudioReceived` should recover.

**A word is pronounced incorrectly**

Add an override to `OVERRIDES` or `ACRONYMS` in `cmu.ts`, then rebuild. If the
word should keep Latin spelling, remove it from the dictionary path.

**First phrase is slow**

edge-tts is network-bound. The plugin prewarms during the turn and caches clips;
the first synthesis can take 2–5 seconds.

## Repository layout

```text
index.ts                 plugin source
audio.ts                 edge-tts, ffmpeg, ffplay, cache, SAPI fallback
speech.ts                text cleanup, splitting, transliteration
cmu.ts                   CMUdict practical transcription
server.js                prebuilt bundle loaded by OpenCode
vendor/cmudict.js        CMU pronouncing dictionary
vendor/cmudict-license.txt
assets/silence.mp3       silences the built-in done blips
README.md / README.ru.md
LICENSE
```

## License

Plugin code: MIT (see `LICENSE`).
CMU pronouncing dictionary: ISC/public domain (see `vendor/cmudict-license.txt`).

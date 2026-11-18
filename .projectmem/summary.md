# projectmem - voice-notify

_Last updated: 2026-11-18_

## Project purpose
A server-side plugin for **OpenCode V2** that speaks session events through local TTS. It reads the session title when a turn finishes, asks for attention on questions and permission requests, announces subagent completion, and exposes a `speak` tool so the model can deliberately read text…

## Recent issues
- [DONE] #0001 Voice/volume/rate changes from the TUI settings screen did not apply: the plugin kept the options snapshot loaded at setup, and OpenCode runs several plugin instances (up to ~3 loads per reload), so the instance serving the settings RPC is often not the one announcing events. [index.ts:syncSettings] (fixed)
- [DONE] #legacy_cc82 Legacy issue: fix: use native multilingual reading for Ava and Seraphina (fixed)
- [DONE] #legacy_c0f0 Legacy issue: fix(settings): make settings RPC resilient to late registration (fixed)
- [DONE] #legacy_7228 Legacy issue: fix: keep speak voice schema in sync with settings (fixed)

## Decisions
- No decisions logged yet.

## Notes
- feat: OpenCode voice notifications with Svetlana/Ava/Seraphina
- docs: add Svetlana voice examples
- docs: add Ava and Seraphina voice examples
- docs: refresh voice examples for auto strategy
- docs: make voice examples introduce their own voices
- feat: add TUI settings screen and settings RPC
- docs: refresh README for the settings screen
- gotcha: plugin entrypoint is server.js (bundled), not index.ts. After editing index.ts/audio.ts/rpc.ts rebuild with: npx esbuild index.ts --bundle --platform=node --format=esm --outfile=server.js. The installed copy at ~/.config/opencode/plugins/voice-notify is a separate clone (older commit, LF... [README.md:355]
- New feature: feat(settings): live-reload settings and add voice/sound/off output mode [audio.ts]

## Key files
- `.gitignore`
- `LICENSE`
- `README.md`
- `README.ru.md`
- `assets/silence.mp3`
- `audio.ts`
- `cmu.ts`
- `index.ts`
- `server.js`
- `speech.ts`
- `vendor/cmudict-license.txt`
- `vendor/cmudict.d.ts`
- `vendor/cmudict.js`
- `examples/README.md`
- `examples/svetlana-plugin-cmu.mp3`
- `examples/svetlana-plugin-cmu.txt`
- `examples/svetlana-raw.mp3`
- `examples/svetlana-raw.txt`
- `examples/ava-plugin-cmu.mp3`
- `examples/ava-plugin-cmu.txt`

## Open questions
- None logged yet.

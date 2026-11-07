# Voice examples

Short demo clips generated with `edge-tts` 7.3.1 and the Microsoft voice
`ru-RU-SvetlanaNeural` (rate `+0%`, pitch `+0Hz`).

| File | What it shows |
|---|---|
| [`svetlana-raw.mp3`](svetlana-raw.mp3) · [text](svetlana-raw.txt) | Svetlana reading the original text exactly as written. |
| [`svetlana-plugin-cmu.mp3`](svetlana-plugin-cmu.mp3) · [text](svetlana-plugin-cmu.txt) | The plugin's `cmu` strategy: English words are converted to Russian practical transcription before synthesis (`OpenCode` → `оупенкоуд`, `API` → `эй пи ай`). |

## Voice source and license

Svetlana is a **Microsoft Edge neural TTS voice**. The audio was generated through
the unofficial [`edge-tts`](https://github.com/rany2/edge-tts) Python client,
which uses Microsoft's online TTS service.

- The plugin code is MIT — see [`../LICENSE`](../LICENSE).
- The voice and generated audio belong to Microsoft; these clips are provided
  only as short demonstration samples.
- CMUdict data is ISC/public domain — see
  [`../vendor/cmudict-license.txt`](../vendor/cmudict-license.txt).

If you plan to reuse the audio in a product or a large public campaign, check
Microsoft's terms for the Edge TTS service.

## Regenerate

```sh
python -m edge_tts \
  --voice=ru-RU-SvetlanaNeural \
  --file=svetlana-raw.txt \
  --write-media=svetlana-raw.mp3 \
  --rate=+0% \
  --no-progress
```

For the `cmu` version, first convert English runs with `cmu.ts` (or use the
`speak` tool with `"strategy": "cmu"`), then synthesize the resulting text.

---

# Примеры голоса

Короткие демонстрационные клипы, сгенерированные `edge-tts` 7.3.1 голосом
Microsoft `ru-RU-SvetlanaNeural` (rate `+0%`, pitch `+0Hz`).

- [`svetlana-raw.mp3`](svetlana-raw.mp3) — Svetlana читает исходный текст как есть.
- [`svetlana-plugin-cmu.mp3`](svetlana-plugin-cmu.mp3) — стратегия `cmu`:
  английские слова переводятся в русскую практическую транскрипцию перед
  синтезом (`OpenCode` → `оупенкоуд`, `API` → `эй пи ай`).

Голос и сгенерированное аудио принадлежат Microsoft; клипы даны только как
короткие примеры. Код плагина — MIT, данные CMUdict — ISC/public domain.

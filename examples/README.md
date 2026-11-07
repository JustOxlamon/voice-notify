# Voice examples

Short demo clips generated with `edge-tts` 7.3.1 and the Microsoft voice
`ru-RU-SvetlanaNeural` (rate `+0%`, pitch `+0Hz`).

| Voice | Raw text | CMU transcription |
|---|---|---|
| Svetlana (native ru-RU) | [`svetlana-raw.mp3`](svetlana-raw.mp3) | [`svetlana-plugin-cmu.mp3`](svetlana-plugin-cmu.mp3) |
| Ava (multilingual) | [`ava-raw.mp3`](ava-raw.mp3) | [`ava-plugin-cmu.mp3`](ava-plugin-cmu.mp3) |
| Seraphina (multilingual) | [`seraphina-raw.mp3`](seraphina-raw.mp3) | [`seraphina-plugin-cmu.mp3`](seraphina-plugin-cmu.mp3) |

The `.txt` file next to each clip contains the exact spoken text. Svetlana is
native Russian; Ava and Seraphina are multilingual and have a light Russian
accent.

With the default `auto` strategy, Svetlana uses the CMU clips and Ava/Seraphina
use the raw clips. The CMU clips for Ava/Seraphina are a forced comparison:
English is transliterated to Cyrillic and therefore sounds more Russian-accented.

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

| Голос | Исходный текст | CMU-транскрипция |
|---|---|---|
| Svetlana (native ru-RU) | [`svetlana-raw.mp3`](svetlana-raw.mp3) | [`svetlana-plugin-cmu.mp3`](svetlana-plugin-cmu.mp3) |
| Ava (multilingual) | [`ava-raw.mp3`](ava-raw.mp3) | [`ava-plugin-cmu.mp3`](ava-plugin-cmu.mp3) |
| Seraphina (multilingual) | [`seraphina-raw.mp3`](seraphina-raw.mp3) | [`seraphina-plugin-cmu.mp3`](seraphina-plugin-cmu.mp3) |

Рядом с каждым mp3 лежит `.txt` с точным произнесённым текстом. Svetlana —
native-русский голос; Ava и Seraphina — мультиязычные, с лёгким русским
акцентом.

При стратегии `auto` по умолчанию Svetlana использует CMU-клипы, а
Ava/Seraphina — raw-клипы. CMU-клипы для Ava/Seraphina — принудительное
сравнение: английский транслитерируется в кириллицу и звучит с более сильным
русским акцентом.

Голос и сгенерированное аудио принадлежат Microsoft; клипы даны только как
короткие примеры. Код плагина — MIT, данные CMUdict — ISC/public domain.

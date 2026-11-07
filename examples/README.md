# Voice examples

Short demo clips generated with `edge-tts` 7.3.1 and the Microsoft voice
`ru-RU-SvetlanaNeural` (rate `+0%`, pitch `+0Hz`).

| Voice | Default `auto` | Forced comparison |
|---|---|---|
| Svetlana (native ru-RU) | [`svetlana-auto.mp3`](svetlana-auto.mp3) — CMU | [`svetlana-raw.mp3`](svetlana-raw.mp3) — raw |
| Ava (multilingual) | [`ava-auto.mp3`](ava-auto.mp3) — raw | [`ava-cmu-forced.mp3`](ava-cmu-forced.mp3) — CMU |
| Seraphina (multilingual) | [`seraphina-auto.mp3`](seraphina-auto.mp3) — raw | [`seraphina-cmu-forced.mp3`](seraphina-cmu-forced.mp3) — CMU |

The `.txt` file next to each clip contains the exact spoken text. Svetlana is
native Russian; Ava and Seraphina are multilingual and have a light Russian
accent.

`auto` (the default) uses `cmu` for native Russian voices and `whole` for
multilingual voices. That is why Svetlana's default clip is CMU, while
Ava/Seraphina's default clips are raw. The forced clips show the opposite
strategy for comparison; the CMU clips for Ava/Seraphina make English sound
Russian-accented.

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
  --file=svetlana-auto.txt \
  --write-media=svetlana-auto.mp3 \
  --rate=+0% \
  --no-progress
```

For the other voices, change `--voice` and the file names:

- `en-US-AvaMultilingualNeural` with `ava-auto.txt`
- `de-DE-SeraphinaMultilingualNeural` with `seraphina-auto.txt`

The `*-cmu-forced` clips use the `*-cmu-forced.txt` transcripts; the
`svetlana-raw` clip uses `svetlana-raw.txt`.

---

# Примеры голоса

Короткие демонстрационные клипы, сгенерированные `edge-tts` 7.3.1 голосом
Microsoft `ru-RU-SvetlanaNeural` (rate `+0%`, pitch `+0Hz`).

| Голос | Дефолт `auto` | Принудительное сравнение |
|---|---|---|
| Svetlana (native ru-RU) | [`svetlana-auto.mp3`](svetlana-auto.mp3) — CMU | [`svetlana-raw.mp3`](svetlana-raw.mp3) — raw |
| Ava (multilingual) | [`ava-auto.mp3`](ava-auto.mp3) — raw | [`ava-cmu-forced.mp3`](ava-cmu-forced.mp3) — CMU |
| Seraphina (multilingual) | [`seraphina-auto.mp3`](seraphina-auto.mp3) — raw | [`seraphina-cmu-forced.mp3`](seraphina-cmu-forced.mp3) — CMU |

Рядом с каждым mp3 лежит `.txt` с точным произнесённым текстом. Svetlana —
native-русский голос; Ava и Seraphina — мультиязычные, с лёгким русским
акцентом.

`auto` (по умолчанию) использует `cmu` для native-русских голосов и `whole`
для мультиязычных. Поэтому у Svetlana дефолтный клип — CMU, а у Ava/Seraphina —
raw. Принудительные клипы показывают обратную стратегию для сравнения; CMU для
Ava/Seraphina звучит с русским акцентом.

Голос и сгенерированное аудио принадлежат Microsoft; клипы даны только как
короткие примеры. Код плагина — MIT, данные CMUdict — ISC/public domain.

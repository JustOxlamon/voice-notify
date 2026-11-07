# Voice Notify для OpenCode

[English version](README.md)

Серверный плагин для **OpenCode V2**, который озвучивает события сессии через
локальный TTS. Он читает название сессии при завершении хода, сообщает о
вопросах и запросах разрешений, озвучивает завершение субагентов и даёт модели
тул `speak`, чтобы осознанно прочитать текст вслух.

## Возможности

- Озвучка завершения корневого хода, вопросов/форм, запросов разрешений,
  ошибок, прерываний и завершения субагентов. Опционально — retry.
- Пул голосов со **стабильным голосом на сессию**: Svetlana (native ru-RU),
  Ava и Seraphina (мультиязычные, русский с акцентом).
- Английские слова внутри русских фраз переводятся в русскую практическую
  транскрипцию через CMUdict; читает тот же голос.
- Стабильный темп на сессию, без роботизированных pitch-сдвигов.
- Одна очередь с приоритетами: фразы не накладываются друг на друга.
- Тул `speak`: модель может прочитать произвольный текст по запросу.
- Ретраи edge-tts, сериализация синтеза, кэш на диске и опциональный SAPI-fallback
  (по умолчанию выключен).
- Проверено на Windows; работает на macOS/Linux с `ffmpeg`/`ffplay`. SAPI-fallback
  только для Windows.

## Требования

- OpenCode **V2** (проверено на 2.2.x).
- Python 3.9+ и `edge-tts`:
  ```sh
  python -m pip install --user edge-tts
  python -m edge_tts --version
  ```
- `ffmpeg` и `ffplay` в `PATH` (или явные пути в опциях).
- Опционально: PowerShell на Windows для SAPI-fallback.

## Установка

### 1. Клонировать в папку плагинов OpenCode

Глобально (для всех проектов):

```sh
# macOS / Linux
git clone https://github.com/JustOxlamon/voice-notify.git ~/.config/opencode/plugins/voice-notify
```

```powershell
# Windows PowerShell
git clone https://github.com/JustOxlamon/voice-notify.git "$env:USERPROFILE\.config\opencode\plugins\voice-notify"
```

Локально для проекта:

```sh
git clone https://github.com/JustOxlamon/voice-notify.git .opencode/plugins/voice-notify
```

OpenCode автоматически находит плагины в `<config>/plugins/<name>/`. В корне
папки плагина должен быть `server.js` (или `index.ts`); клонирование прямо в
`voice-notify` даёт правильную структуру.

### 2. Установить edge-tts

```sh
python -m pip install --user edge-tts
python -m edge_tts --version
```

### 3. Проверить ffmpeg/ffplay

```sh
ffplay -version
ffmpeg -version
```

Если их нет в `PATH`, укажи пути в опциях плагина:

```jsonc
{
  "ffmpeg": "C:/tools/ffmpeg/bin/ffmpeg.exe",
  "ffplay": "C:/tools/ffmpeg/bin/ffplay.exe"
}
```

или задай переменные окружения `VOICE_NOTIFY_FFMPEG` / `VOICE_NOTIFY_FFPLAY`.

### 4. Перезагрузить OpenCode

```sh
opencode reload
opencode plugin list
```

В списке должен появиться `voice-notify`. Плагин подхватывается автоматически;
запись в `cli.json` не нужна.

### 5. Опционально: заглушить встроенные блипы завершения

В TUI уже есть свои attention-звуки. Чтобы перед голосовой фразой не было
короткого блипа, заглуши только `done` и `subagent_done` в
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

Укажи абсолютный путь к `assets/silence.mp3` в своём клоне. Остальные звуки
(`permission`, `question`, `error`) можно оставить — они дают быстрый сигнал,
после которого звучит голос.

### 6. Проверка

Заверши ход и послушай — или попроси модель:

> Прочитай вслух: «Voice notify установлен.»

Модель вызовет тул `speak`.

## Настройка

Значения по умолчанию лежат в `index.ts`. Чтобы переопределить их без сборки,
добавь явную запись плагина в `~/.config/opencode/opencode.jsonc` (или в конфиг
проекта):

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

Замени `package` на свой путь:

- Windows: `file:///C:/Users/<you>/.config/opencode/plugins/voice-notify`
- macOS/Linux: `file:///home/<you>/.config/opencode/plugins/voice-notify`
- Локально в проекте: `file:///path/to/project/.opencode/plugins/voice-notify`

Если плагин уже найден автоматически, явная запись нужна только для передачи
опций; OpenCode дедуплицирует цель.

### Основные опции

| Опция | По умолчанию | Значение |
|---|---|---|
| `strategy` | `cmu` | `cmu` — русский + CMU-транскрипция; `whole` — читать как написано; `transliterate` — небольшой словарь терминов. |
| `voicePool` | Svetlana, Ava, Seraphina | Голоса для стабильного выбора на сессию. |
| `voiceVariants` | `true` | Выбирать rate-пресет на сессию; `false` — использовать `rate`/`pitch`. |
| `events` | success, failed, interrupted, question, permission, subagent | Какие события озвучивать. Можно добавить `retry`. |
| `subagents` | `true` | Озвучивать завершение/ошибки субагентов. Вопросы и разрешения от субагентов озвучиваются всегда. |
| `fallbackSapi` | `false` | Использовать `Microsoft Irina Desktop`, если edge-tts упал. По умолчанию выключено, чтобы не менять голос. |
| `maxTitleChars` | `120` | Ограничение для автоматических фраз. |
| `maxToolChars` | `2000` | Ограничение текста для `speak`. |
| `volume` | `0.8` | Громкость ffplay, 0..1. |

### Пул голосов и выбор на сессию

Пул по умолчанию:

- `ru-RU-SvetlanaNeural` — native-русский женский;
- `en-US-AvaMultilingualNeural` — мультиязычный женский, русский с акцентом;
- `de-DE-SeraphinaMultilingualNeural` — мультиязычный женский, русский с акцентом.

Плагин хеширует `sessionID` и выбирает голос и rate-пресет. Одна сессия всегда
звучит одинаково, разные сессии — по-разному. Pitch остаётся `+0Hz`, чтобы голос
не звучал роботом.

Только Svetlana:

```jsonc
"voicePool": ["ru-RU-SvetlanaNeural"]
```

### Стратегии

- `cmu` (по умолчанию) — русский текст читается как есть; английские куски
  переводятся через CMUdict: `OpenCode API` → `оупенкоуд эй пи ай`. Без
  искусственных знаков ударения.
- `whole` — голос читает исходный текст, включая латиницу.
- `transliterate` — один голос плюс небольшой словарь английских терминов.

## Тул `speak`

Плагин регистрирует серверный тул `speak`. Он доступен модели в каждой сессии.

Вход:

```jsonc
{
  "text": "Проверка инструмента Speak. OpenCode API.",
  "voice": "en-US-AvaMultilingualNeural",
  "variant": 3,
  "strategy": "cmu",
  "wait": true
}
```

- `text` — обязательный; markdown вырезается; до `maxToolChars`.
- `voice` — опционально, один из `voicePool`; по умолчанию голос сессии.
- `variant` — опционально 0..7, rate-пресет.
- `rate` / `pitch` — ручные переопределения.
- `strategy` — `whole`, `cmu` или `transliterate`.
- `wait` — дождаться окончания проигрывания.

Возвращает `Speech played.`, `Speech queued.` или `Speech failed: ...`.

После вызова тула автоматическое `Готово` подавляется на 15 секунд, чтобы модель
не прочитала одно и то же дважды.

## Как это работает

1. Серверный плагин подписывается на `ctx.event.subscribe`.
2. Получает сессию, проверяет `parentID` и собирает фразу из шаблона.
3. В `cmu` английские куски переводятся в русскую практическую транскрипцию.
4. edge-tts синтезирует клип; ffmpeg обрезает/склеивает; ffplay играет.
5. Очередь с приоритетами сериализует речь. Вопросы, разрешения и ошибки
   обгоняют обычные завершения.
6. Межпроцессные локи (`cache/synth.lock`, `cache/play.lock`) не дают дублировать
   синтез и накладывать воспроизведение; `cache/last-play.json` гасит дубли событий.
7. `session.execution.started` и `session.renamed` прогревают фразу; кэш хранит
   до 100 клипов.

Звук играет на машине, где запущен **сервер** OpenCode. При удалённом сервере
звук будет на удалённом хосте, а не на клиенте.

## Сборка из исходников

`server.js` уже собран и готов к использованию. После правок `index.ts`,
`audio.ts`, `speech.ts` или `cmu.ts`:

```sh
cd ~/.config/opencode/plugins/voice-notify
npx esbuild index.ts --bundle --platform=node --format=esm --outfile=server.js
opencode reload
```

`vendor/cmudict.js` — данные `cmu-pronouncing-dictionary` 3.0.0 (134k английских
слов, ARPAbet, ISC/public domain; см. `vendor/cmudict-license.txt`).

## Диагностика

**Нет звука**

- `opencode plugin list` должен показывать `voice-notify`.
- `opencode service status` должен быть в порядке.
- `python -m edge_tts --version` и `ffplay -version`.
- Смотри `~/.local/share/opencode/log/opencode.log` на ошибки `voice-notify`.

**Говорит Microsoft Irina**

Включён `fallbackSapi`. Поставь `false` (значение по умолчанию), чтобы при сбое
edge-tts лучше было тихо, чем другим голосом.

**edge-tts падает / тишина**

- Проверь доступ к сервису edge-tts.
- Ручная проверка:
  ```sh
  python -m edge_tts --voice=ru-RU-SvetlanaNeural --text="проверка" --write-media=test.mp3 --rate=+0% --no-progress
  ```
- Удали устаревшие локи, если процесс упал:
  `cache/synth.lock`, `cache/play.lock`, `cache/last-play.json`.
- Плагин делает 3 попытки и сериализует синтез; транзиентный
  `NoAudioReceived` должен переживаться.

**Слово читается неправильно**

Добавь переопределение в `OVERRIDES` или `ACRONYMS` в `cmu.ts` и пересобери.
Если слово должно остаться латиницей, убери его из словарного пути.

**Первая фраза долго синтезируется**

edge-tts зависит от сети. Плагин прогревает фразу во время хода и кэширует
клипы; первый синтез может занять 2–5 секунд.

## Структура репозитория

```text
index.ts                 исходник плагина
audio.ts                 edge-tts, ffmpeg, ffplay, кэш, SAPI-fallback
speech.ts                очистка текста, разбиение, транслитерация
cmu.ts                   CMUdict-транскрипция
server.js                готовый бандл для OpenCode
vendor/cmudict.js        CMU pronouncing dictionary
vendor/cmudict-license.txt
assets/silence.mp3       заглушка встроенных done-блипов
README.md / README.ru.md
LICENSE
```

## Лицензия

Код плагина: MIT (см. `LICENSE`).
CMU pronouncing dictionary: ISC/public domain (см. `vendor/cmudict-license.txt`).

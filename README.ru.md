# Voice Notify для OpenCode

[English version](README.md)

Серверный плагин для **OpenCode V2**, который озвучивает события сессии через
локальный TTS. Он читает название сессии при завершении хода, сообщает о
вопросах и запросах разрешений, озвучивает завершение субагентов и даёт модели
тул `speak`, чтобы осознанно прочитать текст вслух. Небольшой экран в TUI
(`/voice-notify`) настраивает пул голосов, события, громкость и фразы.

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
- Экран настроек в TUI: `/voice-notify` (или Ctrl+P) — события, голоса,
  громкость, темп, шаблоны, SAPI-fallback и проверка голоса.
- Настройки сохраняются в `settings.json` и применяются сразу; файл локальный
  и не попадает в git.
- Ретраи edge-tts, сериализация синтеза, кэш на диске и опциональный SAPI-fallback
  (по умолчанию выключен).
- Проверено на Windows; работает на macOS/Linux с `ffmpeg`/`ffplay`. SAPI-fallback
  только для Windows.

## Примеры голоса

Короткие демо лежат в [`examples/`](examples/README.md):

- Svetlana: [auto](examples/svetlana-auto.mp3), [raw для сравнения](examples/svetlana-raw.mp3)
- Ava: [auto](examples/ava-auto.mp3), [принудительный CMU](examples/ava-cmu-forced.mp3)
- Seraphina: [auto](examples/seraphina-auto.mp3), [принудительный CMU](examples/seraphina-cmu-forced.mp3)

Все три голоса — Microsoft Edge TTS; источник и лицензионные пометки — в
[`examples/README.md`](examples/README.md).

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

### 7. Открой экран настроек

Выполни в TUI `/voice-notify` или нажми `Ctrl+P` и выбери **Voice Notify:
настройки**. Экран позволяет менять:

- какие события озвучивать;
- пул голосов (добавлять и убирать голоса edge-tts);
- разные голоса по сессиям, темп и громкость;
- SAPI-fallback и стратегию текста;
- шаблоны фраз и лимиты длины;
- тестовую фразу.

Значения сохраняются в `settings.json` рядом с плагином и применяются сразу.
`settings.json` локальный и не попадает в git. В экране есть пункт
**Сбросить настройки**: он удаляет локальные переопределения и возвращает
значения из опций плагина или встроенные defaults. Встроенный `/settings` в OpenCode — статический список
ядра, плагины не могут добавлять туда строки; `/voice-notify` — поддерживаемый
аналог на уровне плагина.

## Настройка

Значения по умолчанию лежат в `index.ts`. Экран настроек TUI пишет
`settings.json`, который переопределяет значения ниже. Чтобы задать defaults без
UI, добавь явную запись плагина в `~/.config/opencode/opencode.jsonc` (или в
конфиг проекта):

```jsonc
{
  "plugins": [
    {
      "package": "file:///C:/Users/<you>/.config/opencode/plugins/voice-notify",
      "options": {
        "strategy": "auto",
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

### Файл настроек

Экран TUI пишет `settings.json` рядом с `server.js`:

```text
<plugin>/settings.json
```

Приоритет:

1. `settings.json`, записанный через `/voice-notify`;
2. `options` из `opencode.json(c)`;
3. встроенные defaults в `index.ts`.

Файл создаётся при первом изменении, содержит только пользовательские настройки
и намеренно игнорируется git. Пункт **Сбросить настройки** удаляет его.

### Основные опции

| Опция | По умолчанию | Значение |
|---|---|---|
| `strategy` | `auto` | `auto` — native RU-голос → `cmu`, мультиязычный → `whole`; либо принудительно `cmu`/`whole`/`hybrid`/`transliterate`. |
| `voicePool` | Svetlana, Ava, Seraphina | Голоса для стабильного выбора на сессию. |
| `voiceVariants` | `true` | Выбирать rate-пресет на сессию; `false` — использовать `rate`/`pitch`. |
| `events` | success, failed, interrupted, question, permission, subagent | Какие события озвучивать. Можно добавить `retry`. |
| `subagents` | `true` | Озвучивать завершение/ошибки субагентов. Вопросы и разрешения от субагентов озвучиваются всегда. |
| `fallbackSapi` | `false` | Использовать `Microsoft Irina Desktop`, если edge-tts упал. По умолчанию выключено, чтобы не менять голос. |
| `maxTitleChars` | `120` | Ограничение для автоматических фраз. |
| `maxToolChars` | `2000` | Ограничение текста для `speak`. |
| `volume` | `0.8` | Громкость ffplay, 0..1. |

### Остальные опции

| Опция | По умолчанию | Значение |
|---|---|---|
| `rate` | `+0%` | Базовый темп, когда `voiceVariants` выключен. |
| `pitch` | `+0Hz` | Сдвиг тона; держи нулевым для естественного голоса. |
| `template` | `Готово: {title}` | Фраза успешного завершения. |
| `templateFailed` | `Ошибка: {title}` | Фраза ошибки. |
| `templateInterrupted` | `Прервано: {title}` | Фраза прерывания. |
| `templateQuestion` | `Вопрос: {title}` | Фраза вопроса. |
| `templatePermission` | `Требуется разрешение: {title}` | Фраза запроса разрешения. |
| `templateSubagent` | `Сабагент готов: {title}` | Фраза завершения субагента. |
| `templateRetry` | `Повторная попытка: {title}` | Фраза повторной попытки. |
| `python` | auto | Python для `edge-tts`. |
| `ffmpeg` | auto | Исполняемый файл ffmpeg. |
| `ffplay` | auto | Исполняемый файл ffplay. |

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

- `auto` (по умолчанию) — с учётом голоса:
  - native `ru-*` голос (Svetlana) получает CMU-транскрипцию, английский
    читается кириллицей: `OpenCode API` → `оупенкоуд эй пи ай`;
  - мультиязычный голос (Ava/Seraphina) получает исходный текст, поэтому
    английский читается нативно, а русский — с лёгким акцентом.
- `cmu` — принудительная CMU-транскрипция для любого голоса. С Ava/Seraphina
  это обычно плохой выбор: они получают кириллическую транслитерацию
  английских слов и читают её с русским акцентом.
- `whole` — читать исходный текст как есть.
- `hybrid` — делить фразу на русские и английские сегменты и читать каждый на
  его языке; удобно для длинного смешанного текста.
- `transliterate` — один голос плюс небольшой словарь английских терминов.

Если английский на Ava/Seraphina звучал плохо, значит к мультиязычному голосу
применялась стратегия `cmu`. `auto` исправляет это, переключая такие голоса на
`whole`.

## Тул `speak`

Плагин регистрирует серверный тул `speak`. Он доступен модели в каждой сессии.

Вход:

```jsonc
{
  "text": "Проверка инструмента Speak. OpenCode API.",
  "voice": "en-US-AvaMultilingualNeural",
  "variant": 3,
  "strategy": "auto",
  "wait": true
}
```

- `text` — обязательный; markdown вырезается; до `maxToolChars`.
- `voice` — опционально, голос из текущего пула; по умолчанию голос сессии.
  Неизвестное имя откатывается к голосу сессии.
- `variant` — опционально 0..7, rate-пресет.
- `rate` / `pitch` — ручные переопределения.
- `strategy` — `auto` (по умолчанию), `whole`, `hybrid`, `cmu` или `transliterate`.
- `wait` — дождаться окончания проигрывания.

Возвращает `Speech played.`, `Speech queued.` или `Speech failed: ...`.

После вызова тула автоматическое `Готово` подавляется на 15 секунд, чтобы модель
не прочитала одно и то же дважды.

## Как это работает

1. Серверный плагин подписывается на `ctx.event.subscribe`.
2. Получает сессию, проверяет `parentID` и собирает фразу из шаблона.
3. `auto` выбирает `cmu` для native-русских голосов и `whole` для мультиязычных;
   в `cmu` английские куски переводятся в русскую практическую транскрипцию.
4. edge-tts синтезирует клип; ffmpeg обрезает/склеивает; ffplay играет.
5. Очередь с приоритетами сериализует речь. Вопросы, разрешения и ошибки
   обгоняют обычные завершения.
6. Межпроцессные локи (`cache/synth.lock`, `cache/play.lock`) не дают дублировать
   синтез и накладывать воспроизведение; `cache/last-play.json` гасит дубли событий.
7. `session.execution.started` и `session.renamed` прогревают фразу; кэш хранит
   до 100 клипов.

Звук играет на машине, где запущен **сервер** OpenCode. При удалённом сервере
звук будет на удалённом хосте, а не на клиенте.

Экран настроек — отдельная TUI-часть плагина. Он общается с сервером по RPC
`voice-notify` (`get`, `update`, `reset`, `test`), поэтому изменения применяются
к работающему серверу сразу и не требуют перезапуска синтеза.

## Сборка из исходников

`server.js` уже собран и готов к использованию. После правок `index.ts`,
`rpc.ts`, `audio.ts`, `speech.ts` или `cmu.ts`:

```sh
cd ~/.config/opencode/plugins/voice-notify
npx esbuild index.ts --bundle --platform=node --format=esm --outfile=server.js
opencode reload
```

`tui.ts` загружается TUI OpenCode напрямую и отдельной сборки не требует.
`rpc.ts` — общий контракт; он попадает в `server.js` при сборке.

`vendor/cmudict.js` — данные `cmu-pronouncing-dictionary` 3.0.0 (134k английских
слов, ARPAbet, ISC/public domain; см. `vendor/cmudict-license.txt`).

## Диагностика

**Нет звука**

- `opencode plugin list` должен показывать `voice-notify`.
- `opencode service status` должен быть в порядке.
- `python -m edge_tts --version` и `ffplay -version`.
- Смотри `~/.local/share/opencode/log/opencode.log` на ошибки `voice-notify`.

**`/voice-notify` нет в палитре команд**

- `opencode plugin list` должен показывать `voice-notify`.
- Выполни `opencode reload`, затем перезапусти TUI, если он уже был открыт.
- Проверь лог на ошибки загрузки TUI-части `voice-notify`.

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
index.ts                 исходник серверного плагина
rpc.ts                   общий контракт сервера и TUI
tui.ts                   экран настроек `/voice-notify`
audio.ts                 edge-tts, ffmpeg, ffplay, кэш, SAPI-fallback
speech.ts                очистка текста, разбиение, транслитерация
cmu.ts                   CMUdict-транскрипция
server.js                готовый бандл для OpenCode
settings.json            локальные переопределения (игнорируется git)
vendor/cmudict.js        CMU pronouncing dictionary
vendor/cmudict-license.txt
assets/silence.mp3       заглушка встроенных done-блипов
README.md / README.ru.md
LICENSE
```

## Лицензия

Код плагина: MIT (см. `LICENSE`).
CMU pronouncing dictionary: ISC/public domain (см. `vendor/cmudict-license.txt`).

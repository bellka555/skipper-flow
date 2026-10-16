# LEARNING.md — путеводитель по проекту Skipper Flow

Этот файл поможет разобраться, как устроен проект. Читайте его вместе с кодом:
откройте рядом файл, о котором идёт речь, и сверяйтесь с комментариями в нём.

---

## 1. Общая схема: от открытия видео до пропуска рекламы

Участники:
- **interceptor.js** — шпион внутри страницы YouTube (world MAIN);
- **content.js** (+ transcript.js, ui.js) — главный скрипт расширения на странице (изолированный мир);
- **background.js** — фоновый service worker расширения, делает все сетевые запросы;
- **backend** — наш сервер, который зовёт ИИ;
- **popup** — окошко по клику на иконку.

```
YouTube-плеер ──XHR /api/timedtext──▶ interceptor.js ──postMessage──▶ content.js
                                                                        │
                                          chrome.runtime.sendMessage    ▼
                                                                  background.js
                                                         ┌──────────────┼──────────────┐
                                                         ▼              ▼              ▼
                                                   SponsorBlock    наш backend    OpenRouter
                                                                   (если нет      (если есть
                                                                   своего ключа)  свой ключ)
                                                                        │
                                                                        ▼
                                                                    OpenRouter
```

По шагам:

1. **Страница открывается.** Chrome сразу (при `document_start`) запускает `content/interceptor.js` в мире страницы. Он подменяет `XMLHttpRequest.prototype.open` и `window.fetch`, чтобы видеть ответы на запросы субтитров. Одновременно запускается `content/content.js`.
2. **content.js замечает видео.** Событие `yt-navigate-finish` (или проверка URL раз в секунду) → функция `checkVideoChange()` видит новый `v=...` в адресе, сбрасывает состояние и вызывает `startForVideo()`.
3. **SponsorBlock.** content.js отправляет `{type: 'sponsorblock'}` в `background.js`. Тот считает SHA-256 от ID видео, берёт первые 4 символа и спрашивает `sponsor.ajay.app/api/skipSegments/<префикс>`. Если разметка есть — переходим сразу к шагу 7.
4. **Ждём субтитры.** Если плеер сам запросил субтитры, interceptor.js перехватил ответ и через `window.postMessage` отдал его content.js, а `transcript.js` превратил json3 в строки `"мм:сс текст"`. Если за 5 секунд ничего не пришло — content.js дважды нажимает кнопку «Субтитры» в плеере (`nudgeSubtitles()`), плеер скачивает субтитры, мы их перехватываем. Если кнопки нет — «Для этого видео анализ недоступен».
5. **Анализ.** content.js отправляет расшифровку в background.js (`{type: 'analyze'}`). Тот смотрит настройки:
   - есть свой ключ → сам вызывает OpenRouter (`analyzeDirect()`), результат кладёт в локальный кэш;
   - нет ключа → `POST /analyze` на наш backend.
6. **Backend** (`backend/src/index.js`, работает на Cloudflare Workers): проверяет тело запроса (zod), ищет видео в кэше базы D1 (`db.js`). Если нет — `ai.js` по очереди пробует модели из `AI_MODELS`, проверяет ответ через zod, сохраняет в базу и возвращает сегменты.
7. **Отрисовка.** content.js сохраняет сегменты в `state.segments`, `ui.js` рисует цветные полоски на шкале прогресса.
8. **Пропуск.** На каждое событие `timeupdate` у `<video>` функция `onTimeUpdate()` проверяет: не попало ли текущее время внутрь сегмента. Если да — `video.currentTime = segment.end` и уведомление «Пропущено · Посмотреть рекламу · Это не реклама».
9. **Отзыв.** «Это не реклама» → сегмент помечается `ignored`, background.js шлёт `POST /feedback`, backend пишет в таблицу `feedback`.

---

## 2. Карта проекта

### extension/
| Файл | Зачем |
|---|---|
| `manifest.json` | «Паспорт» расширения: какие скрипты где запускать, какие права нужны, где popup и настройки. |
| `background.js` | Service worker: запросы к SponsorBlock, к backend и напрямую к OpenRouter; держит ключ пользователя подальше от страницы. |
| `common/settings.js` | Настройки по умолчанию и функции `loadSettings()`/`saveSettings()` для chrome.storage. Общий для всех частей. |
| `common/prompt.js` | Промт для ИИ, JSON-схема ответа, функция вытаскивания JSON из текста. Используется в режиме «свой ключ». |
| `content/interceptor.js` | Работает в мире страницы, перехватывает ответы `/api/timedtext` и пересылает их через postMessage. |
| `content/transcript.js` | Превращает json3-субтитры в строки `"мм:сс текст"`. Чистые функции, без побочных эффектов. |
| `content/badwords.js` | Словарь режима стримера (оскорбления и мат на en/ru/uk) и функция, которая проверяет слово по словарю. |
| `content/streamer.js` | Режим стримера: находит запрещённые слова по времени, глушит звук с «бипом», заранее предупреждает. |
| `content/ui.js` | Рисует полоски на шкале и всплывающее уведомление. Только отрисовка. |
| `content/content.js` | Главная логика на странице: навигация, ожидание субтитров, запросы к background, перемотка. |
| `content/content.css` | Стили полосок и уведомления (классы `ais-*`). |
| `popup/popup.html/.css/.js` | Окно по клику на иконку: выключатели и статус текущего видео. |
| `options/options.html/.js` | Страница настроек: свой ключ, модель, адрес сервера, очистка кэша. |
| `common/theme.css` | Общий стиль popup и настроек: цвета, «стекло», текстура камня, переключатели, кнопки. |
| `icons/` | Логотип: `icon.svg` — исходник, `icon16/32/48/128.png` — готовые иконки для Chrome, сделанные из него. |

### backend/
| Файл | Зачем |
|---|---|
| `package.json` | Описание проекта и зависимостей, команды `npm run dev` (локально), `npm run deploy` (в интернет), `npm run db:init` (таблицы). |
| `wrangler.jsonc` | Настройки Cloudflare Workers: имя, база D1, обычные настройки (`vars`: модели, лимиты). |
| `schema.sql` | Таблицы базы: кэш рекламы, кэш «главного», отзывы, счётчики лимитов. |
| `.dev.vars.example` | Образец файла с секретами для локального запуска. Настоящий `.dev.vars` не коммитится. |
| `src/index.js` | Сервер на Cloudflare Workers: маршруты `/health`, `/analyze`, `/highlights` («Найти главное»), `/feedback`, лимиты запросов, кэш, защита от двойного анализа. |
| `src/ai.js` | Две «задачи» для ИИ (реклама и «главное») через общую функцию `runTask`: перебор моделей, логирование, проверка ответа через zod. |
| `src/prompt.js` | Промт и JSON-схема (копия того, что в расширении). |
| `src/db.js` | SQLite: таблицы `analyses` (кэш) и `feedback` (отзывы). |

### Корень
| Файл | Зачем |
|---|---|
| `README.md` | Как запустить. |
| `LEARNING.md` | Этот файл. |
| `.gitignore` | Что не класть в git: `node_modules`, `.env`, `.dev.vars`, локальные данные wrangler. |

---

## 3. В каком порядке читать

От простого к сложному:

1. **`extension/manifest.json`** — с него начинается любое расширение. Обратите внимание на два блока `content_scripts`: один с `"world": "MAIN"`, другой без.
2. **`extension/common/settings.js`** — короткий, знакомит с `chrome.storage`.
3. **`extension/content/transcript.js`** — обычный JS без API браузера: парсинг JSON и форматирование времени. Можно запустить в Node.
4. **`extension/content/interceptor.js`** — короткий, но самый «хитрый» по идее. Прочитайте раздел 4 ниже про перехват.
5. **`extension/content/ui.js`** — работа с DOM: создание элементов, стили, проценты.
6. **`extension/content/content.js`** — главная логика. Читайте сверху вниз по разделам 1–5.
7. **`extension/background.js`** — сетевые запросы, хэширование, fallback.
8. **`extension/popup/*`** и **`extension/options/*`** — обычные HTML-страницы с JS.
9. **`backend/src/db.js`** → **`backend/src/prompt.js`** → **`backend/src/ai.js`** → **`backend/src/index.js`**.

---

## 4. Ключевые приёмы

### Перехват XHR и fetch (`interceptor.js`)
Мы сохраняем ссылку на оригинальную функцию и подставляем свою, которая делает то же самое плюс что-то ещё:
```js
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method, url) {
  // ... наш код: подписались на 'load' ...
  return originalOpen.apply(this, arguments); // и вызвали оригинал
};
```
Метод `open` лежит в **прототипе**, поэтому подмена действует на все XHR-запросы страницы. Для `fetch` используем `response.clone()`, потому что тело ответа можно прочитать только один раз, а оригинал нужен плееру.
Почему не скачать субтитры самим: YouTube требует токен (`pot`), который генерирует плеер, и без него отдаёт пустой ответ.

### world MAIN против изолированного content script
У content script обычно **свой** набор JS-переменных («изолированный мир»): DOM общий со страницей, а `window.fetch`, глобальные переменные — свои. Это защита: страница не может влезть в код расширения, и наоборот.
- `interceptor.js` в **MAIN** — видит те же `fetch`/`XMLHttpRequest`, что и YouTube, поэтому подмена работает. Зато у него нет доступа к `chrome.*` API.
- `content.js` в **изолированном мире** — имеет `chrome.runtime`, `chrome.storage`, но подменять `fetch` страницы оттуда бесполезно.

### window.postMessage (мост между мирами)
Миры не делят переменные, но делят `window`. `interceptor.js` вызывает `window.postMessage(данные)`, `content.js` слушает `window.addEventListener('message', ...)`.
Важно: сообщения может отправить **любой** скрипт на странице. Поэтому `content.js` проверяет `event.source === window` и метку `data.source === 'ai-skipper'`.

### Service worker (`background.js`)
Фоновая часть расширения в Manifest V3. У неё нет страницы и нет DOM; Chrome запускает её при событии (например, пришло сообщение) и усыпляет примерно через 30 секунд простоя. Поэтому:
- нельзя хранить важные данные в переменных — после сна они пропадут (используем `chrome.storage`);
- при долгом запросе к ИИ мы периодически вызываем `chrome.runtime.getPlatformInfo()` (`keepAliveWhile`), чтобы Chrome не усыпил worker.
Общение: `chrome.runtime.sendMessage` из content/popup → `chrome.runtime.onMessage` в background. `return true` в обработчике означает «отвечу позже».

### chrome.storage
Хранилище расширения (как `localStorage`, но асинхронное и доступное всем частям расширения).
- `chrome.storage.local.get('settings')` / `.set({ settings })`.
- `chrome.storage.onChanged` — событие при любом изменении. Так content.js мгновенно узнаёт, что в popup выключили тип сегмента.
Ключ пользователя лежит здесь и не попадает в код страницы YouTube.

### SPA-навигация YouTube
YouTube — одностраничное приложение: при клике на другое видео страница не перезагружается, меняется только URL и содержимое. Значит, content script запускается **один раз**, и он сам должен заметить смену видео:
- событие `yt-navigate-finish`, которое генерирует YouTube;
- плюс проверка `location` раз в секунду (подстраховка).
При смене видео сбрасываем `state`. А в асинхронных функциях после каждого `await` проверяем `if (state.videoId !== videoId) return;` — иначе ответ для старого видео мог бы примениться к новому.

### Кэш
- **Backend:** таблица `analyses` в SQLite, ключ — `video_id`. Повторный запрос того же видео не тратит запрос к ИИ (`source: 'cache'`).
- **Двойной запрос:** если два запроса на одно видео пришли одновременно, второй ждёт тот же Promise из `inProgress` (Map в index.js).
- **Режим «свой ключ»:** кэш в `chrome.storage.local` с ключами `cache_<videoId>`.

### Fallback моделей
`ai.js → analyzeTranscript()` перебирает модели из `AI_MODELS` в цикле `for`. Любая ошибка (сеть, HTTP 429/5xx, таймаут `AbortSignal.timeout`, невалидный JSON, неверная форма ответа) попадает в `catch`, логируется, и цикл идёт к следующей модели. Только если не справились все — ошибка уходит пользователю.

**Почему такая запасная модель.** Основная — `nvidia/nemotron-3-super-120b-a12b:free`. Запасная — та же модель, но **платная** версия `nvidia/nemotron-3-super-120b-a12b` (около $0.08 за миллион входных токенов и $0.45 за миллион выходных — анализ одного видео стоит доли цента). Причины:
1. У бесплатных моделей OpenRouter **общий** дневной лимит на аккаунт. Чаще всего основная модель падает именно с 429, и другая `:free`-модель в этот момент упрётся в тот же лимит. Платная версия этого лимита не имеет.
2. Та же модель → тот же стиль ответов, промт подобран под неё, поддерживаются structured outputs.
Минус: нужен ненулевой баланс на OpenRouter. Если платить не хочется, поставьте второй `google/gemma-4-31b-it:free` (поддерживает JSON-режим, но не строгую схему).

### Размышления модели и max_tokens (замер)
Nemotron 3 Super — «думающая» модель: сначала пишет скрытые рассуждения (`reasoning_tokens` в `usage`), потом ответ. Мы прогнали 4 реальных видео в 5 режимах:

| Режим | Время ответа | Качество |
|---|---|---|
| без параметра / high / low / minimal | 6–42 с; в 2 из 16 запусков модель зациклилась (16 000 токенов размышлений, ~2 мин, ответа нет) | находит рекламу хорошо |
| `reasoning: { enabled: false }` (off) | 1–2 с | плохо: пропустила 4 настоящих фрагмента, а 2 фрагмента обычного видео (рассказ о ноже, финальный вывод) пометила как рекламу |

Выводы:
- Уровни minimal/low/high у этой модели почти ни на что не влияют: время скачет случайно.
- Выключать размышления быстро, но опасно: пропуск *настоящего* содержания хуже, чем непропущенная реклама.
- Против зацикливания помогает `max_tokens` (`AI_MAX_TOKENS=6000`): размышления обрываются примерно через 40 секунд, приходит пустой ответ (`finish_reason=length`), и fallback переходит к следующей модели.
- Ждать долго приходится один раз на видео: дальше ответ берётся из кэша.

Чтобы проверить самим: `"AI_REASONING_EFFORT": "off"` в `backend/wrangler.jsonc` (раздел `vars`).

Ещё одна ловушка, найденная при замере: `await fetch(...)` завершается, когда пришли **заголовки** ответа, а не всё тело. OpenRouter присылает заголовки сразу, поэтому время ответа модели надо мерить после `await response.text()`.

### Structured outputs
В запросе передаётся `response_format: { type: 'json_schema', json_schema: {...} }`. Модели, которые это поддерживают, обязаны вернуть JSON строго по схеме. Остальные параметр игнорируют — поэтому ответ всё равно проверяется.

### Валидация через zod (`ai.js`, `index.js`)
zod — библиотека, где вы описываете «как должны выглядеть данные», а она проверяет:
```js
const segmentSchema = z.object({ start_seconds: z.coerce.number().min(0), ... })
  .refine((s) => s.start_seconds < s.end_seconds);
const result = segmentSchema.safeParse(item); // { success: true, data } или { success: false, error }
```
Используется в двух местах: проверка входящих запросов к серверу (`analyzeBodySchema`) и проверка ответа ИИ (каждый сегмент отдельно — плохие выбрасываются, хорошие остаются). В расширении zod нет (нет сборщика), там та же проверка написана вручную — `cleanSegments()` в background.js. Сравните их.

### Rate limiting (`index.js`, `db.js`)
Два лимита, оба хранятся в таблице `counters` базы D1 (функция `hitCounter`):
- **запросы с одного IP в минуту** (`RATE_LIMIT_PER_MINUTE`). Сам IP не храним — только его хэш;
- **вызовы ИИ за сутки на всех** (`DAILY_AI_LIMIT`). Ответы из кэша не считаются. Это защита баланса OpenRouter: адрес сервера виден в коде расширения, и кто угодно может слать на него запросы.

Превысил — HTTP 429. Весь счётчик — один SQL-запрос `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`: создать запись, увеличить счётчик или начать новое окно — и сразу вернуть новое значение.

### Cloudflare Workers и D1 (`backend/`)
Сервер не «висит» постоянно, как Express с `app.listen()`. Cloudflare вызывает функцию `fetch(request, env)` из `index.js` на каждый запрос — на своих серверах, бесплатно (до 100 000 запросов в сутки) и без «засыпания».
- **env** — всё, что настроено в `wrangler.jsonc`: база (`env.DB`), обычные настройки (`vars`) и секреты. Благодаря флагу `nodejs_compat` те же значения доступны и через `process.env` (так их читает `ai.js`).
- **D1** — это SQLite в облаке. Запросы асинхронные (`await db.prepare(...).bind(...).first()`).
- **Секреты** (ключ OpenRouter) не пишутся в код и в `wrangler.jsonc`: локально — файл `.dev.vars`, в интернете — `npx wrangler secret put`.
- **Локально** (`npm run dev`) wrangler запускает тот же код и локальную копию D1 у вас на компьютере.
- Ожидание ответа ИИ (30–60 с) не ограничено по времени: лимит бесплатного тарифа — 10 мс *работы процессора* на запрос, а ожидание сети в него не входит.
(Если сервер стоит за прокси, например nginx, нужно `app.set('trust proxy', 1)`, иначе все пользователи будут выглядеть как один IP.)

### SHA-256 префикс (SponsorBlock)
Вместо ID видео отправляем первые 4 символа его хэша. Сервер возвращает разметку для всех видео с таким префиксом, а мы выбираем своё. SponsorBlock не знает, какое видео вы смотрите.

---

## 5. Термины, которые стоит загуглить

- Chrome Extension Manifest V3
- content script, isolated world, `world: "MAIN"`
- service worker (extension service worker lifecycle)
- `chrome.runtime.sendMessage`, `chrome.tabs.sendMessage`
- `chrome.storage.local`, `chrome.storage.onChanged`
- `window.postMessage`, `MessageEvent.source`
- `XMLHttpRequest.prototype`, прототипы в JavaScript, monkey patching
- `fetch`, `Response.clone()`
- SPA (single-page application), History API
- `async/await`, Promise, `Promise.finally`
- CORS, `host_permissions`
- SHA-256, `crypto.subtle.digest`, k-anonymity
- HTML5 video: `currentTime`, `timeupdate`, `durationchange`
- Cloudflare Workers, D1, wrangler, `fetch` handler
- SQLite, prepared statements, SQL-инъекция, WAL
- переменные окружения и секреты (`.dev.vars`, `wrangler secret`)
- OpenRouter, OpenAI-совместимый API, chat completions
- structured outputs, JSON Schema
- zod, `safeParse`, `refine`, `coerce`
- rate limiting, HTTP 429, HTTP 502
- `AbortSignal.timeout`
- fallback, retry

---

## 6. Задания для самопроверки

1. **Поменяйте время ожидания субтитров** с 5 до 8 секунд.
   *Подсказка:* константа `SUBTITLES_WAIT_MS` в начале `extension/content/content.js`.

2. **Сделайте пропуск более «осторожным»:** пропускать только сегменты ИИ с уверенностью от 0.7.
   *Подсказка:* `MIN_CONFIDENCE` в `content.js`. Посмотрите, где он используется (`shouldSkip`).

3. **Поменяйте цвет полоски самопиара** на оранжевый.
   *Подсказка:* `TYPE_COLORS` в `extension/content/ui.js` и `.dot.selfpromo` в `popup/popup.css`.

4. **Добавьте новый тип сегмента** `"intro"` (заставка в начале видео).
   *Подсказка:* нужно поменять промт и `SEGMENT_TYPES` в двух местах (`backend/src/prompt.js` и `extension/common/prompt.js`), добавить тип в `DEFAULT_SETTINGS.types` (`common/settings.js`), цвет и название в `ui.js`, чекбокс в `popup.html` и название в `popup.js`. Для SponsorBlock — категорию `intro` в `background.js`. Хороший способ понять, как связаны все части.

5. **Добавьте маршрут `GET /stats`**, который возвращает число проанализированных видео и отзывов.
   *Подсказка:* новая функция в `backend/src/db.js` с `await db.prepare('SELECT COUNT(*) AS count FROM analyses').first()` и новая ветка для `GET /stats` в `handleRequest` (`index.js`).

6. **Показывайте в уведомлении причину**, которую назвал ИИ (`segment.reason`).
   *Подсказка:* функция `showSkippedToast()` в `content.js`.

7. **Сделайте так, чтобы отметка «Это не реклама» сохранялась** после перезагрузки страницы.
   *Подсказка:* в `markNotAd()` сохраните в `chrome.storage.local` что-то вроде `ignored_<videoId>`, а в `applySegments()` прочитайте и проставьте `ignored: true`.

8. **Добавьте третью модель в fallback** и проверьте, что она вызывается: временно поставьте первой несуществующую модель (`nonexistent/model`) и посмотрите логи сервера.
   *Подсказка:* `AI_MODELS` в `backend/wrangler.jsonc` (раздел `vars`). Локальный сервер перезапустится сам.

9. **Поменяйте лимит запросов** на 5 в минуту и проверьте, что шестой запрос получает 429.
   *Подсказка:* `RATE_LIMIT_PER_MINUTE` в `wrangler.jsonc`; запросы можно слать через `curl` или вкладку Network.

10. **Посмотрите, что сохранилось в базе:** выполните `npx wrangler d1 execute skipper-flow --local --command "SELECT * FROM feedback"` (или `--remote` для базы в интернете) и найдите свои отзывы.

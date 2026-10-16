# Skipper Flow — тексты для Chrome Web Store

Всё, что нужно скопировать в панель разработчика (https://chrome.google.com/webstore/devconsole).

Расширение на трёх языках (`extension/_locales/en`, `ru`, `uk`), язык по умолчанию — английский. Поэтому в магазине:
- **название и краткое описание** подставятся сами из `_locales` для каждого языка;
- **подробное описание и скриншоты** заполняются отдельно для каждого языка: на вкладке «Store listing» есть выбор языка — сначала English (язык по умолчанию), потом добавить Русский и Українська.

---

## 1. Вкладка «Store listing» — English (по умолчанию)

**Name / Short description** — из `_locales/en/messages.json`:
- Skipper Flow — skip YouTube sponsors
- Skips sponsor segments in YouTube videos, bleeps profanity and slurs for streamers, and finds video highlights.

**Category:** Tools (или Entertainment).

**Description:**

```
Skipper Flow makes watching YouTube cleaner: it skips creators' sponsor segments, mutes forbidden words and helps you quickly find what matters in a video.

⏭ SKIP CREATORS' ADS
• Automatically skips sponsored segments, self-promotion (merch, Patreon, courses) and "subscribe" reminders.
• First it uses ready-made markup from the open SponsorBlock database. If there is none, an AI finds the segments from the video's subtitles — great for smaller and non-English channels that SponsorBlock rarely covers.
• Colored marks on the video timeline, plus "Watch the ad" and "Not an ad" buttons.
• Each type can be turned off separately.

🎙 STREAMER MODE / PROFANITY FILTER
• Bleeps or mutes slurs and profanity in videos — for example, when you react to videos live.
• Warns you a few seconds before a forbidden word.
• Dictionaries for English, Russian and Ukrainian + your own words.
• Works in YouTube Shorts too.
• Audio is muted right in the tab, so your streaming software (OBS) captures the already-muted sound.

📌 VIDEO HIGHLIGHTS
• The author's chapters — instantly and for free.
• "Find highlights" button: the AI picks 3–6 key moments you can jump to in one click.

🧼 CLEAN MODE
• Everything works, but there are no colored marks on the video timeline.

GOOD TO KNOW
• The extension works from video subtitles. If a video has no subtitles, AI analysis and streamer mode are unavailable.
• Subtitles are sometimes wrong, so streamer mode helps but is not a 100% guarantee.
• The extension does not block YouTube's own ads and is not affiliated with YouTube or Google.

Ad segment data is partly provided by SponsorBlock (sponsor.ajay.app) under the CC BY-NC-SA 4.0 license.
```

**Images:** `store/images/en/` — `promo-440x280.png` и три `screenshot-*.png` (1280×800).

---

## 2. Вкладка «Store listing» — Русский

**Название / краткое описание** — из `_locales/ru/messages.json`:
- Skipper Flow — пропуск рекламы в YouTube
- Пропускает рекламные вставки в видео YouTube, запикивает мат и оскорбления для стримеров, показывает главное в видео.

**Подробное описание:**

```
Skipper Flow делает просмотр YouTube чище: пропускает рекламные вставки авторов, глушит запрещённые слова и помогает быстро найти главное в видео.

⏭ ПРОПУСК РЕКЛАМЫ АВТОРОВ
• Автоматически перематывает спонсорскую рекламу, саморекламу (мерч, Boosty, курсы) и просьбы подписаться.
• Сначала берёт разметку из открытой базы SponsorBlock. Если её нет — фрагменты находит ИИ по субтитрам видео. Это особенно полезно для русскоязычных и небольших каналов, которые SponsorBlock размечает редко.
• Цветные метки на шкале видео, кнопка «Посмотреть рекламу» и «Это не реклама».
• Каждый тип можно выключить отдельно.

🎙 РЕЖИМ СТРИМЕРА / ФИЛЬТРАЦИЯ МАТА
• Запикивает или глушит оскорбления и мат в видео — например, когда вы реагируете на ролики в эфире.
• Предупреждает за несколько секунд до запрещённого слова.
• Словари на русском, украинском и английском + свои слова.
• Работает и в YouTube Shorts.
• Звук глушится прямо во вкладке, поэтому программа для стрима (OBS) захватывает уже заглушённый звук.

📌 ГЛАВНОЕ В ВИДЕО
• Главы от автора — сразу и бесплатно.
• Кнопка «Найти главное»: ИИ выделит 3–6 ключевых моментов, к ним можно перейти в один клик.

🧼 ЧИСТЫЙ РЕЖИМ
• Всё работает, но на шкале видео нет цветных меток.

ВАЖНО
• Расширение работает по субтитрам видео. Если субтитров нет, ИИ-анализ и режим стримера недоступны.
• Субтитры иногда ошибаются, поэтому режим стримера помогает, но не даёт 100% гарантии.
• Расширение не блокирует рекламу самого YouTube и не связано с YouTube или Google.

Данные о рекламных сегментах частично предоставлены SponsorBlock (sponsor.ajay.app) по лицензии CC BY-NC-SA 4.0.
```

**Картинки:** `store/images/ru/` — `promo-440x280.png` и три `screenshot-*.png`.

---

## 2а. Вкладка «Store listing» — Українська

**Назва / короткий опис** — з `_locales/uk/messages.json`:
- Skipper Flow — пропуск реклами на YouTube
- Пропускає рекламні вставки у відео YouTube, запікує мат і образи для стрімерів, показує головне у відео.

**Детальний опис:**

```
Skipper Flow робить перегляд YouTube чистішим: пропускає рекламні вставки авторів, глушить заборонені слова й допомагає швидко знайти головне у відео.

⏭ ПРОПУСК РЕКЛАМИ АВТОРІВ
• Автоматично перемотує спонсорську рекламу, саморекламу (мерч, Patreon, курси) і прохання підписатися.
• Спершу бере розмітку з відкритої бази SponsorBlock. Якщо її немає — фрагменти знаходить ШІ за субтитрами відео. Це особливо корисно для україномовних і невеликих каналів, які SponsorBlock розмічає рідко.
• Кольорові мітки на шкалі відео, кнопки «Переглянути рекламу» і «Це не реклама».
• Кожен тип можна вимкнути окремо.

🎙 РЕЖИМ СТРІМЕРА / ФІЛЬТРАЦІЯ МАТУ
• Запікує або глушить образи й мат у відео — наприклад, коли ви реагуєте на ролики в ефірі.
• Попереджає за кілька секунд до забороненого слова.
• Словники українською, англійською й російською + власні слова.
• Працює і в YouTube Shorts.
• Звук глушиться прямо у вкладці, тому програма для стріму (OBS) захоплює вже заглушений звук.

📌 ГОЛОВНЕ У ВІДЕО
• Розділи від автора — одразу й безкоштовно.
• Кнопка «Знайти головне»: ШІ виділить 3–6 ключових моментів, до них можна перейти в один клік.

🧼 ЧИСТИЙ РЕЖИМ
• Усе працює, але на шкалі відео немає кольорових міток.

ВАЖЛИВО
• Розширення працює за субтитрами відео. Якщо субтитрів немає, ШІ-аналіз і режим стрімера недоступні.
• Субтитри іноді помиляються, тому режим стрімера допомагає, але не дає 100% гарантії.
• Розширення не блокує рекламу самого YouTube і не пов’язане з YouTube або Google.

Дані про рекламні сегменти частково надані SponsorBlock (sponsor.ajay.app) за ліцензією CC BY-NC-SA 4.0.
```

**Картинки:** `store/images/uk/` — `promo-440x280.png` і три `screenshot-*.png`.

---

## 3. Вкладка «Privacy practices» (одна на все языки — заполняем по-английски)

**Single purpose:**

```
Improving the YouTube viewing experience: using video subtitles, the extension finds and skips creators' sponsor segments, mutes forbidden words and shows the key moments of a video.
```

**Permission justification:**

| Permission | Justification |
|---|---|
| `storage` | Stores the user's settings (enabled features, custom words, an optional OpenRouter key) and a cache of analysis results on the device. |
| Host access to `https://www.youtube.com/*` (content scripts) | The extension works only on YouTube: it reads the current video's subtitles, skips sponsor segments, mutes forbidden words and draws marks on the video timeline. |
| `https://sponsor.ajay.app/*` | Fetches ready-made sponsor segment markup from the open SponsorBlock database. Only a 4-character prefix of a hash of the video ID is sent, not the ID itself. |
| `https://openrouter.ai/*` | Only if the user has entered their own OpenRouter key: the video's subtitles are sent directly to an AI model to find ads and key moments. |
| `https://skipper-flow-api.bellka.workers.dev/*` | Our own server: AI analysis of subtitles and a results cache for users without their own key; "Not an ad" feedback. |

**Remote code:** «No, I am not using remote code». Весь код лежит внутри расширения; с серверов приходят только данные (JSON), не код.

**Data usage** — отметить:

- ☑ **Website content** — текст субтитров видео отправляется на наш сервер (или в OpenRouter со своим ключом) для анализа ИИ.
- ☑ **Web history** — ID видео, которое анализирует ИИ, отправляется на наш сервер, чтобы найти результат в кэше.
- ☐ Personally identifiable information — нет.
- ☐ Health, Financial, Location, Personal communications, User activity — нет.
- ☐ Authentication information — **не отмечаем**: ключ OpenRouter хранится только на устройстве и отправляется только в сам OpenRouter по желанию пользователя, мы его не получаем.

И поставить три галочки-подтверждения:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Контактная почта издателя** (Account → Contact email, будет видна в магазине): skipperflow.help@gmail.com

**Privacy policy URL:** https://bellka555.github.io/skipper-flow/privacy.html (страница на английском и русском, файл `docs/privacy.md`, публикуется через GitHub Pages).

---

## 4. Картинки

| Что | Файл | Размер |
|---|---|---|
| Иконка (одна на все языки) | `extension/icons/icon128.png` | 128×128 (рисунок 96×96 + поля 16 px) |
| Маленькая промо-картинка | `store/images/{en,ru,uk}/promo-440x280.png` | 440×280 |
| Скриншоты (1–5) | `store/images/{en,ru,uk}/screenshot-*.png` | 1280×800 |

---

## 5. Перед отправкой

- [x] Сервер в интернете (https://skipper-flow-api.bellka.workers.dev), адрес вписан в `extension/common/settings.js` и `manifest.json`
- [x] Из `host_permissions` убраны `http://localhost/*` и `http://127.0.0.1/*`
- [x] Политика конфиденциальности опубликована: https://bellka555.github.io/skipper-flow/privacy.html
- [ ] Собран архив: `pack-extension.ps1` → `dist/skipper-flow-1.0.0.zip`
- [ ] Аккаунт разработчика Chrome Web Store (разовый взнос $5)
- [ ] Расширение проверено на чистом профиле Chrome (без старых настроек)

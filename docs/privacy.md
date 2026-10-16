# Skipper Flow — Privacy Policy / Политика конфиденциальности

[English](#english) · [Русский](#russian)

<a id="english"></a>

## Privacy Policy (English)

_Last updated: October 17, 2026_

Skipper Flow is a Chrome extension that skips sponsor segments in YouTube videos, mutes forbidden words and shows the key moments of a video. This policy explains what data the extension uses and where it is sent.

### In short

- We **do not collect** names, emails, accounts, passwords or any other personal data.
- We **do not sell** data or share it with advertisers.
- For the AI analysis, **only the video ID and its subtitle text** are sent to our server.

### What data is processed

#### Stored only on your device
- **Extension settings** (which features are on, your own words for streamer mode).
- **Your OpenRouter key**, if you entered one. It is sent only to OpenRouter itself and never to our server.
- **The results cache**, if you use your own key.

This data lives in browser storage (`chrome.storage.local`) and is deleted together with the extension.

#### Sent to SponsorBlock (sponsor.ajay.app)
- **The first 4 characters of a hash of the video ID** — to get ready-made ad markup. The video ID itself is not sent, so SponsorBlock doesn't know which exact video you are watching.

#### Sent to the Skipper Flow server
Only when an AI analysis is needed and you haven't set your own key:
- **the video ID** — to find an existing result in the cache instead of analyzing the video again;
- **the video's subtitle text** — so the AI can find ad segments or key moments;
- **the subtitle language**.

The "Not an ad" button sends the video ID, the time and the type of the segment — to improve the analysis.

The server runs on Cloudflare Workers. It stores the analysis results (video ID and the segments found) and the feedback. Subtitle text is not stored after the analysis. To limit the request rate, the server remembers for one minute not your IP address but an irreversible hash of it; the IP address itself is not stored.

For the analysis, the server passes the subtitle text to an AI model through the OpenRouter service (openrouter.ai).

#### Sent to OpenRouter directly
Only if you entered your own OpenRouter key: the subtitle text and language are sent from your browser straight to OpenRouter. This data is handled under [OpenRouter's privacy policy](https://openrouter.ai/privacy).

#### Streamer mode and video chapters
They work entirely in the browser: forbidden-word detection and chapters are not sent anywhere.

### What the extension does not do
- It does not track which sites you visit other than YouTube.
- It does not read your comments, messages, or Google / YouTube account data.
- It does not show ads or use data for advertising.
- It does not download or execute code from external servers.

### Your rights
At any time you can:
- turn off any feature in the extension window;
- clear the cache and delete your key on the settings page;
- remove the extension — all data on your device is deleted with it.

To delete data from the server (analysis results or feedback for a specific video), contact us.

### Contact
For privacy and data deletion questions: **skipperflow.help@gmail.com**

### Changes
If this policy changes, we will update this page and the date at the top.

---

<a id="russian"></a>

## Политика конфиденциальности (русский)

_Последнее обновление: 17 октября 2026 г._

Skipper Flow — расширение для браузера Chrome, которое пропускает рекламные вставки в видео YouTube, глушит запрещённые слова и показывает ключевые моменты видео. Эта политика объясняет, какие данные расширение использует и куда они отправляются.

### Коротко

- Мы **не собираем** имя, почту, аккаунты, пароли и другие личные данные.
- Мы **не продаём** и не передаём данные рекламодателям.
- Для анализа ИИ на наш сервер отправляются **только ID видео и текст его субтитров**.

### Какие данные обрабатываются

#### Хранится только на вашем устройстве
- **Настройки расширения** (какие функции включены, свои слова для режима стримера).
- **Ключ OpenRouter**, если вы его указали. Он отправляется только в сам OpenRouter и никогда — на наш сервер.
- **Кэш результатов**, если вы пользуетесь своим ключом.

Эти данные лежат в хранилище браузера (`chrome.storage.local`) и удаляются вместе с расширением.

#### Отправляется в SponsorBlock (sponsor.ajay.app)
- **Первые 4 символа хэша ID видео** — чтобы получить готовую разметку рекламы. Сам ID видео не отправляется, поэтому SponsorBlock не знает, какое именно видео вы смотрите.

#### Отправляется на сервер Skipper Flow
Только когда нужен анализ ИИ и вы не указали свой ключ:
- **ID видео** — чтобы найти уже готовый результат в кэше и не анализировать видео повторно;
- **текст субтитров видео** — чтобы ИИ нашёл рекламные вставки или ключевые моменты;
- **язык субтитров**.

По кнопке «Это не реклама» отправляются ID видео, время и тип фрагмента — чтобы улучшать качество анализа.

Сервер работает на платформе Cloudflare Workers. Он хранит результаты анализа (ID видео и найденные фрагменты) и отзывы. Текст субтитров после анализа не сохраняется. Чтобы ограничить частоту запросов, сервер на одну минуту запоминает не сам IP-адрес, а его необратимый хэш; сам IP-адрес не сохраняется.

Для анализа сервер передаёт текст субтитров модели ИИ через сервис OpenRouter (openrouter.ai).

#### Отправляется в OpenRouter напрямую
Только если вы сами указали свой ключ OpenRouter: текст субтитров и язык отправляются напрямую из вашего браузера в OpenRouter. Обработка этих данных регулируется [политикой OpenRouter](https://openrouter.ai/privacy).

#### Режим стримера и главы видео
Работают полностью в браузере: поиск запрещённых слов и главы видео никуда не отправляются.

### Чего расширение не делает
- Не отслеживает, какие сайты вы посещаете, кроме YouTube.
- Не читает ваши комментарии, сообщения, данные аккаунта Google или YouTube.
- Не показывает рекламу и не использует данные для рекламы.
- Не загружает и не выполняет код с внешних серверов.

### Ваши права
Вы можете в любой момент:
- выключить любую функцию в окне расширения;
- очистить кэш и удалить ключ на странице настроек;
- удалить расширение — все данные на устройстве удалятся вместе с ним.

Чтобы удалить данные с сервера (результаты анализа или отзывы по конкретному видео), напишите нам.

### Контакты
По вопросам о конфиденциальности и удалению данных: **skipperflow.help@gmail.com**

### Изменения
Если политика изменится, мы обновим эту страницу и дату вверху.

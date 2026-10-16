// ГЛАВНЫЙ CONTENT SCRIPT (изолированный мир).
// Он работает на каждой странице youtube.com и делает следующее:
//   1. Получает субтитры от interceptor.js (через window.postMessage).
//   2. Следит за переходами между видео (YouTube — SPA, страница не перезагружается).
//   3. Для нового видео: спрашивает SponsorBlock -> если пусто, ждёт субтитры -> отправляет на анализ ИИ.
//   4. Во время просмотра перематывает рекламные сегменты.
//   5. Режим стримера: ищет в субтитрах запрещённые слова и глушит их (логика — в streamer.js).
//   6. «Найти главное» (по кнопке в popup): ИИ находит ключевые моменты, к ним можно перейти.
// Сетевые запросы делает не он, а background.js (см. sendToBackground).

const MIN_CONFIDENCE = 0.5; // сегменты с меньшей уверенностью ИИ показываем на шкале, но не пропускаем
const SUBTITLES_WAIT_MS = 5000; // сколько ждём, что плеер сам запросит субтитры

let settings = { ...DEFAULT_SETTINGS };

// Перехваченные субтитры: { [videoId]: { lines: [...], words: [...], language: 'ru' } }.
// lines — строки «мм:сс текст» для ИИ, words — отдельные слова со временем для режима стримера.
// Храним по videoId, потому что субтитры могут прийти чуть раньше, чем мы заметим смену видео.
const transcripts = {};

// Главы видео от interceptor.js: { [videoId]: { kind: 'author' | 'auto', chapters: [{ start, title }] } }.
// Тоже по videoId: данные о видео приходят раньше, чем мы замечаем смену видео.
const chaptersByVideo = {};

// Состояние текущего видео. При переходе к другому видео создаём новое.
let state = createEmptyState(null);

function createEmptyState(videoId) {
  return {
    videoId: videoId,
    status: 'idle', // idle | off | loading | ready | unavailable | error
    message: '',
    source: null, // 'sponsorblock' | 'ai' | 'cache'
    model: null,
    segments: [], // { start, end, type, confidence, reason, ignored }
    transcriptPromise: null, // общее ожидание субтитров для рекламы и режима стримера
    // Режим стримера
    wordStatus: 'idle', // idle | loading | ready | unavailable
    wordMessage: '',
    wordRanges: [], // найденные отрезки с запрещёнными словами (для шкалы и popup)
    // «Найти главное»
    highlightsStatus: 'idle', // idle | loading | ready | unavailable | error
    highlightsMessage: '',
    highlights: [], // { start, title }
  };
}

let video = null; // элемент <video> плеера

// ---------------------------------------------------------------------------
// 1. Приём субтитров от interceptor.js
// ---------------------------------------------------------------------------

window.addEventListener('message', (event) => {
  // Проверяем источник: сообщение должно прийти из этого же окна (а не из iframe с чужого сайта)
  // и иметь нашу метку. Любой скрипт на странице может вызвать postMessage, поэтому проверка обязательна.
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'ai-skipper') return;

  // Главы видео — просто запоминаем; popup заберёт их через getStatus
  if (data.type === 'chapters') {
    if (typeof data.videoId === 'string' && Array.isArray(data.chapters)) {
      chaptersByVideo[data.videoId] = { kind: data.kind, chapters: data.chapters };
    }
    return;
  }

  if (data.type !== 'timedtext') return;

  const videoId = getUrlParam(data.url, 'v');
  if (!videoId || transcripts[videoId]) return; // уже есть субтитры для этого видео

  const lines = parseJson3(data.text);
  if (lines.length === 0) return;

  // tlang — язык автоперевода, lang — исходный язык субтитров
  const language = getUrlParam(data.url, 'tlang') || getUrlParam(data.url, 'lang') || 'unknown';
  transcripts[videoId] = { lines: lines, words: parseJson3Words(data.text), language: language };

  // Подстраховка для режима стримера: субтитры пришли позже, чем мы их ждали
  // (например, пользователь сам включил их) — сразу ищем в них слова.
  if (videoId === state.videoId && settings.streamer.enabled && state.wordStatus === 'unavailable') {
    updateWordRanges();
  }
});

// ---------------------------------------------------------------------------
// 2. Отслеживание смены видео (SPA-навигация)
// ---------------------------------------------------------------------------

// Обычное видео: /watch?v=ID. Shorts: /shorts/ID. Главная, поиск и т.д. — не обрабатываем.
function getCurrentVideoId() {
  if (location.pathname === '/watch') return new URLSearchParams(location.search).get('v');
  if (isShortsPage()) return location.pathname.split('/')[2] || null;
  return null;
}

function isShortsPage() {
  return location.pathname.startsWith('/shorts/');
}

// У обычных видео и Shorts разные плееры. Важно выбирать по типу страницы: после перехода
// с обычного видео в Shorts старый плеер #movie_player остаётся на странице (скрытым) со своим видео.
function getPlayerId() {
  return isShortsPage() ? 'shorts-player' : 'movie_player';
}

function checkVideoChange() {
  const videoId = getCurrentVideoId();
  if (videoId === state.videoId) return; // видео не поменялось

  // Новое видео — сбрасываем всё, что относилось к старому.
  state = createEmptyState(videoId);
  setStreamerRanges([], video);
  removeSegmentsFromBar();
  hideToast();

  if (videoId) startForVideo(videoId);
}

// YouTube сам генерирует это событие после каждого перехода внутри сайта.
document.addEventListener('yt-navigate-finish', checkVideoChange);

// Подстраховка: раз в секунду проверяем URL и ищем <video> (вдруг событие не пришло).
// Заодно следим, чтобы наша кнопка была в панели плеера (YouTube может перерисовать панель).
setInterval(() => {
  checkVideoChange();
  attachToVideo();
  renderPlayerButton(settings.enabled, toggleEnabled);
}, 1000);

// Кнопка в плеере: включить/выключить весь пропуск рекламы.
// Сохраняем в chrome.storage — дальше сработает chrome.storage.onChanged (ниже),
// и все части расширения (включая popup) узнают о новом значении.
function toggleEnabled() {
  saveSettings({ enabled: !settings.enabled });
}

// Режим стримера: проверяем слова каждые 50 мс (почему не timeupdate — см. streamer.js).
// Во время рекламы YouTube в <video> идёт реклама, а не наше видео — ничего не глушим.
setInterval(() => {
  if (isYouTubeAdShowing()) {
    stopStreamerMuting(video);
    return;
  }
  // В Shorts не предупреждаем заранее: ролик короткий, а уведомлению там негде показаться
  const streamerSettings = isShortsPage() ? { ...settings.streamer, warn: false } : settings.streamer;
  checkStreamerWords(video, streamerSettings);
}, 50);

// ---------------------------------------------------------------------------
// 3. Получение разметки для видео
// ---------------------------------------------------------------------------

// Две независимые задачи: поиск рекламы и режим стримера. Работают параллельно,
// а субтитры ждут вместе (getTranscript), чтобы не «пинать» плеер дважды.
async function startForVideo(videoId) {
  settings = await loadSettings();

  // В Shorts работает только режим стримера: рекламных вставок в коротких роликах почти не бывает.
  if (isShortsPage()) setStatus('unavailable', 'В Shorts работает только режим стримера');
  else if (settings.enabled) runAdDetection(videoId);
  else setStatus('off', 'Пропуск рекламы выключен');

  if (settings.streamer.enabled) runWordFilter(videoId);
}

async function runAdDetection(videoId) {
  // Шаг 1: SponsorBlock. Если там уже есть разметка от людей — ИИ не нужен.
  setStatus('loading', 'Ищу разметку в SponsorBlock…');
  const sponsorBlock = await sendToBackground({ type: 'sponsorblock', videoId: videoId });
  if (state.videoId !== videoId) return; // пока ждали ответ, пользователь ушёл на другое видео

  if (sponsorBlock.segments && sponsorBlock.segments.length > 0) {
    applySegments(sponsorBlock.segments, 'sponsorblock', null);
    return;
  }

  // Шаг 2: ждём субтитры.
  setStatus('loading', 'Жду субтитры…');
  const transcript = await getTranscript(videoId);
  if (state.videoId !== videoId) return;

  if (!transcript) {
    setStatus('unavailable', 'Для этого видео анализ недоступен');
    showToast('Skipper Flow: для этого видео анализ недоступен', [], 4000);
    return;
  }

  // Шаг 3: отправляем расшифровку на анализ ИИ.
  setStatus('loading', 'ИИ анализирует субтитры…');
  const result = await sendToBackground({
    type: 'analyze',
    videoId: videoId,
    transcript: transcript.lines.join('\n'),
    language: transcript.language,
  });
  if (state.videoId !== videoId) return;

  if (result.error) {
    setStatus('error', 'Ошибка анализа: ' + result.error);
    return;
  }
  applySegments(result.segments, result.source, result.model);
}

// Режим стримера: ждём субтитры и ищем в них запрещённые слова.
async function runWordFilter(videoId) {
  state.wordStatus = 'loading';
  state.wordMessage = 'Жду субтитры…';

  const transcript = await getTranscript(videoId);
  if (state.videoId !== videoId) return;

  if (!transcript || transcript.words.length === 0) {
    state.wordStatus = 'unavailable';
    state.wordMessage = 'Нет субтитров — проверить слова нельзя';
    return;
  }
  updateWordRanges();
}

// Пересчитываем запрещённые слова (при первом запуске и когда меняются настройки режима).
function updateWordRanges() {
  const transcript = transcripts[state.videoId];
  if (!transcript) return;

  const ranges = findBadWordRanges(transcript.words, settings.streamer);
  setStreamerRanges(ranges, video);
  state.wordRanges = ranges;
  state.wordStatus = 'ready';
  state.wordMessage = ranges.length > 0 ? 'Будет заглушено мест: ' + ranges.length : 'Запрещённых слов не найдено';

  attachToVideo();
  redrawBar();
}

// «Найти главное»: запускается по кнопке в popup. ИИ получает расшифровку и возвращает 3–6 моментов.
async function runHighlights(videoId) {
  if (state.highlightsStatus === 'loading') return; // уже ищем — второй раз не запускаем
  state.highlightsStatus = 'loading';
  state.highlightsMessage = 'Жду субтитры…';

  const transcript = await getTranscript(videoId);
  if (state.videoId !== videoId) return;
  if (!transcript) {
    state.highlightsStatus = 'unavailable';
    state.highlightsMessage = 'Нет субтитров — найти главное нельзя';
    return;
  }

  state.highlightsMessage = 'ИИ ищет главное…';
  const result = await sendToBackground({
    type: 'highlights',
    videoId: videoId,
    transcript: transcript.lines.join('\n'),
    language: transcript.language,
  });
  if (state.videoId !== videoId) return;

  if (result.error) {
    state.highlightsStatus = 'error';
    state.highlightsMessage = 'Ошибка: ' + result.error;
    return;
  }
  state.highlights = result.moments || [];
  state.highlightsStatus = 'ready';
  state.highlightsMessage = state.highlights.length > 0 ? '' : 'Ключевых моментов не нашлось';
  redrawBar();
}

// Одно общее ожидание субтитров на видео: если его уже начала другая задача — ждём то же самое.
function getTranscript(videoId) {
  if (!state.transcriptPromise) state.transcriptPromise = waitForTranscript(videoId);
  return state.transcriptPromise;
}

// Ждём субтитры: сначала просто ждём, потом «пинаем» плеер, потом ждём ещё раз.
async function waitForTranscript(videoId) {
  // Shorts короткие — ждать 5 секунд нельзя, сразу просим плеер скачать субтитры
  if (isShortsPage()) {
    window.postMessage({ source: 'ai-skipper', type: 'request-captions', playerId: 'shorts-player' }, location.origin);
    await waitFor(() => transcripts[videoId], SUBTITLES_WAIT_MS, videoId);
    return transcripts[videoId] || null;
  }

  // Может, плеер уже сам запросил субтитры (например, если они включены у пользователя).
  if (await waitFor(() => transcripts[videoId], SUBTITLES_WAIT_MS, videoId)) {
    return transcripts[videoId];
  }

  // Пока идёт реклама YouTube (преролл), кнопка субтитров относится к рекламе — ждём её окончания.
  await waitFor(() => !isYouTubeAdShowing(), 60000, videoId);

  // Программно включаем и выключаем субтитры — плеер при этом скачает их, а мы перехватим.
  const nudged = await nudgeSubtitles(videoId);
  if (!nudged) return null; // кнопки субтитров нет — у видео нет субтитров

  await waitFor(() => transcripts[videoId], SUBTITLES_WAIT_MS, videoId);
  return transcripts[videoId] || null;
}

async function nudgeSubtitles(videoId) {
  // Кнопка «Субтитры» появляется не сразу после загрузки плеера — немного подождём.
  await waitFor(() => document.querySelector('#movie_player .ytp-subtitles-button'), 5000, videoId);
  const button = document.querySelector('#movie_player .ytp-subtitles-button');

  // Если у видео нет субтитров, YouTube прячет кнопку или делает её неактивной.
  if (!button) return false;
  if (getComputedStyle(button).display === 'none') return false;
  if (button.getAttribute('aria-disabled') === 'true') return false;

  // Запоминаем, были ли субтитры включены, чтобы в конце вернуть как было.
  const wasOn = button.getAttribute('aria-pressed') === 'true';

  // Если были включены — выключаем и снова включаем (плеер перезапросит субтитры).
  if (wasOn) {
    button.click();
    await sleep(300);
  }
  button.click(); // включаем

  // Ждём, пока субтитры реально придут, и только потом выключаем.
  // Раньше выключали через 0,8 с — при первой загрузке страницы плеер ещё грузит модуль субтитров
  // и не успевает сделать запрос, поэтому субтитры не приходили.
  await waitFor(() => transcripts[videoId], SUBTITLES_WAIT_MS, videoId);

  const isOn = button.getAttribute('aria-pressed') === 'true';
  if (isOn !== wasOn) button.click(); // возвращаем состояние, которое было у пользователя
  return true;
}

// Проверяем условие check() каждые 250 мс, пока оно не станет истинным или не выйдет время.
// Если пользователь переключился на другое видео — прекращаем ждать.
async function waitFor(check, timeoutMs, videoId) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (state.videoId !== videoId) return false;
    if (check()) return true;
    await sleep(250);
  }
  return Boolean(check());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Отправляем сообщение в background.js и ждём ответ.
// Если что-то сломалось — возвращаем { error }, чтобы не обрабатывать исключения в каждом месте.
async function sendToBackground(message) {
  try {
    const response = await chrome.runtime.sendMessage(message);
    return response || { error: 'Пустой ответ от background' };
  } catch (error) {
    return { error: error.message };
  }
}

function setStatus(status, message) {
  state.status = status;
  state.message = message;
}

function applySegments(segments, source, model) {
  state.segments = (segments || []).map((segment) => ({ ...segment, ignored: false }));
  state.source = source;
  state.model = model;

  const count = state.segments.length;
  setStatus('ready', count > 0 ? 'Найдено сегментов: ' + count : 'Рекламы не найдено');

  attachToVideo();
  redrawBar();
}

// ---------------------------------------------------------------------------
// 4. Пропуск рекламы во время просмотра
// ---------------------------------------------------------------------------

function attachToVideo() {
  const element = document.querySelector('#' + getPlayerId() + ' video');
  if (!element || element === video) return;

  video = element;
  // timeupdate срабатывает примерно 4 раза в секунду, пока видео играет.
  video.addEventListener('timeupdate', onTimeUpdate);
  // Длительность меняется, например, когда закончилась реклама YouTube и началось само видео.
  video.addEventListener('durationchange', redrawBar);
}

// Нужно ли пропускать этот сегмент с учётом настроек?
function shouldSkip(segment) {
  return (
    settings.enabled &&
    !segment.ignored &&
    settings.types[segment.type] &&
    segment.confidence >= MIN_CONFIDENCE
  );
}

function onTimeUpdate() {
  if (!settings.enabled || isYouTubeAdShowing()) return;

  const time = video.currentTime;
  for (const segment of state.segments) {
    // «- 0.5» — чтобы не зациклиться, если перемотка остановилась чуть раньше конца сегмента.
    const isInside = time >= segment.start && time < segment.end - 0.5;

    // Пользователь нажал «Посмотреть рекламу» — даём досмотреть сегмент один раз.
    // Как только время вышло за пределы сегмента, снимаем флаг: в следующий раз снова пропустим.
    if (segment.allowOnce) {
      if (!isInside) segment.allowOnce = false;
      continue;
    }

    if (!shouldSkip(segment)) continue;

    if (isInside) {
      video.currentTime = segment.end;
      showSkippedToast(segment);
      break;
    }
  }
}

function showSkippedToast(segment) {
  // Коротко: «Пропущено» + цветная точка типа (название типа — в подсказке при наведении)
  showToast('Пропущено', [
    {
      label: 'Посмотреть рекламу',
      onClick: () => watchSegment(segment),
    },
    {
      label: 'Это не реклама',
      onClick: () => markNotAd(segment),
    },
  ], 6000, segment.type);
}

// Перемотать на начало сегмента и дать досмотреть его ОДИН раз.
// Не «ignored» (это навсегда), а «allowOnce»: когда сегмент закончится, пропуск снова заработает.
// video.currentTime сразу возвращает новое значение, поэтому onTimeUpdate
// увидит время внутри сегмента и не снимет флаг раньше времени.
function watchSegment(segment) {
  if (!video) return;
  segment.allowOnce = true;
  video.currentTime = segment.start;
  video.play();
}

// Пользователь сказал, что это не реклама: перестаём пропускать и отправляем отзыв.
function markNotAd(segment) {
  segment.ignored = true;
  redrawBar();
  sendToBackground({
    type: 'feedback',
    videoId: state.videoId,
    segment: { start: segment.start, end: segment.end, type: segment.type },
    source: state.source,
  });
}

function redrawBar() {
  // «Чистый режим»: функции работают, но метки на шкале не рисуем (и убираем уже нарисованные)
  if (settings.cleanMode) {
    removeSegmentsFromBar();
    return;
  }
  if (!video || isYouTubeAdShowing() || isShortsPage()) return; // у Shorts другая шкала — метки не рисуем

  // На шкале вместе: рекламные сегменты и (в режиме стримера) красные метки запрещённых слов.
  // Тип метки = группа слова: красная — оскорбление, оранжевая — мат.
  const wordMarks = state.wordRanges.map((range) => ({ start: range.start, end: range.end, type: range.group }));
  // «Главное» — белые метки-точки (у момента есть только начало, поэтому конец = начало)
  const highlightMarks = state.highlights.map((moment) => ({
    start: moment.start,
    end: moment.start,
    type: 'highlight',
    title: moment.title,
  }));
  drawSegmentsOnBar([...state.segments, ...wordMarks, ...highlightMarks], video.duration, (segment) => {
    if (segment.type === 'highlight') return true;
    if (WORD_TYPES.includes(segment.type)) return settings.streamer.enabled;
    return settings.enabled && !segment.ignored && settings.types[segment.type];
  });
}

// Во время рекламы YouTube у плеера есть класс ad-showing. В это время <video> показывает рекламу,
// а не наше видео, поэтому ничего не перематываем.
function isYouTubeAdShowing() {
  const player = document.getElementById(getPlayerId());
  return Boolean(player && player.classList.contains('ad-showing'));
}

// ---------------------------------------------------------------------------
// 5. Связь с popup и реакция на изменение настроек
// ---------------------------------------------------------------------------

// popup спрашивает статус текущего видео или сообщает «это не реклама».
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getStatus') {
    sendResponse({
      videoId: state.videoId,
      status: state.status,
      message: state.message,
      source: state.source,
      model: state.model,
      segments: state.segments,
      streamer: { status: state.wordStatus, message: state.wordMessage, count: state.wordRanges.length },
      highlights: { status: state.highlightsStatus, message: state.highlightsMessage, moments: state.highlights },
      chapters: chaptersByVideo[state.videoId] || null, // null — данные о главах ещё не пришли
      isShorts: isShortsPage(),
    });
  } else if (message.type === 'findHighlights') {
    if (state.videoId) runHighlights(state.videoId);
    sendResponse({ ok: true });
  } else if (message.type === 'seek') {
    // Перейти к моменту из «главного»
    if (video) {
      video.currentTime = message.time;
      video.play();
    }
    sendResponse({ ok: true });
  } else if (message.type === 'watch') {
    const segment = state.segments[message.index];
    if (segment) watchSegment(segment);
    sendResponse({ ok: true });
  } else if (message.type === 'notAd') {
    const segment = state.segments[message.index];
    if (segment) markNotAd(segment);
    sendResponse({ ok: true });
  } else if (message.type === 'undoNotAd') {
    // Передумали: сегмент снова считается рекламой и пропускается.
    const segment = state.segments[message.index];
    if (segment) {
      segment.ignored = false;
      // Сбрасываем и «досмотреть один раз» — иначе, если раньше нажимали «Посмотреть»,
      // сегмент не пропустится, пока не выйдешь из него.
      segment.allowOnce = false;
      redrawBar();
      // Проверяем сразу, не дожидаясь timeupdate: если мы сейчас внутри рекламы —
      // перемотаем немедленно (timeupdate не приходит, пока видео на паузе).
      if (video) onTimeUpdate();
    }
    sendResponse({ ok: true });
  }
});

// Пользователь поменял настройки в popup — применяем сразу, без перезагрузки страницы.
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== 'local' || !changes.settings) return;
  const wasStreamerEnabled = settings.streamer.enabled;
  settings = await loadSettings();

  // Режим стримера: включили — запускаем; поменяли группы/свои слова — пересчитываем; выключили — сбрасываем.
  if (state.videoId) {
    if (!settings.streamer.enabled) {
      setStreamerRanges([], video);
      state.wordRanges = [];
      state.wordStatus = 'idle';
      state.wordMessage = '';
    } else if (!wasStreamerEnabled && state.wordStatus === 'idle') {
      runWordFilter(state.videoId);
    } else if (transcripts[state.videoId]) {
      updateWordRanges();
    }
  }
  renderPlayerButton(settings.enabled, toggleEnabled);
  if (!settings.enabled) hideToast();

  // Пропуск рекламы включили на видео, которое ещё не анализировали — запускаем поиск рекламы.
  // (Только его: режим стримера живёт своей жизнью, см. блок выше.)
  if (settings.enabled && state.status === 'off' && state.videoId) {
    setStatus('idle', '');
    runAdDetection(state.videoId);
  }
  redrawBar();
});

// Загружаем настройки при старте.
loadSettings().then((loaded) => {
  settings = loaded;
});

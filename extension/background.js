// BACKGROUND SERVICE WORKER.
// Это «фоновая» часть расширения: у неё нет страницы, она просыпается, когда приходит сообщение.
// Здесь делаются все сетевые запросы:
//   - к SponsorBlock,
//   - к нашему backend,
//   - напрямую к OpenRouter, если пользователь указал свой ключ.
// Почему не из content script: у background есть host_permissions из manifest.json,
// поэтому ему не мешает CORS, а ключ пользователя никогда не попадает на страницу YouTube.

importScripts('common/settings.js', 'common/i18n.js', 'common/prompt.js');

const SPONSORBLOCK_API = 'https://sponsor.ajay.app/api/skipSegments/';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Модели по умолчанию для режима «свой ключ» (такие же, как в backend/.env.example).
const DEFAULT_MODELS = ['nvidia/nemotron-3-super-120b-a12b:free', 'nvidia/nemotron-3-super-120b-a12b'];
const MODEL_TIMEOUT_MS = 180000;
// Те же настройки, что AI_MAX_TOKENS и AI_REASONING_EFFORT в backend/.env.example (там подробные комментарии).
const MAX_TOKENS = 6000;
const REASONING_EFFORT = 'low';

// Все сообщения от content script и popup приходят сюда.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message }));
  return true; // true = «ответ будет позже» (асинхронно). Без этого sendResponse не сработает.
});

async function handleMessage(message) {
  if (message.type === 'sponsorblock') return getSponsorBlockSegments(message.videoId);
  if (message.type === 'analyze') return keepAliveWhile(runAiTask(AD_TASK, message));
  if (message.type === 'highlights') return keepAliveWhile(runAiTask(HIGHLIGHTS_TASK, message));
  if (message.type === 'feedback') return sendFeedback(message);
  return { error: 'unknown message type: ' + message.type };
}

// Chrome усыпляет service worker примерно через 30 секунд «тишины».
// Ответ ИИ может идти дольше, поэтому, пока ждём, каждые 20 секунд вызываем
// любой API расширения — это сбрасывает таймер сна.
async function keepAliveWhile(promise) {
  const timer = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
  try {
    return await promise;
  } finally {
    clearInterval(timer);
  }
}

// ---------------------------------------------------------------------------
// SponsorBlock
// ---------------------------------------------------------------------------

// SHA-256 от строки, результат — hex-строка из 64 символов.
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Запрос по префиксу хэша: отправляем только первые 4 символа хэша ID видео.
// Сервер вернёт разметку для всех видео с таким префиксом, а нужное мы найдём сами.
// Так SponsorBlock не узнаёт, какое именно видео вы смотрите (приватность).
async function getSponsorBlockSegments(videoId) {
  try {
    const hashPrefix = (await sha256Hex(videoId)).slice(0, 4);
    const params = new URLSearchParams({
      categories: JSON.stringify(['sponsor', 'selfpromo', 'interaction']),
      actionTypes: JSON.stringify(['skip']),
    });

    const response = await fetch(SPONSORBLOCK_API + hashPrefix + '?' + params);
    if (response.status === 404) return { segments: [] }; // 404 = разметки нет
    if (!response.ok) throw new Error('HTTP ' + response.status);

    // Ответ: [ { videoID, segments: [ { segment: [start, end], category, UUID, ... } ] }, ... ]
    const videos = await response.json();
    const match = videos.find((item) => item.videoID === videoId);
    if (!match) return { segments: [] };

    // Приводим к нашему общему формату сегмента.
    const segments = match.segments.map((item) => ({
      start: item.segment[0],
      end: item.segment[1],
      type: item.category,
      confidence: 1, // разметку проверяли люди
      reason: 'SponsorBlock',
    }));
    return { segments: segments };
  } catch (error) {
    // SponsorBlock недоступен — не страшно, просто перейдём к ИИ.
    console.warn('[Skipper Flow] SponsorBlock:', error.message);
    return { segments: [] };
  }
}

// ---------------------------------------------------------------------------
// ИИ: через наш backend или напрямую через OpenRouter
// ---------------------------------------------------------------------------
// Две «задачи» для ИИ: поиск рекламы и «Найти главное». Отличаются только промтом, схемой ответа,
// проверкой ответа и адресом на нашем сервере — остальное (свой ключ, кэш, запасные модели) общее.

const AD_TASK = {
  endpoint: '/analyze', // адрес на нашем сервере
  cachePrefix: 'cache_', // ключ локального кэша: cache_<videoId>
  resultKey: 'segments', // как называется результат в ответе
  systemPrompt: SYSTEM_PROMPT,
  schemaName: 'ad_segments',
  schema: RESPONSE_SCHEMA,
  clean: cleanSegments,
};

const HIGHLIGHTS_TASK = {
  endpoint: '/highlights',
  cachePrefix: 'highlights_',
  resultKey: 'moments',
  systemPrompt: HIGHLIGHTS_PROMPT,
  schemaName: 'highlights',
  schema: HIGHLIGHTS_SCHEMA,
  clean: cleanMoments,
};

async function runAiTask(task, { videoId, transcript, language }) {
  const settings = await loadSettings();

  if (settings.apiKey) {
    // Есть свой ключ — идём в OpenRouter напрямую. Ключ НЕ отправляется на наш сервер.
    return runDirect(task, videoId, transcript, language, settings);
  }
  return runViaBackend(task, videoId, transcript, language, settings.backendUrl);
}

async function runViaBackend(task, videoId, transcript, language, backendUrl) {
  let response;
  try {
    response = await fetch(backendUrl + task.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, transcript, language }),
    });
  } catch (error) {
    throw new Error(t('errServerUnavailable', backendUrl));
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'HTTP ' + response.status);
  return data; // { source: 'ai' | 'cache', model, segments } или { ..., moments }
}

async function runDirect(task, videoId, transcript, language, settings) {
  // Локальный кэш в chrome.storage.local — чтобы не тратить запросы на одно и то же видео.
  const cacheKey = task.cachePrefix + videoId;
  const cached = (await chrome.storage.local.get(cacheKey))[cacheKey];
  if (cached) return { source: 'cache', model: cached.model, [task.resultKey]: cached[task.resultKey] };

  // Модель пользователя первой, затем модели по умолчанию как запасные (без повторов).
  const models = [settings.model, ...DEFAULT_MODELS].filter(Boolean);
  const uniqueModels = [...new Set(models)];

  const errors = [];
  for (const model of uniqueModels) {
    try {
      const result = await callOpenRouter(task, model, transcript, language, settings.apiKey);
      await chrome.storage.local.set({ [cacheKey]: { model, [task.resultKey]: result } });
      return { source: 'ai', model, [task.resultKey]: result };
    } catch (error) {
      console.warn('[Skipper Flow] model', model, 'error:', error.message);
      errors.push(model + ': ' + error.message);
    }
  }
  throw new Error(t('errAllModelsFailed', errors.join('; ')));
}

async function callOpenRouter(task, model, transcript, language, apiKey) {
  const startedAt = Date.now();
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'X-Title': 'Skipper Flow',
    },
    body: JSON.stringify({
      model: model,
      temperature: 0,
      max_tokens: MAX_TOKENS,
      reasoning: { effort: REASONING_EFFORT },
      messages: [
        { role: 'system', content: task.systemPrompt },
        { role: 'user', content: buildUserMessage(transcript, language) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: task.schemaName, strict: true, schema: task.schema },
      },
    }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error('HTTP ' + response.status + ' ' + text.slice(0, 200));
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'OpenRouter error');

  console.log('[Skipper Flow]', model, (Date.now() - startedAt) + ' ms', data.usage);

  const content = data.choices && data.choices[0] && data.choices[0].message.content;
  if (!content) throw new Error('empty model response');
  return task.clean(extractJson(content));
}

// Простая проверка ответа модели (в backend то же самое делает библиотека zod).
// Невалидные сегменты выбрасываем, а если нет даже массива segments — это ошибка.
function cleanSegments(raw) {
  if (!raw || !Array.isArray(raw.segments)) throw new Error('no segments array in the response');

  const result = [];
  for (const item of raw.segments) {
    const start = Number(item.start_seconds);
    const end = Number(item.end_seconds);
    const confidence = Number(item.confidence);

    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start < 0 || start >= end) continue;
    if (!SEGMENT_TYPES.includes(item.type)) continue;
    if (!(confidence >= 0 && confidence <= 1)) continue;

    result.push({ start, end, type: item.type, confidence, reason: String(item.reason || '') });
  }
  return result;
}

// То же для «главного»: момент = { start, title }. Не больше 6, по порядку времени.
function cleanMoments(raw) {
  if (!raw || !Array.isArray(raw.moments)) throw new Error('no moments array in the response');

  const result = [];
  for (const item of raw.moments) {
    const start = Number(item.start_seconds);
    const title = String(item.title || '').trim().slice(0, 80);
    if (!Number.isFinite(start) || start < 0 || !title) continue;
    result.push({ start, title });
  }
  return result.sort((a, b) => a.start - b.start).slice(0, 6);
}

// ---------------------------------------------------------------------------
// Отзыв «Это не реклама»
// ---------------------------------------------------------------------------

async function sendFeedback({ videoId, segment, source }) {
  const settings = await loadSettings();
  try {
    await fetch(settings.backendUrl + '/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, segment, source }),
    });
    return { ok: true };
  } catch (error) {
    // Сервер недоступен — отзыв просто не сохранится, на просмотр это не влияет.
    return { ok: false, error: error.message };
  }
}

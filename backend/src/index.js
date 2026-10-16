// СЕРВЕР SKIPPER FLOW на Cloudflare Workers. Точка входа backend.
//
// Чем Worker отличается от привычного Express-сервера:
//   - нет app.listen() и постоянно работающего процесса. Cloudflare сам вызывает функцию fetch()
//     ниже на каждый входящий запрос — на своих серверах по всему миру;
//   - база — D1 (SQLite в облаке), она приходит в fetch() как env.DB;
//   - настройки и секреты тоже приходят в env (и в process.env) — см. wrangler.jsonc и .dev.vars.
//
// Маршруты:
//   GET  /            — подсказка, что сервер работает
//   GET  /health      — проверка: {"ok":true}
//   POST /analyze     — найти рекламу в расшифровке видео (с кэшем)
//   POST /highlights  — «Найти главное»: ключевые моменты видео (с кэшем)
//   POST /feedback    — сохранить отзыв «Это не реклама»

import { z } from 'zod';
import { analyzeTranscript, findHighlights } from './ai.js';
import {
  getCachedAnalysis,
  saveAnalysis,
  getCachedHighlights,
  saveHighlights,
  saveFeedback,
  hitCounter,
} from './db.js';

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('[server] непредвиденная ошибка:', error);
      return json({ error: 'внутренняя ошибка сервера' }, 500);
    }
  },
};

async function handleRequest(request, env) {
  const { pathname } = new URL(request.url);

  if (request.method === 'GET' && pathname === '/') {
    return new Response('Skipper Flow backend работает. Проверка: /health', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  if (request.method === 'GET' && pathname === '/health') {
    return json({ ok: true });
  }

  const routes = { '/analyze': handleAnalyze, '/highlights': handleHighlights, '/feedback': handleFeedback };
  const handler = routes[pathname];
  if (request.method !== 'POST' || !handler) {
    return json({ error: 'не найдено' }, 404);
  }

  // Ограничение частоты: не больше N запросов в минуту с одного IP.
  // Сам IP не храним — только его хэш (и только на текущую минуту).
  const perMinute = Number(env.RATE_LIMIT_PER_MINUTE) || 20;
  const ipHash = await sha256Short(request.headers.get('CF-Connecting-IP') || 'unknown');
  if (!(await hitCounter(env.DB, 'ip:' + ipHash, 60, perMinute))) {
    return json({ error: 'слишком много запросов, попробуйте через минуту' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: 'тело запроса — не JSON' }, 400);
  }
  return handler(body, env);
}

// --- POST /analyze ---

// Как должно выглядеть тело запроса. Всё остальное отклоняем с ошибкой 400.
// (Тот же формат принимает и /highlights.)
const analyzeBodySchema = z.object({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, 'неверный ID видео'),
  transcript: z.string().min(1).max(300000),
  language: z.string().max(20).default('unknown'),
});

async function handleAnalyze(body, env) {
  const parsed = analyzeBodySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'неверный формат запроса', details: parsed.error.issues }, 400);
  const { videoId, transcript, language } = parsed.data;

  // 1. Кэш: это видео уже анализировали — отдаём сохранённый результат.
  const cached = await getCachedAnalysis(env.DB, videoId);
  if (cached) {
    console.log(`[analyze] ${videoId} — из кэша`);
    return json({ source: 'cache', model: cached.model, segments: cached.segments });
  }

  // 2. Анализ ИИ (или ожидание уже идущего анализа того же видео).
  try {
    const { model, result: segments } = await runOnce('analyze:' + videoId, async () => {
      await checkDailyLimit(env);
      console.log(`[analyze] ${videoId} — новый анализ, ${transcript.length} символов, язык ${language}`);
      const answer = await analyzeTranscript(transcript, language);
      await saveAnalysis(env.DB, videoId, answer.model, answer.result); // сохраняем в кэш
      return answer;
    });
    return json({ source: 'ai', model, segments });
  } catch (error) {
    console.error(`[analyze] ${videoId} — ошибка: ${error.message}`);
    return json({ error: error.message }, error.status || 502);
  }
}

// --- POST /highlights («Найти главное») ---
// Работает только по кнопке в popup, а не для каждого видео.

async function handleHighlights(body, env) {
  const parsed = analyzeBodySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'неверный формат запроса', details: parsed.error.issues }, 400);
  const { videoId, transcript, language } = parsed.data;

  const cached = await getCachedHighlights(env.DB, videoId);
  if (cached) {
    console.log(`[highlights] ${videoId} — из кэша`);
    return json({ source: 'cache', model: cached.model, moments: cached.moments });
  }

  try {
    const { model, result: moments } = await runOnce('highlights:' + videoId, async () => {
      await checkDailyLimit(env);
      console.log(`[highlights] ${videoId} — новый поиск, ${transcript.length} символов`);
      const answer = await findHighlights(transcript, language);
      await saveHighlights(env.DB, videoId, answer.model, answer.result);
      return answer;
    });
    return json({ source: 'ai', model, moments });
  } catch (error) {
    console.error(`[highlights] ${videoId} — ошибка: ${error.message}`);
    return json({ error: error.message }, error.status || 502);
  }
}

// --- POST /feedback ---

const feedbackBodySchema = z.object({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  segment: z.object({
    start: z.number(),
    end: z.number(),
    type: z.string().max(30),
  }),
  source: z.string().max(30).nullable().optional(),
});

async function handleFeedback(body, env) {
  const parsed = feedbackBodySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'неверный формат запроса' }, 400);
  const { videoId, segment, source } = parsed.data;

  await saveFeedback(env.DB, { videoId, start: segment.start, end: segment.end, type: segment.type, source: source || null });
  console.log(`[feedback] ${videoId} ${segment.type} ${segment.start}-${segment.end} — «не реклама»`);
  return json({ ok: true });
}

// --- Вспомогательное ---

// Общий дневной лимит вызовов ИИ на всех пользователей — защита баланса OpenRouter.
// Считаются только настоящие вызовы ИИ, ответы из кэша — бесплатные и не считаются.
async function checkDailyLimit(env) {
  const perDay = Number(env.DAILY_AI_LIMIT) || 800;
  if (!(await hitCounter(env.DB, 'ai-daily', 24 * 60 * 60, perDay))) {
    const error = new Error('дневной лимит анализа исчерпан, попробуйте завтра');
    error.status = 429;
    throw error;
  }
}

// Если два пользователя одновременно открыли одно видео, не надо дважды звать ИИ:
// второй запрос подождёт результат первого. Работает в пределах одного экземпляра Worker
// (Cloudflare может запустить несколько) — для редких совпадений этого достаточно.
const inProgress = new Map();

function runOnce(key, work) {
  if (!inProgress.has(key)) {
    inProgress.set(key, work().finally(() => inProgress.delete(key)));
  }
  return inProgress.get(key);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Первые 16 символов SHA-256 — чтобы различать IP, не храня сам адрес
async function sha256Short(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

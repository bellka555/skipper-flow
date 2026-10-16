// Работа с ИИ через OpenRouter: вызов моделей по очереди (fallback) и проверка ответа (zod).
//
// У нас две «задачи» для ИИ — поиск рекламы и поиск главного. Обе идут через одну функцию runTask:
// у каждой задачи свой промт, своя JSON-схема ответа и своя проверка (validate),
// а перебор моделей, таймауты, логи и разбор JSON — общие.

import { z } from 'zod';
import {
  SYSTEM_PROMPT,
  RESPONSE_SCHEMA,
  SEGMENT_TYPES,
  HIGHLIGHTS_PROMPT,
  HIGHLIGHTS_SCHEMA,
  buildUserMessage,
} from './prompt.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Настройки берём из переменных окружения В МОМЕНТ ВЫЗОВА, а не при загрузке файла:
// в Cloudflare Workers переменные и секреты (wrangler.jsonc, .dev.vars) доступны,
// когда пришёл запрос. В process.env они попадают благодаря флагу nodejs_compat.
function getConfig() {
  const env = process.env;

  // Размышления модели: minimal, low, medium, high — или off (выключить совсем).
  // Замер показал: у Nemotron 3 Super уровни почти ни на что не влияют (время скачет 6–40 с в любом),
  // а off отвечает за 1–2 с, но заметно хуже: пропускает рекламу и помечает обычный контент как рекламу.
  const reasoningEffort = env.AI_REASONING_EFFORT || 'low';

  return {
    apiKey: env.OPENROUTER_API_KEY,
    // Список моделей: "модель1,модель2" -> ['модель1', 'модель2']
    models: (env.AI_MODELS || '')
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean),
    timeoutMs: Number(env.AI_TIMEOUT_MS) || 180000,
    // Максимум токенов в ответе. Если не указать, OpenRouter «резервирует» максимум модели
    // (131 072 токена) и платная модель падает с HTTP 402, если на балансе меньше.
    // Замер на 4 видео: обычно модель тратит на размышления 600–4500 токенов, но иногда
    // «зацикливается» и думает бесконечно (16 000 токенов, ~2 минуты, ответа нет).
    // Лимит 6000 обрывает такое зацикливание примерно за 40 секунд — и мы переходим к следующей модели.
    maxTokens: Number(env.AI_MAX_TOKENS) || 6000,
    reasoning: reasoningEffort === 'off' ? { enabled: false } : { effort: reasoningEffort },
  };
}

// ===========================================================================
// Задача 1: поиск рекламы
// ===========================================================================

// Один сегмент. z.coerce.number() превращает строку "12.5" в число 12.5 —
// некоторые модели без structured outputs пишут числа в кавычках.
const segmentSchema = z
  .object({
    start_seconds: z.coerce.number().min(0),
    end_seconds: z.coerce.number(),
    type: z.enum(SEGMENT_TYPES),
    confidence: z.coerce.number().min(0).max(1),
    reason: z.string().default(''),
  })
  .refine((segment) => segment.start_seconds < segment.end_seconds, {
    message: 'start_seconds должен быть меньше end_seconds',
  });

// Весь ответ: объект с массивом segments. Сегменты проверяем по одному,
// чтобы один плохой сегмент не испортил весь ответ.
const segmentsResponseSchema = z.object({ segments: z.array(z.unknown()) });

// Проверяем ответ: общую форму строго (иначе ошибка -> следующая модель),
// а каждый сегмент по отдельности (плохие просто выбрасываем).
export function validateResponse(raw) {
  const parsed = segmentsResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error('ответ модели не похож на {"segments": [...]}');

  const segments = [];
  for (const item of parsed.data.segments) {
    const result = segmentSchema.safeParse(item);
    if (!result.success) {
      console.warn('[ai] отброшен невалидный сегмент:', JSON.stringify(item));
      continue;
    }
    // Переводим в формат, который понимает расширение: { start, end, type, confidence, reason }
    segments.push({
      start: result.data.start_seconds,
      end: result.data.end_seconds,
      type: result.data.type,
      confidence: result.data.confidence,
      reason: result.data.reason,
    });
  }
  return segments;
}

const AD_TASK = {
  name: 'реклама',
  systemPrompt: SYSTEM_PROMPT,
  schemaName: 'ad_segments',
  schema: RESPONSE_SCHEMA,
  validate: validateResponse,
};

export function analyzeTranscript(transcript, language) {
  return runTask(AD_TASK, transcript, language);
}

// ===========================================================================
// Задача 2: «Найти главное» — ключевые моменты видео
// ===========================================================================

const momentSchema = z.object({
  start_seconds: z.coerce.number().min(0),
  title: z.string().trim().min(1).max(80),
});
const momentsResponseSchema = z.object({ moments: z.array(z.unknown()) });

export function validateHighlights(raw) {
  const parsed = momentsResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error('ответ модели не похож на {"moments": [...]}');

  const moments = [];
  for (const item of parsed.data.moments) {
    const result = momentSchema.safeParse(item);
    if (!result.success) {
      console.warn('[ai] отброшен невалидный момент:', JSON.stringify(item));
      continue;
    }
    moments.push({ start: result.data.start_seconds, title: result.data.title });
  }
  // По времени и не больше 6 — даже если модель прислала больше
  return moments.sort((a, b) => a.start - b.start).slice(0, 6);
}

const HIGHLIGHTS_TASK = {
  name: 'главное',
  systemPrompt: HIGHLIGHTS_PROMPT,
  schemaName: 'highlights',
  schema: HIGHLIGHTS_SCHEMA,
  validate: validateHighlights,
};

export function findHighlights(transcript, language) {
  return runTask(HIGHLIGHTS_TASK, transcript, language);
}

// ===========================================================================
// Общее: перебор моделей и один запрос к модели
// ===========================================================================

// Пробуем модели по порядку, пока одна не ответит правильно.
// Возвращает { model, result }, где result — то, что вернул task.validate.
async function runTask(task, transcript, language) {
  const config = getConfig();
  if (!config.apiKey) {
    throw new Error('не задан секрет OPENROUTER_API_KEY (локально — в файле .dev.vars)');
  }
  if (config.models.length === 0) throw new Error('не задан AI_MODELS (в wrangler.jsonc)');

  const errors = [];
  for (const model of config.models) {
    try {
      const result = await callModel(task, model, transcript, language, config);
      return { model, result };
    } catch (error) {
      // Ошибка сети, 429 (лимит), таймаут, невалидный JSON — всё это повод попробовать следующую модель.
      console.error(`[ai:${task.name}] model=${model} ОШИБКА: ${error.message}`);
      errors.push(`${model}: ${error.message}`);
    }
  }
  throw new Error('все модели вернули ошибку — ' + errors.join(' | '));
}

async function callModel(task, model, transcript, language, config) {
  const startedAt = Date.now();

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Skipper Flow',
    },
    body: JSON.stringify({
      model,
      temperature: 0, // нам нужен предсказуемый ответ, а не творчество
      max_tokens: config.maxTokens,
      // Параметр reasoning у моделей, которые не умеют «думать», OpenRouter просто игнорирует.
      reasoning: config.reasoning,
      messages: [
        { role: 'system', content: task.systemPrompt },
        { role: 'user', content: buildUserMessage(transcript, language) },
      ],
      // Structured outputs. Если модель это не поддерживает, OpenRouter просто проигнорирует
      // параметр, а ответ мы всё равно проверим через zod.
      response_format: {
        type: 'json_schema',
        json_schema: { name: task.schemaName, strict: true, schema: task.schema },
      },
    }),
    // Если модель думает дольше timeoutMs — обрываем запрос (будет ошибка TimeoutError).
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  // Важно: fetch «завершается», как только пришли ЗАГОЛОВКИ ответа. OpenRouter присылает их
  // почти сразу, а тело — когда модель закончит думать. Поэтому время считаем после чтения тела.
  const text = await response.text();
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} за ${elapsed}с: ${text.slice(0, 300)}`);
  }

  const data = JSON.parse(text);
  if (data.error) throw new Error(data.error.message || 'ошибка OpenRouter');

  const usage = data.usage || {};
  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? '?';
  console.log(
    `[ai:${task.name}] model=${model} ok за ${elapsed}с, токены: prompt=${usage.prompt_tokens} ` +
      `completion=${usage.completion_tokens} (из них размышления=${reasoningTokens}) total=${usage.total_tokens}`
  );

  const content = data.choices?.[0]?.message?.content;
  // Пустой ответ бывает, если модель потратила все max_tokens на размышления.
  if (!content) throw new Error(`пустой ответ модели (finish_reason=${data.choices?.[0]?.finish_reason})`);
  return task.validate(extractJson(content));
}

// Модели иногда оборачивают JSON в ```json ... ``` — берём кусок от первой { до последней }.
function extractJson(text) {
  if (typeof text !== 'string') throw new Error('пустой ответ модели');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('в ответе модели нет JSON');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    throw new Error('невалидный JSON от модели');
  }
}

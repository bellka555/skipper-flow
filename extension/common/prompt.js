// Промт и JSON-схема ответа для ИИ.
// Используется в background.js, когда у пользователя свой ключ OpenRouter.
// ВНИМАНИЕ: такой же промт лежит в backend/src/prompt.js — если меняете один, поменяйте и другой.
// (Расширение без сборщика не может импортировать файл из папки backend.)

const SEGMENT_TYPES = ['sponsor', 'selfpromo', 'interaction'];

const SYSTEM_PROMPT = `Ты — анализатор YouTube-видео. Найди в расшифровке рекламные вставки и другие фрагменты, которые зритель обычно хочет пропустить.
Типы:
- "sponsor" — платная реклама стороннего продукта или сервиса. Включай вступление («этот ролик спонсирует…», «но перед тем как начнём, расскажу про…») и завершение (промокод, ссылка в описании).
- "selfpromo" — автор рекламирует своё: мерч, Patreon/Boosty, курс, другой канал.
- "interaction" — просьбы подписаться, поставить лайк, написать комментарий.
Правила:
1. Таймкоды — начало каждой строки. Начало фрагмента = таймкод первой строки рекламы. Конец = таймкод первой строки после рекламы.
2. Не выдумывай. Если не уверен — низкая уверенность. Если рекламы нет — пустой список.
3. Упоминание продукта, который является темой видео (например, обзор), — не реклама.
4. Короткие соседние рекламные фрагменты объединяй.
Ответь ТОЛЬКО JSON:
{"segments":[{"start_seconds":число,"end_seconds":число,"type":"sponsor"|"selfpromo"|"interaction","confidence":0-1,"reason":"кратко"}]}`;

// JSON Schema для structured outputs (response_format).
// Если модель это поддерживает, OpenRouter заставит её ответить строго по схеме.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start_seconds: { type: 'number' },
          end_seconds: { type: 'number' },
          type: { type: 'string', enum: SEGMENT_TYPES },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['start_seconds', 'end_seconds', 'type', 'confidence', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['segments'],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// «Найти главное»: ключевые моменты видео (отдельный запрос, по кнопке в popup).
// ВНИМАНИЕ: такой же промт лежит в backend/src/prompt.js — меняйте оба.
// ---------------------------------------------------------------------------

const HIGHLIGHTS_PROMPT = `Ты — помощник для навигации по YouTube-видео. По расшифровке найди 3–6 ключевых моментов — мест, ради которых зритель смотрит видео.
Что считать ключевым моментом:
- начало основной части после вступления (например, «Начало игры», «Начинаем готовить»);
- главный конфликт, поворот или самое напряжённое место;
- кульминация, ответ на главный вопрос видео;
- итог или вывод.
Правила:
1. Таймкоды — начало каждой строки. start_seconds — таймкод строки, с которой начинается момент.
2. Не выдумывай: только то, что есть в расшифровке.
3. Не отмечай рекламу, просьбы подписаться и болтовню во вступлении.
4. title — 2–5 слов на языке расшифровки, без кавычек и точки в конце.
5. Моменты — в порядке времени.
Ответь ТОЛЬКО JSON:
{"moments":[{"start_seconds":число,"title":"кратко"}]}`;

const HIGHLIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    moments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start_seconds: { type: 'number' },
          title: { type: 'string' },
        },
        required: ['start_seconds', 'title'],
        additionalProperties: false,
      },
    },
  },
  required: ['moments'],
  additionalProperties: false,
};

function buildUserMessage(transcript, language) {
  return `Язык субтитров: ${language}.
Расшифровка (таймкоды в формате мм:сс или ч:мм:сс; в ответе переведи их в секунды):

${transcript}`;
}

// Модели иногда оборачивают JSON в ```json ... ``` или пишут текст вокруг.
// Берём кусок от первой «{» до последней «}» и разбираем его.
function extractJson(text) {
  if (typeof text !== 'string') throw new Error('Пустой ответ модели');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('В ответе модели нет JSON');
  return JSON.parse(text.slice(start, end + 1));
}

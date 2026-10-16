// Промт и JSON-схема ответа для ИИ.
// ВНИМАНИЕ: копия этого промта лежит в extension/common/prompt.js (для режима «свой ключ»).
// Если меняете промт здесь — поменяйте и там.

export const SEGMENT_TYPES = ['sponsor', 'selfpromo', 'interaction'];

export const SYSTEM_PROMPT = `Ты — анализатор YouTube-видео. Найди в расшифровке рекламные вставки и другие фрагменты, которые зритель обычно хочет пропустить.
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

// JSON Schema для structured outputs: модели, которые это поддерживают,
// будут обязаны ответить строго в таком формате.
export const RESPONSE_SCHEMA = {
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

export function buildUserMessage(transcript, language) {
  return `Язык субтитров: ${language}.
Расшифровка (таймкоды в формате мм:сс или ч:мм:сс; в ответе переведи их в секунды):

${transcript}`;
}

// ---------------------------------------------------------------------------
// «Найти главное»: ключевые моменты видео (отдельный запрос, по кнопке в popup).
// ВНИМАНИЕ: копия этого промта тоже лежит в extension/common/prompt.js.
// ---------------------------------------------------------------------------

export const HIGHLIGHTS_PROMPT = `Ты — помощник для навигации по YouTube-видео. По расшифровке найди 3–6 ключевых моментов — мест, ради которых зритель смотрит видео.
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

export const HIGHLIGHTS_SCHEMA = {
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

// Разбор субтитров YouTube в формате json3 в текстовую расшифровку.
//
// Формат json3 выглядит примерно так:
// {
//   "wireMagic": "pb3",
//   "events": [
//     { "tStartMs": 1200, "dDurationMs": 3000, "segs": [ { "utf8": "Привет" }, { "utf8": " всем" } ] },
//     { "tStartMs": 4200, "aAppend": 1, "segs": [ { "utf8": "\n" } ] },   <- служебное, пустое
//     ...
//   ]
// }
// Нам нужны строки вида "мм:сс текст".

// 75 секунд -> "1:15", 3725 секунд -> "1:02:05"
function formatTime(totalSeconds) {
  const seconds = Math.floor(totalSeconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, '0');

  if (h > 0) {
    return h + ':' + String(m).padStart(2, '0') + ':' + ss;
  }
  return String(m).padStart(2, '0') + ':' + ss;
}

// Возвращает массив строк "мм:сс текст". Если разобрать не удалось — пустой массив.
function parseJson3(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return []; // не JSON (например, другой формат субтитров) — пропускаем
  }

  const lines = [];
  for (const event of data.events || []) {
    if (!event.segs) continue; // события без текста (например, настройки окна)

    // Склеиваем кусочки текста, переносы строк заменяем пробелами.
    const lineText = event.segs
      .map((seg) => seg.utf8 || '')
      .join('')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!lineText) continue; // пустые события отбрасываем

    const startSeconds = (event.tStartMs || 0) / 1000;
    lines.push(formatTime(startSeconds) + ' ' + lineText);
  }
  return lines;
}

// Разбор json3 по словам — для режима стримера. Возвращает массив { start, end, text } (в секундах).
//
// Автоматические субтитры (ASR) знают время КАЖДОГО слова:
//   { "tStartMs": 5000, "segs": [ { "utf8": "привет" }, { "utf8": " всем", "tOffsetMs": 480 } ] }
//   — слово «всем» звучит в 5000 + 480 мс.
// В обычных (ручных) субтитрах вся строка — один кусок без tOffsetMs. Тогда делим время строки
// между словами пропорционально их длине (длинное слово звучит дольше короткого) и помечаем
// такие слова estimated: true — их время примерное, и глушить их нужно с запасом побольше.
function parseJson3Words(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return [];
  }

  const words = [];
  for (const event of data.events || []) {
    if (!event.segs) continue;
    const eventStart = (event.tStartMs || 0) / 1000;
    const eventDuration = (event.dDurationMs || 0) / 1000;

    const hasWordTimings = event.segs.some((seg) => seg.tOffsetMs !== undefined);
    if (hasWordTimings) {
      for (const seg of event.segs) {
        const wordText = (seg.utf8 || '').trim();
        if (!wordText) continue;
        words.push({ start: eventStart + (seg.tOffsetMs || 0) / 1000, end: null, text: wordText, estimated: false });
      }
    } else {
      const line = event.segs.map((seg) => seg.utf8 || '').join('');
      // Метки в квадратных скобках склеиваем в один токен: «[ __ ]» -> «[__]»,
      // «[Смех в зале]» -> «[Смех_в_зале]», иначе они развалятся на отдельные слова.
      const lineWords = line
        .replace(/\[\s*__\s*\]/g, '[__]')
        .replace(/\[[^\]]*\]/g, (tag) => tag.replace(/\s+/g, '_'))
        .split(/\s+/)
        .filter(Boolean);
      // «Вес» слова = число букв + 1 (пробел/пауза после слова)
      const totalWeight = lineWords.reduce((sum, wordText) => sum + wordText.length + 1, 0);
      let weightBefore = 0;
      for (const wordText of lineWords) {
        const weight = wordText.length + 1;
        const start = eventStart + eventDuration * (weightBefore / totalWeight);
        const end = eventStart + eventDuration * ((weightBefore + weight) / totalWeight);
        words.push({ start: start, end: end, text: wordText, estimated: true });
        weightBefore += weight;
      }
    }
  }

  // Слова из ASR без явного конца: конец = начало следующего слова, но не дольше 1 секунды.
  words.sort((a, b) => a.start - b.start);
  for (let i = 0; i < words.length; i++) {
    if (words[i].end !== null) continue;
    const next = words[i + 1];
    const maxEnd = words[i].start + 1;
    words[i].end = next ? Math.min(next.start, maxEnd) : maxEnd;
  }

  // В ASR «[ __ ]» иногда приходит одним куском с пробелами — приводим к единому виду
  for (const word of words) {
    word.text = word.text.replace(/\[\s*__\s*\]/g, '[__]');
  }
  return words;
}

// Достаём параметр из URL: getUrlParam('/api/timedtext?v=abc&lang=ru', 'lang') -> 'ru'
function getUrlParam(url, name) {
  try {
    return new URL(url, location.origin).searchParams.get(name);
  } catch (error) {
    return null;
  }
}

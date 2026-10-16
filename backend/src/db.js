// База данных D1 — это SQLite в облаке Cloudflare.
// В отличие от better-sqlite3 (который был раньше), запросы к D1 асинхронные: нужен await.
// db — это «привязка» (binding) из wrangler.jsonc, приходит в обработчик как env.DB.
//
// Значения подставляются через bind() вместо «?» — это защищает от SQL-инъекций:
// данные никогда не склеиваются с текстом запроса.

export async function getCachedAnalysis(db, videoId) {
  const row = await db.prepare('SELECT model, segments FROM analyses WHERE video_id = ?').bind(videoId).first();
  if (!row) return null;
  return { model: row.model, segments: JSON.parse(row.segments) };
}

export async function saveAnalysis(db, videoId, model, segments) {
  await db
    .prepare('INSERT OR REPLACE INTO analyses (video_id, model, segments) VALUES (?, ?, ?)')
    .bind(videoId, model, JSON.stringify(segments))
    .run();
}

export async function getCachedHighlights(db, videoId) {
  const row = await db.prepare('SELECT model, moments FROM highlights WHERE video_id = ?').bind(videoId).first();
  if (!row) return null;
  return { model: row.model, moments: JSON.parse(row.moments) };
}

export async function saveHighlights(db, videoId, model, moments) {
  await db
    .prepare('INSERT OR REPLACE INTO highlights (video_id, model, moments) VALUES (?, ?, ?)')
    .bind(videoId, model, JSON.stringify(moments))
    .run();
}

export async function saveFeedback(db, { videoId, start, end, type, source }) {
  await db
    .prepare('INSERT INTO feedback (video_id, start_seconds, end_seconds, type, source) VALUES (?, ?, ?, ?, ?)')
    .bind(videoId, start, end, type, source)
    .run();
}

// Счётчик с окном времени: «не больше limit событий за windowSeconds секунд».
// Возвращает true, если событие разрешено.
//
// Один SQL-запрос делает всё сразу (INSERT ... ON CONFLICT DO UPDATE ... RETURNING):
//   - записи нет — создаём со счётчиком 1;
//   - запись есть и окно то же — увеличиваем счётчик на 1;
//   - окно сменилось (прошла минута / наступили новые сутки) — начинаем счёт заново с 1.
// RETURNING возвращает новое значение счётчика.
export async function hitCounter(db, key, windowSeconds, limit) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const row = await db
    .prepare(
      `INSERT INTO counters (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN counters.window_start = ?2 THEN counters.count + 1 ELSE 1 END,
         window_start = ?2
       RETURNING count`
    )
    .bind(key, windowStart)
    .first();
  return row.count <= limit;
}

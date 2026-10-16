-- Схема базы данных D1 (это SQLite в облаке Cloudflare).
-- Создать таблицы:
--   локально:      npm.cmd run db:init:local
--   в интернете:   npm.cmd run db:init

-- Кэш поиска рекламы: одно видео = одна запись
CREATE TABLE IF NOT EXISTS analyses (
  video_id   TEXT PRIMARY KEY,
  model      TEXT,
  segments   TEXT NOT NULL,              -- массив сегментов в виде JSON-строки
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Кэш «Найти главное»: тоже одно видео = одна запись
CREATE TABLE IF NOT EXISTS highlights (
  video_id   TEXT PRIMARY KEY,
  model      TEXT,
  moments    TEXT NOT NULL,              -- массив моментов { start, title } в виде JSON-строки
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Отзывы «Это не реклама»
CREATE TABLE IF NOT EXISTS feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id      TEXT NOT NULL,
  start_seconds REAL,
  end_seconds   REAL,
  type          TEXT,
  source        TEXT,                    -- откуда был сегмент: sponsorblock / ai / cache
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Счётчики для ограничения частоты запросов.
-- key — что считаем: «ip:<хэш IP>» (запросы в минуту) или «ai-daily» (вызовы ИИ за сутки).
-- window_start — начало текущего окна (минуты или суток); при новом окне счётчик сбрасывается.
CREATE TABLE IF NOT EXISTS counters (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

// Общие настройки расширения.
// Этот файл подключается в трёх местах: в content script (manifest.json),
// в background (через importScripts) и на страницах popup/options (через <script>).
// Поэтому здесь только простые глобальные константы и функции.

const DEFAULT_SETTINGS = {
  enabled: true, // общий выключатель
  types: {
    sponsor: true, // платная реклама
    selfpromo: true, // самореклама автора
    interaction: true, // «подпишитесь, поставьте лайк»
  },
  apiKey: '', // свой ключ OpenRouter (если пустой — используем наш backend)
  model: '', // модель для своего ключа (если пустая — модели по умолчанию)
  backendUrl: 'https://skipper-flow-api.bellka.workers.dev', // наш сервер на Cloudflare (для локальной разработки — см. README)
  cleanMode: false, // «Чистый режим»: всё работает, но без цветных меток на шкале видео
  // Что было включено до нажатия общей кнопки в плеере (чтобы вернуть как было): { enabled, streamer }
  resumeState: null,
  // Режим стримера: заглушение запрещённых слов (см. content/streamer.js)
  streamer: {
    enabled: false, // выключен, пока пользователь сам не включит
    slurs: true, // оскорбления по национальности, расе, ориентации
    profanity: false, // мат
    beep: true, // «бип» вместо тишины
    warn: true, // предупреждать за несколько секунд
    customWords: '', // свои слова через запятую (страница настроек)
  },
};

// Читаем настройки из chrome.storage.local.
// Сохранённые значения «накладываем» поверх значений по умолчанию,
// чтобы новые поля из DEFAULT_SETTINGS появлялись и у старых пользователей.
async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  const saved = settings || {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    types: { ...DEFAULT_SETTINGS.types, ...(saved.types || {}) },
    streamer: { ...DEFAULT_SETTINGS.streamer, ...(saved.streamer || {}) },
  };
}

// Сохраняем только изменённые поля (patch), остальные не трогаем.
async function saveSettings(patch) {
  const current = await loadSettings();
  const updated = { ...current, ...patch };
  await chrome.storage.local.set({ settings: updated });
  return updated;
}

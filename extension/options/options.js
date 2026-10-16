// Страница настроек: свой ключ OpenRouter, модель и адрес backend.

// Сначала переводим тексты в разметке (data-i18n) на язык браузера
translatePage();

const apiKeyInput = document.getElementById('apiKey');
const modelInput = document.getElementById('model');
const backendUrlInput = document.getElementById('backendUrl');
const customWordsInput = document.getElementById('customWords');
const savedLabel = document.getElementById('saved');

function showMessage(text) {
  savedLabel.textContent = text;
  setTimeout(() => (savedLabel.textContent = ''), 2000);
}

async function init() {
  const settings = await loadSettings();
  apiKeyInput.value = settings.apiKey;
  modelInput.value = settings.model;
  backendUrlInput.value = settings.backendUrl;
  customWordsInput.value = settings.streamer.customWords;
}

document.getElementById('save').addEventListener('click', async () => {
  const current = await loadSettings();
  await saveSettings({
    // настройки режима стримера лежат внутри streamer — меняем только список своих слов
    streamer: { ...current.streamer, customWords: customWordsInput.value.trim() },
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
    // убираем «/» в конце, чтобы не получилось http://localhost:8787//analyze
    backendUrl: backendUrlInput.value.trim().replace(/\/+$/, '') || DEFAULT_SETTINGS.backendUrl,
  });
  showMessage(t('saved'));
});

document.getElementById('clear-key').addEventListener('click', async () => {
  apiKeyInput.value = '';
  await saveSettings({ apiKey: '' });
  showMessage(t('keyDeleted'));
});

// Удаляем из chrome.storage.local кэш режима «свой ключ»: cache_<videoId> (реклама)
// и highlights_<videoId> («Найти главное»).
document.getElementById('clear-cache').addEventListener('click', async () => {
  const everything = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(everything).filter((key) => key.startsWith('cache_') || key.startsWith('highlights_'));
  await chrome.storage.local.remove(cacheKeys);
  showMessage(t('cacheCleared', cacheKeys.length));
});

init();

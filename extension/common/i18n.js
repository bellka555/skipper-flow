// ПЕРЕВОДЫ (английский и русский).
// Все тексты лежат в _locales/en/messages.json и _locales/ru/messages.json.
// Chrome сам выбирает язык по языку браузера; если такого языка нет — берёт английский
// (default_locale в manifest.json). Здесь две маленькие функции, чтобы этим было удобно пользоваться.

// t('ключ') — текст на языке браузера. Если в тексте есть $1, его заменит первый доп. аргумент:
//   t('segmentsFound', 3) -> 'Найдено сегментов: 3' (или 'Segments found: 3')
// Если ключа нет — возвращаем сам ключ, чтобы ошибку было видно, а не пустое место.
function t(key, ...substitutions) {
  return chrome.i18n.getMessage(key, substitutions.map(String)) || key;
}

// Переводит HTML-страницу (popup, настройки). В разметке вместо текста пишем атрибуты:
//   data-i18n="ключ"              — текст элемента
//   data-i18n-title="ключ"        — всплывающая подсказка
//   data-i18n-placeholder="ключ"  — подсказка в пустом поле ввода
//   data-i18n-aria-label="ключ"   — подпись для экранных дикторов
function translatePage() {
  document.documentElement.lang = chrome.i18n.getUILanguage().split('-')[0];

  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-title]')) {
    element.title = t(element.dataset.i18nTitle);
  }
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  }
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  }
}

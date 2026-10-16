// Всё, что расширение рисует на странице YouTube:
// цветные полоски на шкале прогресса и всплывающее уведомление (toast).
// Здесь нет логики «когда пропускать» — только отрисовка. Логика в content.js.

// Цвета как в SponsorBlock (зелёный, жёлтый, фиолетовый), только чуть мягче.
// Такие же заданы в common/theme.css (--c-sponsor и т.д.) для popup.
const TYPE_COLORS = {
  sponsor: '#34d27b',
  selfpromo: '#f5c542',
  interaction: '#b46bff',
  // Режим стримера — группы слов (цвета как у точек в popup)
  slurs: '#ff4d4f', // оскорбления — красный
  profanity: '#ff8a4d', // мат — оранжевый
  custom: '#ff4d4f', // свои слова — тоже красный
};

// Типы «сегментов», которые на самом деле — запрещённые слова режима стримера
const WORD_TYPES = ['slurs', 'profanity', 'custom'];

// Названия типов — на языке браузера (тексты в _locales, функция t — в common/i18n.js)
const TYPE_NAMES = {
  sponsor: t('nameSponsor'),
  selfpromo: t('nameSelfpromo'),
  interaction: t('nameInteraction'),
  slurs: t('nameSlurs'),
  profanity: t('nameProfanity'),
  custom: t('nameCustom'),
};

// «Найти главное» — белые метки на шкале.
// Добавляем ПОСЛЕ объявления TYPE_NAMES: обратиться к const до его объявления нельзя (файл упадёт).
TYPE_COLORS.highlight = '#ffffff';
TYPE_NAMES.highlight = t('nameHighlight');

// --- Полоски на шкале прогресса ---

// segments — массив { start, end, type, ignored }, duration — длина видео в секундах.
// isVisible(segment) — функция, которая решает, показывать ли сегмент (учитывает настройки).
function drawSegmentsOnBar(segments, duration, isVisible) {
  removeSegmentsFromBar();

  const progressBar = document.querySelector('#movie_player .ytp-progress-bar');
  if (!progressBar || !duration || !isFinite(duration)) return;

  // Контейнер растягивается на всю шкалу; полоски внутри позиционируются в процентах.
  const container = document.createElement('div');
  container.className = 'ais-bar';

  for (const segment of segments) {
    if (!isVisible(segment)) continue;

    const left = (segment.start / duration) * 100;
    const width = ((segment.end - segment.start) / duration) * 100;

    const piece = document.createElement('div');
    piece.className = 'ais-bar-segment';
    // Слова очень короткие — на шкале их было бы не видно, поэтому у них минимальная ширина (content.css)
    if (WORD_TYPES.includes(segment.type) || segment.type === 'highlight') piece.classList.add('ais-bar-word');
    piece.style.left = left + '%';
    piece.style.width = width + '%';
    piece.style.background = TYPE_COLORS[segment.type] || '#ffffff';
    piece.title = segment.title || TYPE_NAMES[segment.type] || segment.type; // у «главного» — его название
    container.appendChild(piece);
  }

  progressBar.appendChild(container);
}

function removeSegmentsFromBar() {
  document.querySelectorAll('.ais-bar').forEach((element) => element.remove());
}

// --- Кнопка в панели управления плеера ---

// Значок для кнопки в плеере: логотип без плитки — два шеврона «перемотка вперёд».
// Собираем SVG из элементов через createElementNS, а не строкой через innerHTML:
// YouTube включает защиту Trusted Types, и присваивание HTML-строки там вызывает ошибку.
function createSkipperIcon() {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG_NS, 'svg');
  // Окно 24×24 вокруг значка — как у новых иконок плеера YouTube (они тоже 24×24)
  svg.setAttribute('viewBox', '6 6 24 24');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');

  // [тег, атрибуты]. currentColor = цвет текста кнопки, его задаёт content.css.
  // Два шеврона, как в логотипе: задний полупрозрачный, передний яркий.
  const parts = [
    ['path', { d: 'M11 12 L17 18 L11 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: '0.5' }],
    ['path', { d: 'M18 12 L24 18 L18 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
  ];
  for (const [tag, attributes] of parts) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const name in attributes) element.setAttribute(name, attributes[name]);
    svg.appendChild(element);
  }
  return svg;
}

// Создаёт кнопку со значком справа в панели плеера (если её ещё нет) и обновляет её вид.
// enabled — работает ли хоть что-то (пропуск рекламы или режим стримера), onToggle — что делать при клике.
function renderPlayerButton(enabled, onToggle) {
  const controls = document.querySelector('#movie_player .ytp-right-controls');
  if (!controls) return; // плеер ещё не загрузился

  // Новый плеер YouTube делит правую панель на две группы: .ytp-right-controls-left и -right.
  // Кладём кнопку внутрь левой группы — тогда размер и выравнивание как у соседних кнопок.
  // (Раньше кнопка вставлялась прямо в общую панель, мимо групп, и из-за этого съезжала.)
  const group = controls.querySelector('.ytp-right-controls-left') || controls;

  let button = controls.querySelector('.ais-player-button');
  if (!button) {
    button = document.createElement('button');
    // ytp-button — класс YouTube: так кнопка получит тот же размер, что и соседние.
    button.className = 'ytp-button ais-player-button';
    button.appendChild(createSkipperIcon());
    button.addEventListener('click', (event) => {
      event.stopPropagation(); // чтобы клик не ставил видео на паузу
      onToggle();
    });
  }
  if (button.parentElement !== group) group.prepend(button); // в начало группы

  button.classList.toggle('ais-off', !enabled);
  button.title = enabled ? t('playerButtonOn') : t('playerButtonOff');
}

// --- Уведомление (toast) ---

let toastTimer = null;

// text — текст уведомления, buttons — массив { label, onClick }.
// segmentType (необязательно) — тип сегмента: перед текстом появится точка его цвета,
// а название типа — во всплывающей подсказке при наведении.
function showToast(text, buttons = [], durationMs = 6000, segmentType = null) {
  hideToast();

  const player = document.querySelector('#movie_player');
  if (!player) return;

  const toast = document.createElement('div');
  toast.className = 'ais-toast';

  if (segmentType) {
    const dot = document.createElement('span');
    dot.className = 'ais-toast-dot';
    dot.style.setProperty('--c', TYPE_COLORS[segmentType] || '#ffffff');
    toast.title = TYPE_NAMES[segmentType] || '';
    toast.appendChild(dot);
  }

  const label = document.createElement('span');
  label.textContent = text; // textContent, а не innerHTML — так безопаснее
  toast.appendChild(label);

  for (const button of buttons) {
    const element = document.createElement('button');
    element.className = 'ais-toast-button';
    element.textContent = button.label;
    element.addEventListener('click', (event) => {
      event.stopPropagation(); // чтобы клик не поставил видео на паузу
      button.onClick();
      hideToast();
    });
    toast.appendChild(element);
  }

  player.appendChild(toast);
  toastTimer = setTimeout(hideToast, durationMs);
  return toast; // чтобы вызывающий код мог, например, добавить класс
}

function hideToast() {
  clearTimeout(toastTimer);
  document.querySelectorAll('.ais-toast').forEach((element) => element.remove());
}

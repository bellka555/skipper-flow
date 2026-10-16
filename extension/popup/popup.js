// Код всплывающего окна (popup), которое открывается по клику на иконку расширения.
// Popup живёт, только пока открыт. Состояние видео он берёт у content script вкладки,
// а настройки читает и пишет в chrome.storage.local.

// Сначала переводим тексты в разметке (data-i18n) на язык браузера
translatePage();

// Короткие названия типов для списка сегментов (тексты — в _locales)
const TYPE_NAMES = {
  sponsor: t('segSponsor'),
  selfpromo: t('segSelfpromo'),
  interaction: t('segInteraction'),
};

const TYPE_COLORS = {
  sponsor: 'var(--c-sponsor)',
  selfpromo: 'var(--c-selfpromo)',
  interaction: 'var(--c-interaction)',
};

const enabledCheckbox = document.getElementById('enabled');
const masterLabel = document.getElementById('master-label');
const typeCheckboxes = document.querySelectorAll('input[data-type]');
const statusElement = document.getElementById('status');
const sourceElement = document.getElementById('source');
const segmentsList = document.getElementById('segments');
const cleanModeCheckbox = document.getElementById('clean-mode');
const streamerCard = document.getElementById('streamer-card');
const streamerEnabled = document.getElementById('streamer-enabled');
const streamerCheckboxes = document.querySelectorAll('input[data-streamer]');
const streamerStatus = document.getElementById('streamer-status');
const highlightsCard = document.getElementById('highlights-card');
const findHighlightsButton = document.getElementById('find-highlights');
const highlightsStatus = document.getElementById('highlights-status');
const highlightsList = document.getElementById('highlights-list');
const chaptersHead = document.getElementById('chapters-head');
const chaptersList = document.getElementById('chapters-list');
const aiHead = document.getElementById('ai-head');

// --- Настройки: выключатели ---

async function initSettings() {
  const settings = await loadSettings();

  // «Чистый режим»
  cleanModeCheckbox.checked = settings.cleanMode;
  cleanModeCheckbox.addEventListener('change', () => saveSettings({ cleanMode: cleanModeCheckbox.checked }));

  // Главный выключатель
  enabledCheckbox.checked = settings.enabled;
  renderEnabled(settings.enabled);
  enabledCheckbox.addEventListener('change', () => {
    renderEnabled(enabledCheckbox.checked);
    saveSettings({ enabled: enabledCheckbox.checked });
  });

  // Режим стримера: главный переключатель и его настройки
  streamerEnabled.checked = settings.streamer.enabled;
  renderStreamer(settings.streamer.enabled);
  streamerEnabled.addEventListener('change', () => {
    renderStreamer(streamerEnabled.checked);
    saveStreamerSettings({ enabled: streamerEnabled.checked });
  });
  for (const checkbox of streamerCheckboxes) {
    const key = checkbox.dataset.streamer;
    checkbox.checked = settings.streamer[key];
    checkbox.addEventListener('change', () => saveStreamerSettings({ [key]: checkbox.checked }));
  }

  // Выключатели по типам
  for (const checkbox of typeCheckboxes) {
    const type = checkbox.dataset.type;
    checkbox.checked = settings.types[type];
    checkbox.addEventListener('change', async () => {
      const current = await loadSettings();
      saveSettings({ types: { ...current.types, [type]: checkbox.checked } });
    });
  }
}

function renderEnabled(enabled) {
  masterLabel.textContent = enabled ? t('masterOn') : t('masterOff');
  document.body.classList.toggle('is-off', !enabled);
  // Когда пропуск выключен, переключатели типов блокируем (disabled): их значения сохраняются
  // и снова заработают, когда пропуск включат.
  for (const checkbox of typeCheckboxes) {
    checkbox.disabled = !enabled;
  }
}

// Настройки режима стримера лежат внутри settings.streamer — меняем одно поле, остальные сохраняем.
async function saveStreamerSettings(patch) {
  const current = await loadSettings();
  saveSettings({ streamer: { ...current.streamer, ...patch } });
}

function renderStreamer(enabled) {
  streamerCard.classList.toggle('is-on', enabled);
  streamerCard.classList.toggle('lit', enabled); // ровная подсветка рамки, пока режим включён
}

// --- Статус текущего видео ---

let activeTabId = null;
let lastRendered = ''; // чтобы не перерисовывать список, если ничего не поменялось

async function refreshStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab ? tab.id : null;

  let status = null;
  try {
    // Спрашиваем content script этой вкладки. Если вкладка не YouTube — будет ошибка.
    status = await chrome.tabs.sendMessage(activeTabId, { type: 'getStatus' });
  } catch (error) {
    status = null;
  }

  // Перерисовываем, только если данные изменились. Иначе кнопки пересоздавались бы
  // каждую секунду, и клик, попавший на момент перерисовки, терялся бы.
  const snapshot = JSON.stringify(status);
  if (snapshot === lastRendered) return;
  lastRendered = snapshot;

  // Статус режима стримера (сколько мест будет заглушено)
  streamerStatus.textContent = status && status.streamer ? status.streamer.message : '';
  renderHighlights(status);

  if (!status || !status.videoId) {
    renderStatusText(t('openYoutube'), 'muted');
    renderSource(null, null);
    segmentsList.innerHTML = '';
    return;
  }

  const kind = status.status === 'loading' ? 'loading' : status.status === 'ready' ? '' : 'muted';
  renderStatusText(status.message || '…', kind);
  renderSource(status.source, status.model);
  renderSegments(status.segments || []);
}

function renderStatusText(text, kind) {
  statusElement.textContent = text;
  statusElement.className = 'status ' + (kind || '');
}

// Значок источника в углу карточки: «SponsorBlock», «ИИ · nemotron-3-super…», «Кэш»
function renderSource(source, model) {
  if (!source) {
    sourceElement.hidden = true;
    return;
  }

  let text = source === 'sponsorblock' ? 'SponsorBlock' : source === 'cache' ? t('sourceCache') : t('sourceAi');
  if (model) text += ' · ' + shortModelName(model);

  sourceElement.textContent = text;
  sourceElement.title = model || ''; // полное имя модели — во всплывающей подсказке
  sourceElement.hidden = false;
}

// "nvidia/nemotron-3-super-120b-a12b:free" -> "nemotron-3-super-120b-a12b"
function shortModelName(model) {
  return model.split('/').pop().replace(':free', '');
}

function renderSegments(segments) {
  segmentsList.innerHTML = '';

  segments.forEach((segment, index) => {
    const item = document.createElement('li');
    item.className = 'segment' + (segment.ignored ? ' ignored' : '');
    item.style.setProperty('--c', TYPE_COLORS[segment.type] || 'var(--accent)');
    item.title = segment.reason || '';

    // Цветная полоска слева
    const color = document.createElement('span');
    color.className = 'segment-color';
    item.appendChild(color);

    // Название и время
    const info = document.createElement('div');
    info.className = 'segment-info';
    const type = document.createElement('span');
    type.className = 'segment-type';
    type.textContent = TYPE_NAMES[segment.type] || segment.type;
    const time = document.createElement('span');
    time.className = 'segment-time';
    time.textContent = formatTime(segment.start) + ' – ' + formatTime(segment.end);
    info.append(type, time);
    item.appendChild(info);

    // Кнопки
    const actions = document.createElement('div');
    actions.className = 'segment-actions';

    // «▶» — перемотать на начало рекламы и досмотреть её один раз.
    const watch = createButton('▶', t('watchOnceTitle'), { type: 'watch', index: index });
    watch.classList.add('icon');
    actions.appendChild(watch);

    // У обычного сегмента — «Не реклама», у отмеченного — «Пропускать» (отмена отметки).
    if (segment.ignored) {
      actions.appendChild(
        createButton(t('skipAgain'), t('skipAgainTitle'), { type: 'undoNotAd', index: index })
      );
    } else {
      actions.appendChild(
        createButton(t('notAdShort'), t('notAdTitle'), { type: 'notAd', index: index })
      );
    }

    item.appendChild(actions);
    segmentsList.appendChild(item);
  });
}

// Кнопка, которая по клику отправляет message в content script вкладки и обновляет список.
function createButton(label, title, message) {
  const button = document.createElement('button');
  button.className = 'btn';
  button.textContent = label;
  button.title = title; // подсказка при наведении
  button.addEventListener('click', async () => {
    await chrome.tabs.sendMessage(activeTabId, message);
    refreshStatus();
  });
  return button;
}

// --- «Главное в видео» ---

function renderHighlights(status) {
  // Карточку показываем, только когда открыто обычное видео (у коротких Shorts «главное» не нужно)
  highlightsCard.hidden = !status || !status.videoId || status.isShorts;
  if (highlightsCard.hidden) return;

  const info = status.highlights || { status: 'idle', message: '', moments: [] };
  const isLoading = info.status === 'loading';
  const hasMoments = info.moments.length > 0;

  // Кнопку прячем, когда моменты уже найдены; пока ищем — она неактивна
  findHighlightsButton.hidden = hasMoments;
  findHighlightsButton.disabled = isLoading;
  findHighlightsButton.textContent = isLoading ? t('searching') : t('findHighlights');

  highlightsStatus.textContent = info.message;
  highlightsStatus.className = 'status ' + (isLoading ? 'loading' : 'muted');
  aiHead.hidden = !hasMoments;
  renderMomentList(highlightsList, info.moments);

  // Главы: null — данные ещё не пришли, пустой список — у видео нет глав
  const chapters = status.chapters ? status.chapters.chapters : [];
  chaptersHead.hidden = chapters.length === 0;
  chaptersHead.textContent = status.chapters && status.chapters.kind === 'auto' ? t('chaptersAuto') : t('chaptersAuthor');
  renderMomentList(chaptersList, chapters);
}

// Список моментов { start, title }: строка с названием и временем, клик — перейти к моменту.
// Используется и для глав, и для «главного» от ИИ.
function renderMomentList(list, moments) {
  list.innerHTML = '';
  for (const moment of moments) {
    const item = document.createElement('li');
    item.className = 'segment highlight-row';
    item.style.setProperty('--c', '#ffffff');
    item.title = t('goToMoment');

    const color = document.createElement('span');
    color.className = 'segment-color';

    const text = document.createElement('div');
    text.className = 'segment-info';
    const title = document.createElement('span');
    title.className = 'highlight-title';
    title.textContent = moment.title;
    const time = document.createElement('span');
    time.className = 'segment-time';
    time.textContent = formatTime(moment.start);
    text.append(title, time);

    // Клик по всей строке — перейти к моменту
    item.addEventListener('click', () => {
      chrome.tabs.sendMessage(activeTabId, { type: 'seek', time: moment.start });
    });

    item.append(color, text);
    list.appendChild(item);
  }
}

findHighlightsButton.addEventListener('click', async () => {
  await chrome.tabs.sendMessage(activeTabId, { type: 'findHighlights' });
  refreshStatus();
});

function formatTime(totalSeconds) {
  const seconds = Math.floor(totalSeconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + s : m + ':' + s;
}

document.getElementById('open-options').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Применяем настройки, и только потом разрешаем анимацию переключателей.
// Два requestAnimationFrame — чтобы браузер успел нарисовать переключатели в правильном
// положении БЕЗ анимации, а уже потом мы убрали запрет.
initSettings().then(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('preload')));
});
refreshStatus();
// Пока popup открыт, обновляем статус раз в секунду (анализ может завершиться у нас на глазах).
setInterval(refreshStatus, 1000);

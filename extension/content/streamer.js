// РЕЖИМ СТРИМЕРА: заглушение запрещённых слов и предупреждение заранее.
// Работает полностью в браузере, без сервера и без ИИ: ищем слова из словаря (badwords.js)
// в субтитрах с таймингом каждого слова (parseJson3Words в transcript.js).
//
// Как глушим: пропускаем звук видео через Web Audio API — цепочка «видео -> регулятор громкости
// (GainNode) -> колонки» — и на время слова ставим громкость регулятора в 0. Это НАШ регулятор:
// плеер YouTube о нём не знает и не может его «перебить» (а вот video.muted — та же кнопка звука,
// что у плеера, и при перемотке YouTube иногда возвращал звук посреди слова).
// Если Web Audio недоступен (например, браузер ещё не разрешил звук до первого клика по странице),
// запасной вариант — video.muted. Звук глушится прямо во вкладке, поэтому OBS захватывает уже
// заглушённый звук.
//
// Почему не через timeupdate, как пропуск рекламы: timeupdate приходит ~4 раза в секунду
// (раз в 250 мс), а слово длится 300–500 мс — можно не успеть. Поэтому проверяем каждые 50 мс.

const WORD_PAD_BEFORE = 0.25; // начинаем глушить чуть раньше слова (тайминги субтитров неточные)
const WORD_PAD_AFTER = 0.2; // и заканчиваем чуть позже
// Для слов с примерным временем (обычные субтитры без тайминга слов) — запас больше,
// иначе в длинной строке «бип» может промахнуться мимо слова.
const ESTIMATED_WORD_PAD = 0.6;
const WARN_AHEAD_SECONDS = 4; // за сколько секунд предупреждать
const MERGE_GAP_SECONDS = 0.4; // слова ближе друг к другу склеиваем в один отрезок, чтобы звук не «мигал»

// Найденные отрезки: { start, end, group, warned }
let streamerRanges = [];
let silenced = false; // глушим ли мы звук прямо сейчас
let silencedByMutedFlag = false; // глушили запасным способом (video.muted) — значит, его и возвращаем
let audioContext = null;
let videoGain = null; // наш регулятор громкости видео
let connectedVideo = null; // какой <video> сейчас подключён к регулятору
// Подключить <video> к Web Audio можно только ОДИН раз за его жизнь, поэтому запоминаем регулятор
// каждого видео (у обычных видео и у Shorts — разные элементы <video>).
// WeakMap не мешает браузеру удалить видео из памяти, когда его уберут со страницы.
const gainByVideo = new WeakMap();
let beepOscillator = null;

// Ищем запрещённые слова и превращаем их в отрезки времени для заглушения.
function findBadWordRanges(words, streamerSettings) {
  const matchWord = createWordMatcher(streamerSettings);
  const ranges = [];

  for (const word of words) {
    const group = matchWord(word.text);
    if (!group) continue;

    const padBefore = word.estimated ? ESTIMATED_WORD_PAD : WORD_PAD_BEFORE;
    const padAfter = word.estimated ? ESTIMATED_WORD_PAD : WORD_PAD_AFTER;
    const start = Math.max(0, word.start - padBefore);
    const end = word.end + padAfter;
    const last = ranges[ranges.length - 1];

    if (last && start - last.end < MERGE_GAP_SECONDS) {
      last.end = Math.max(last.end, end); // продолжаем предыдущий отрезок
      // если в склеенном отрезке есть оскорбление — показываем его цвет (оно важнее мата)
      if (group === 'slurs') last.group = 'slurs';
    } else {
      ranges.push({ start, end, group, warned: false });
    }
  }
  return ranges;
}

function setStreamerRanges(ranges, video) {
  stopStreamerMuting(video);
  streamerRanges = ranges;
}

// Вызывается каждые 50 мс из content.js.
function checkStreamerWords(video, streamerSettings) {
  if (!video || !streamerSettings.enabled || streamerRanges.length === 0) {
    stopStreamerMuting(video);
    return;
  }

  const time = video.currentTime;
  const isInside = streamerRanges.some((range) => time >= range.start && time < range.end);

  // 1. Заглушение
  if (isInside) {
    silence(video);
    // «Бип» звучит, только пока видео играет
    if (streamerSettings.beep && !video.paused) startBeep(video);
    else stopBeep();
  } else {
    stopStreamerMuting(video);
  }

  // 2. Предупреждение заранее
  for (const range of streamerRanges) {
    const secondsLeft = range.start - time;
    // Отмотали назад далеко от слова — снова разрешаем предупредить
    if (secondsLeft > WARN_AHEAD_SECONDS + 1) range.warned = false;

    if (streamerSettings.warn && !video.paused && !range.warned && secondsLeft > 0 && secondsLeft <= WARN_AHEAD_SECONDS) {
      range.warned = true;
      showWordWarning(Math.ceil(secondsLeft), range.group);
    }
  }
}

// group — 'slurs' | 'profanity' | 'custom': от неё зависит цвет точки (TYPE_COLORS в ui.js)
function showWordWarning(seconds, group) {
  const toast = showToast(t('wordWarning', seconds), [], 2500, group);
  // Предупреждение должно быть заметным — без полупрозрачности (см. .ais-toast-warning в content.css)
  if (toast) {
    toast.classList.add('ais-toast-warning');
    toast.style.setProperty('--warn-c', TYPE_COLORS[group] || '#ff4d4f'); // цвет рамки — как у точки
  }
}

// --- Заглушение звука ---

// Подключаем <video> к нашему регулятору громкости. Возвращает true, если регулятор готов.
function connectAudio(video) {
  if (connectedVideo === video && videoGain) return true;
  // Это видео уже подключали раньше (например, вернулись из Shorts к обычному видео) — берём его регулятор
  if (gainByVideo.has(video)) {
    videoGain = gainByVideo.get(video);
    connectedVideo = video;
    return true;
  }
  try {
    if (!audioContext) audioContext = new AudioContext();
    // Пока браузер не разрешил звук (до первого клика по странице), подключать нельзя:
    // звук видео ушёл бы в «спящий» AudioContext, и видео замолчало бы совсем.
    if (audioContext.state !== 'running') {
      audioContext.resume();
      return false;
    }
    const source = audioContext.createMediaElementSource(video);
    videoGain = audioContext.createGain();
    source.connect(videoGain);
    videoGain.connect(audioContext.destination);
    connectedVideo = video;
    gainByVideo.set(video, videoGain);
    return true;
  } catch (error) {
    // Например, это видео уже подключило другое расширение — используем запасной способ.
    return false;
  }
}

function silence(video) {
  if (silenced) return;
  silenced = true;
  if (connectAudio(video)) {
    // setTargetAtTime — плавно за ~10 мс, без щелчка в динамиках
    videoGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.01);
  } else if (!video.muted) {
    video.muted = true; // запасной способ
    silencedByMutedFlag = true;
  }
}

// Возвращаем звук, если глушили мы
function stopStreamerMuting(video) {
  stopBeep();
  if (!silenced) return;
  silenced = false;
  if (videoGain) videoGain.gain.setTargetAtTime(1, audioContext.currentTime, 0.01);
  if (silencedByMutedFlag && video) video.muted = false;
  silencedByMutedFlag = false;
}

// Браузер разрешает включить Web Audio только после действия пользователя (клик, клавиша).
// Ловим первое такое действие на странице и «будим» звук — дальше регулятор подключится сам.
['click', 'keydown'].forEach((eventName) => {
  document.addEventListener(eventName, () => {
    if (audioContext && audioContext.state !== 'running') audioContext.resume();
  }, true);
});

// «Бип» — синусоида 1000 Гц через Web Audio API. Громкость — от громкости видео, чтобы не оглушить.
function startBeep(video) {
  if (beepOscillator) return; // уже звучит
  try {
    if (!audioContext) audioContext = new AudioContext();
    if (audioContext.state !== 'running') return; // звук ещё не разрешён — будет просто тишина

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = 1000;
    gain.gain.value = 0.12 * video.volume;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    beepOscillator = oscillator;
  } catch (error) {
    // Не получилось — значит, будет просто тишина. Это тоже нормально.
  }
}

function stopBeep() {
  if (!beepOscillator) return;
  try {
    beepOscillator.stop();
  } catch (error) {
    // уже остановлен
  }
  beepOscillator = null;
}

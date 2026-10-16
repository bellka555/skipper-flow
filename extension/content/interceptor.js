// ПЕРЕХВАТЧИК СУБТИТРОВ.
// Этот скрипт работает в world: "MAIN" — то есть в том же JavaScript-окружении, что и сам YouTube.
// Только отсюда можно подменить window.fetch и XMLHttpRequest, которыми пользуется плеер.
// (Обычный content script живёт в «изолированном мире»: у него свой window.fetch,
//  и подмена там никак не повлияет на код YouTube.)
//
// Зачем перехватывать: если самим скачать субтитры по baseUrl, YouTube вернёт пустой ответ —
// ему нужен токен, который знает только плеер. Поэтому мы просто «подслушиваем» ответ,
// который получает сам плеер, и пересылаем текст в изолированный content script.
//
// Запускается при document_start — раньше, чем загрузится плеер, иначе он успеет
// сохранить у себя ссылку на оригинальный fetch/XHR.

(function () {
  const MESSAGE_SOURCE = 'ai-skipper'; // метка, по которой content.js узнает наши сообщения

  function isTimedTextUrl(url) {
    return typeof url === 'string' && url.includes('/api/timedtext');
  }

  // Отправляем перехваченный ответ в изолированный content script.
  // window.postMessage — единственный простой «мост» между двумя мирами одной страницы.
  function sendToContentScript(url, text) {
    if (!text) return; // пустой ответ нам не интересен
    window.postMessage(
      { source: MESSAGE_SOURCE, type: 'timedtext', url: url, text: text },
      window.location.origin // сообщение получат только скрипты на том же сайте
    );
  }

  // --- 1. Перехват XMLHttpRequest (основной способ: плеер грузит субтитры через XHR) ---
  const originalOpen = XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.open = function (method, url) {
    const urlString = String(url);

    if (isTimedTextUrl(urlString)) {
      // Когда запрос завершится — читаем ответ и пересылаем.
      this.addEventListener('load', function () {
        try {
          let text = '';
          if (this.responseType === '' || this.responseType === 'text') {
            text = this.responseText;
          } else if (this.responseType === 'json') {
            text = JSON.stringify(this.response);
          }
          sendToContentScript(urlString, text);
        } catch (error) {
          // Ошибка в перехватчике не должна ломать YouTube — молча игнорируем.
        }
      });
    }

    // Вызываем оригинальный open со всеми аргументами — плеер ничего не заметит.
    return originalOpen.apply(this, arguments);
  };

  // --- 2. Перехват fetch (на случай, если YouTube перейдёт на fetch) ---
  const originalFetch = window.fetch;

  window.fetch = async function (input, init) {
    const response = await originalFetch.apply(this, arguments);

    try {
      const url = input instanceof Request ? input.url : String(input);
      if (isTimedTextUrl(url)) {
        // clone() — потому что тело ответа можно прочитать только один раз,
        // а оригинал нужен плееру.
        response
          .clone()
          .text()
          .then((text) => sendToContentScript(url, text))
          .catch(() => {});
      }
      // Данные о новом видео при переходе внутри YouTube (среди них — главы).
      // Раньше YouTube запрашивал их через /next, сейчас — через объединённый /get_watch. Слушаем оба.
      if (url.includes('/youtubei/v1/next') || url.includes('/youtubei/v1/get_watch')) {
        response
          .clone()
          .json()
          .then(sendChapters)
          .catch(() => {});
      }
    } catch (error) {
      // игнорируем, см. выше
    }

    return response;
  };

  // --- 3. Главы видео («Главное в видео» в popup) ---
  // Главы лежат в данных страницы: при первой загрузке — в window.ytInitialData,
  // при переходе к другому видео — в ответе на запрос /youtubei/v1/next.
  // Внутри это выглядит так:
  //   markersMap: [ { key: 'DESCRIPTION_CHAPTERS', value: { chapters: [
  //     { chapterRenderer: { title: { simpleText: 'О чем гайд' }, timeRangeStartMillis: 0 } }, ...
  //   ] } } ]
  // DESCRIPTION_CHAPTERS — главы от автора (из таймкодов в описании), AUTO_CHAPTERS — созданные YouTube.

  // Ищем объект с полем markersMap где угодно внутри данных (путь к нему YouTube иногда меняет).
  function findMarkersMap(data) {
    if (!data || typeof data !== 'object') return null;
    if (Array.isArray(data.markersMap)) return data.markersMap;
    for (const key in data) {
      const found = findMarkersMap(data[key]);
      if (found) return found;
    }
    return null;
  }

  // Данные страницы видео — это объект с currentVideoEndpoint (в нём ID видео).
  // В ответе /get_watch он лежит не сверху, а внутри массива, поэтому ищем его где угодно.
  function findWatchData(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.currentVideoEndpoint && data.currentVideoEndpoint.watchEndpoint) return data;
    for (const key in data) {
      const found = findWatchData(data[key]);
      if (found) return found;
    }
    return null;
  }

  function sendChapters(data) {
    const watchData = findWatchData(data);
    if (!watchData) return; // это не данные страницы видео (например, подгрузка комментариев)
    const videoId = watchData.currentVideoEndpoint.watchEndpoint.videoId;

    const markersMap = findMarkersMap(watchData) || [];
    // Главы автора важнее автоматических
    const entry =
      markersMap.find((item) => item.key === 'DESCRIPTION_CHAPTERS') ||
      markersMap.find((item) => item.value && item.value.chapters);

    const chapters = [];
    if (entry && entry.value && entry.value.chapters) {
      for (const item of entry.value.chapters) {
        const chapter = item.chapterRenderer;
        if (!chapter || !chapter.title) continue;
        chapters.push({ start: (chapter.timeRangeStartMillis || 0) / 1000, title: chapter.title.simpleText || '' });
      }
    }

    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: 'chapters',
        videoId: videoId,
        kind: entry && entry.key === 'AUTO_CHAPTERS' ? 'auto' : 'author',
        chapters: chapters, // пустой список = у видео нет глав
      },
      window.location.origin
    );
  }

  // --- 4. Включить субтитры по просьбе content.js (для Shorts) ---
  // В Shorts нет кнопки «Субтитры», но у плеера есть команды (API): getOption / setOption.
  // Эти команды доступны только здесь, в мире страницы, — поэтому content.js просит нас через postMessage.
  // Мы включаем субтитры (плеер их скачивает — и наш перехват выше их ловит) и через 2 секунды выключаем.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== MESSAGE_SOURCE || data.type !== 'request-captions') return;
    requestCaptions(data.playerId);
  });

  function requestCaptions(playerId) {
    const player = document.getElementById(playerId);
    if (!player || typeof player.getOption !== 'function') return;
    try {
      player.loadModule('captions');
      const tracks = player.getOption('captions', 'tracklist', { includeAsr: true }) || [];
      if (tracks.length === 0) return; // у видео нет субтитров

      const current = player.getOption('captions', 'track');
      if (current && current.languageCode) return; // уже включены пользователем — плеер скачает их сам

      // Автоматические субтитры (asr) лучше: в них есть время каждого слова
      const track = tracks.find((item) => item.kind === 'asr') || tracks[0];
      player.setOption('captions', 'track', track);
      setTimeout(() => player.setOption('captions', 'track', {}), 2000); // {} = выключить
    } catch (error) {
      // API плеера поменялось — ничего страшного, режим стримера просто не сработает для этого видео
    }
  }

  // Первая загрузка страницы: ytInitialData появляется, когда разобрана разметка страницы.
  document.addEventListener('DOMContentLoaded', () => {
    try {
      sendChapters(window.ytInitialData);
    } catch (error) {
      // нет данных — значит, это не страница видео
    }
  });
})();

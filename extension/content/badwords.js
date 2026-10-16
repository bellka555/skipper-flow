// СЛОВАРЬ ДЛЯ РЕЖИМА СТРИМЕРА.
// Слова, за которые на стриминговых платформах могут заблокировать, если они прозвучат в эфире —
// даже из чужого видео. Расширение их только находит и заглушает, никуда не отправляет.
//
// Две группы (каждую можно включить/выключить в popup):
//   slurs     — оскорбления по национальности, расе, ориентации и т.п. (за них банят чаще всего);
//   profanity — мат и грубые ругательства.
//
// Формат записи:
//   'слово'    — совпадение целиком (только это слово);
//   'основа*'  — любое слово, которое начинается с этой основы (все окончания и формы);
//   '*корень*' — корень в любом месте слова. Только для корней, которых нет в обычных словах:
//                например, «хуй» нельзя — он есть в «застрахуйте», «ебат» есть в «хлебать».
// Буква «ё» заменяется на «е» перед сравнением, поэтому писать её не нужно.
// Языки: английский (en), русский (ru), украинский (uk). Проверяются все сразу —
// в видео часто смешиваются языки.

// Мат почти всегда живёт с приставками: «а-хуительно», «о-хуеть», «на-хуя», «за-ебал».
// Вместо того чтобы выписывать все слова, склеиваем приставки с корнями:
// withPrefixes(['а', 'о'], ['хуе']) -> ['ахуе*', 'охуе*'].
function withPrefixes(prefixes, roots) {
  return prefixes.flatMap((prefix) => roots.map((root) => prefix + root + '*'));
}

// '' — сам корень без приставки. Специально нет «в» и «с» перед «еб»: получились бы «веб» и «себе».
const RU_HU_PREFIXES = ['', 'а', 'о', 'на', 'по', 'за', 'от', 'вы', 'у', 'до', 'недо', 'пере', 'при', 'про', 'под', 'рас', 'раз', 'ни', 'об', 'в', 'с'];
const RU_EB_PREFIXES = ['у', 'о', 'по', 'за', 'на', 'вы', 'до', 'при', 'про', 'пере', 'недо', 'отъ', 'подъ', 'съ', 'въ', 'разъ', 'объ', 'долбо'];
const UK_HU_PREFIXES = ['', 'а', 'о', 'на', 'по', 'за', 'від', 'ви', 'у', 'до', 'пере', 'при', 'про', 'під', 'роз', 'з', 'об'];
const UK_IB_PREFIXES = ['за', 'ви', 'на', 'по', 'до', 'у', 'від', 'пере', 'при', 'про', 'роз'];

const BAD_WORDS = {
  slurs: {
    en: [
      'nigger*', 'nigga*', 'niggas', 'faggot*', 'fag', 'fags', 'retard', 'retards', 'retarded',
      'tranny', 'trannies', 'chink', 'chinks', 'spic', 'spics', 'kike', 'kikes', 'wetback*',
      'coon', 'coons', 'gook', 'gooks', 'beaner*', 'dyke', 'dykes',
    ],
    ru: [
      'пидор*', 'пидар*', 'пидр*', 'педик*', 'хохол', 'хохлы', 'хохлов', 'хохлам', 'хохлушк*',
      'москаль*', 'москали*', 'кацап*', 'чурка*', 'чурки', 'чурок', 'хач', 'хачи', 'хачей', 'хачик*',
      'жид', 'жиды', 'жида', 'жидов*', 'жидовк*', 'ниггер*', 'нигер*', 'негр', 'негры', 'негра',
      'негров', 'негритос*',
    ],
    uk: [
      'підор*', 'підар*', 'педік*', 'москаль*', 'москалі*', 'кацап*', 'чурка*', 'чурки', 'хач', 'хачі',
      'жид', 'жиди', 'жида', 'жидів*', 'нігер*', 'нігґер*', 'негр', 'негри', 'негра', 'негрів',
    ],
  },
  profanity: {
    en: [
      'fuck*', 'motherfuck*', 'shit', 'shits', 'shitty', 'bullshit', 'bitch*', 'cunt*',
      'asshole*', 'dickhead*', 'bastard*', 'whore*', 'slut*',
    ],
    ru: [
      ...withPrefixes(RU_HU_PREFIXES, ['хуй', 'хуя', 'хую', 'хуе', 'хуи']), // хуй, ахуительно, охуеть, нахуя…
      '*пизд*', // пизда, распиздяй, спиздил…
      'ебат*', 'ебан*', 'ебал*', 'ебу', 'ебет', 'ебешь', 'ебл*',
      ...withPrefixes(RU_EB_PREFIXES, ['еб']), // заебал, уебок, проебал, долбоеб…
      'бля', 'блять', 'бляд*',
      'сука', 'суки', 'суке', 'суку', 'сучк*', 'сучар*', 'мудак*', 'мудил*', 'гандон*', 'залуп*',
    ],
    uk: [
      ...withPrefixes(UK_HU_PREFIXES, ['хуй', 'хуя', 'хує', 'хуї']),
      '*пізд*',
      'їбат*', 'їбан*', 'єбат*', 'єбан*',
      ...withPrefixes(UK_IB_PREFIXES, ['їб', 'єб']),
      'бля', 'блять', 'бляд*', 'сука', 'суки', 'сучк*', 'курва', 'курви', 'курво', 'мудак*',
      'гандон*',
    ],
  },
};

// YouTube в автоматических субтитрах сам заменяет мат на «[ __ ]».
// Какое там слово — неизвестно, но место известно, поэтому такие метки считаем матом.
const YOUTUBE_MASKED_WORD = '[__]';

// Приводим слово к виду для сравнения: маленькие буквы, «ё» -> «е»,
// убираем знаки препинания по краям («сука!» -> «сука», «"bitch",» -> «bitch»).
function normalizeWord(word) {
  return word
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/^[^\p{L}\[]+|[^\p{L}\]]+$/gu, '');
}

// Превращаем список записей в удобную для проверки форму:
// exact — множество (Set) целых слов, stems — основы ('основа*'), roots — корни ('*корень*').
function compileWordList(entries) {
  const exact = new Set();
  const stems = [];
  const roots = [];
  for (const entry of entries) {
    const clean = normalizeWord(entry.split('*').join('')); // убираем все звёздочки
    if (!clean) continue;
    if (entry.startsWith('*') && entry.endsWith('*')) roots.push(clean);
    else if (entry.endsWith('*')) stems.push(clean);
    else exact.add(clean);
  }
  return { exact, stems, roots };
}

function matchesList(word, list) {
  if (list.exact.has(word)) return true;
  if (list.stems.some((stem) => word.startsWith(stem))) return true;
  return list.roots.some((root) => word.includes(root));
}

// Создаёт функцию-проверялку по текущим настройкам режима стримера.
// Она получает слово и возвращает группу ('slurs' | 'profanity' | 'custom') или null.
// customWords — строка из настроек: свои слова через запятую или с новой строки.
function createWordMatcher(streamerSettings) {
  const groups = [];
  for (const group of ['slurs', 'profanity']) {
    if (!streamerSettings[group]) continue; // группа выключена в popup
    const all = [...BAD_WORDS[group].en, ...BAD_WORDS[group].ru, ...BAD_WORDS[group].uk];
    groups.push({ name: group, list: compileWordList(all) });
  }

  const customEntries = (streamerSettings.customWords || '')
    .split(/[,\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
  if (customEntries.length > 0) {
    groups.push({ name: 'custom', list: compileWordList(customEntries) });
  }

  return function matchWord(rawWord) {
    const word = normalizeWord(rawWord);
    if (!word) return null;
    if (word === YOUTUBE_MASKED_WORD) return streamerSettings.profanity ? 'profanity' : null;
    for (const group of groups) {
      if (matchesList(word, group.list)) return group.name;
    }
    return null;
  };
}

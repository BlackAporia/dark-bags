// DARK BAGS landing page: language, live player count, flashlight hero, kill-feed ticker,
// a bag that fills as you scroll, modes, trailer, reveals. No libraries.
(() => {
  const $ = (id) => document.getElementById(id);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STATS = 'https://dark-bags-production.up.railway.app/api/stats';

  // old links to the game (it used to live at the site root) still land in the game
  if (/[?&]server=/.test(location.search) || /^#(online|practice|play)/.test(location.hash)) {
    location.replace(`play/${location.search}${location.hash}`);
    return;
  }

  // served from the repo as-is (site/ next to client/), the game is ../client/
  if (/\/site\/(index\.html)?$/.test(location.pathname)) for (const a of document.querySelectorAll('a[href="play/"]')) a.href = '../client/';

  // ------------------------------------------------------------ language
  // English is written in the page; these replace it by data-t key.
  const T = {
    uk: {
      'nav.how': 'Як це працює', 'nav.trailer': 'Трейлер', 'nav.modes': 'Режими', 'nav.features': 'Фішки', 'nav.faq': 'Питання',
      'cta.play': 'Грати', 'cta.playFree': 'Грати безкоштовно', 'cta.trailer': 'Дивитися трейлер', 'cta.enter': 'Увійти в рейд',
      'hero.online': 'зараз онлайн', 'hero.tag1': 'Став.', 'hero.tag2': 'Лути.', 'hero.tag3': 'Тікай.',
      'hero.lede': 'Швидкий шутер з видом згори просто в браузері. Починаєш з ножем, кожне вбивство прокачує зброю, хапаєш сумки суперників і встигаєш до виходу, поки шторм не закрив рейд.',
      'fact.modes': 'режимів', 'fact.players': 'гравців у рейді', 'fact.min': 'хвилини раунд', 'fact.install': 'встановлень: ПК і телефон',
      'how.eyebrow': 'Один рейд, три хвилини', 'how.h': 'Зайшов із сумкою. Вийшов з більшою. Або не вийшов.',
      'how.s1': 'Постав свою сумку', 'how.s1p': 'Обери режим і стіл. Ставка лягає в сумку, і всі бачать, наскільки вона приблизно повна. Можна блефувати: показати її легшою чи важчою.',
      'how.s2': 'Прокачуйся в бою', 'how.s2p': 'Усі починають з ножем. Кожне вбивство підвищує зброю: пістолет, дробовик, SMG, гвинтівка, снайперка. Поклав суперника, і його сумка твоя.',
      'how.s3': 'Встигни до шторму', 'how.s3p': 'Виходи відкриваються й закриваються, поки насувається шторм. Постій у виході, і все з сумки твоє. Влучили в тебе, і відлік почнеться знову.',
      'how.bag': 'Твоя сумка',
      'tr.eyebrow': 'Просто з гри', 'tr.h': 'Один рейд від старту до виходу', 'tr.note': 'Записано в грі (практика проти ботів), зі справжньою музикою, пострілами й диктором. Увімкни звук.',
      'md.eyebrow': '14 способів втратити сумку', 'md.h': 'Обери свій бій',
      'ft.eyebrow': 'І ще багато чого', 'ft.h': 'Сюди хочеться повертатися',
      'ft.skins': 'Кейси й скіни', 'ft.skinsP': 'Сумки з образами й ящики зі зброєю, дев\'ять рівнів, від $0.49. Шанси відкриті, є гарантія на рідкісне, кожен 10-й кейс безкоштовний. Лише косметика: на бій скіни не впливають.',
      'ft.phone': 'Грається на телефоні', 'ft.phoneP': 'Поверни його горизонтально: джойстик руху, одна кнопка вогню з автонаведенням, лут збирається сам.',
      'ft.social': 'Друзі, гільдії, чат', 'ft.socialP': 'Додавай друзів, пиши їм, клич у свою кімнату. З 20 рангу засновуй гільдію з власним чатом.',
      'ft.ranks': 'Ранги й досягнення', 'ft.ranksP': 'Кожен рейд дає досвід, виграв ти чи ні. Відкривай титули, що світяться над головою в наступному рейді.',
      'ft.chain': 'Твій гаманець, твій вивід', 'ft.chainP': 'Вхід через Ready, Braavos, Cartridge або просто пошту. Депозити й виводи на Starknet, і вивід іде лише на ту адресу, з якої ти увійшов.',
      'ft.fair': 'Вирішує сервер, а не твій екран', 'ft.fairP': 'Кожне влучання, лут і виплату рахує сервер. Браузер лише каже, куди ти йдеш і цілишся.',
      'ft.lang': '10 мов, живий пінг, кімнати очікування', 'ft.langP': 'English, Українська, Русский, Español, Français, Português, Türkçe, 中文, हिन्दी, العربية. Видно, хто в якій кімнаті чекає, і можна одразу приєднатися.',
      'rd.eyebrow': 'Де ми зараз', 'rd.h': 'Шлях до запуску', 'rd.now': 'Зараз',
      'rd.1': 'Відкритий тест', 'rd.1p': 'Уже працює. Грай онлайн у Starknet Sepolia з безкоштовними тестовими токенами. Знайди баг і розкажи нам.',
      'rd.2': 'Закрита бета в мейнеті', 'rd.2p': 'Справжні токени з малими лімітами, для запрошених гравців.',
      'rd.3': 'Запуск', 'rd.3p': 'Відкриті двері, турніри й сезони там, де це дозволяє закон.',
      'fq.eyebrow': 'Питання', 'fq.h': 'Перед тим як зайти',
      'fq.q1': 'Це безкоштовно?', 'fq.a1': 'Так. Практика проти ботів не потребує нічого, навіть акаунта. Онлайн у тестовій мережі грається на безкоштовних тестових токенах.',
      'fq.q2': 'Мені потрібна крипта?', 'fq.a2': 'Ні. Практику можна грати одразу. Для онлайну в тестовій мережі увійди через гаманець Starknet або пошту й візьми тестові токени з крану.',
      'fq.q3': 'Там зараз справжні гроші?', 'fq.a3': 'Поки ні. Відкритий тест іде в Starknet Sepolia, де токени нічого не коштують. Гра на справжні токени буде пізніше, закритою бетою, лише для дорослих і лише там, де це законно.',
      'fq.q4': 'Працює на телефоні?', 'fq.a4': 'Так, у браузері. Поверни телефон горизонтально: рух лівим джойстиком, вогонь кнопкою справа.',
      'fq.q5': 'А читерити можна?', 'fq.a5': 'Рейд веде сервер і перевіряє кожен рух, влучання й виплату. Гра в браузері лише малює те, що сталося на сервері.',
      'fn.h': 'Шторм уже насувається.', 'fn.p': 'Без завантаження, без реєстрації для практики. Один клік, і ти в темряві з ножем.',
      'ft.foot': 'Тестова бета. Токени в Sepolia нічого не коштують. Гра на справжні токени: 18+ і лише там, де це законно.',
    },
    ru: {
      'nav.how': 'Как это работает', 'nav.trailer': 'Трейлер', 'nav.modes': 'Режимы', 'nav.features': 'Фишки', 'nav.faq': 'Вопросы',
      'cta.play': 'Играть', 'cta.playFree': 'Играть бесплатно', 'cta.trailer': 'Смотреть трейлер', 'cta.enter': 'Войти в рейд',
      'hero.online': 'сейчас онлайн', 'hero.tag1': 'Ставь.', 'hero.tag2': 'Лути.', 'hero.tag3': 'Уходи.',
      'hero.lede': 'Быстрый шутер с видом сверху прямо в браузере. Начинаешь с ножом, каждое убийство прокачивает оружие, хватаешь сумки соперников и успеваешь к выходу, пока шторм не закрыл рейд.',
      'fact.modes': 'режимов', 'fact.players': 'игроков в рейде', 'fact.min': 'минуты раунд', 'fact.install': 'установок: ПК и телефон',
      'how.eyebrow': 'Один рейд, три минуты', 'how.h': 'Зашёл с сумкой. Вышел с большей. Или не вышел.',
      'how.s1': 'Поставь свою сумку', 'how.s1p': 'Выбери режим и стол. Ставка ложится в сумку, и все видят, насколько она примерно полная. Можно блефовать: показать её легче или тяжелее.',
      'how.s2': 'Прокачивайся в бою', 'how.s2p': 'Все начинают с ножом. Каждое убийство повышает оружие: пистолет, дробовик, SMG, винтовка, снайперка. Уложил соперника, и его сумка твоя.',
      'how.s3': 'Успей до шторма', 'how.s3p': 'Выходы открываются и закрываются, пока надвигается шторм. Постой в выходе, и всё из сумки твоё. Попали в тебя, и отсчёт начнётся заново.',
      'how.bag': 'Твоя сумка',
      'tr.eyebrow': 'Прямо из игры', 'tr.h': 'Один рейд от старта до выхода', 'tr.note': 'Записано в игре (тренировка против ботов), с настоящей музыкой, выстрелами и диктором. Включи звук.',
      'md.eyebrow': '14 способов потерять сумку', 'md.h': 'Выбери свой бой',
      'ft.eyebrow': 'И ещё много всего', 'ft.h': 'Сюда хочется возвращаться',
      'ft.skins': 'Кейсы и скины', 'ft.skinsP': 'Сумки с образами и ящики с оружием, девять уровней, от $0.49. Шансы открыты, есть гарант на редкое, каждый 10-й кейс бесплатно. Только косметика: на бой скины не влияют.',
      'ft.phone': 'Играется на телефоне', 'ft.phoneP': 'Поверни его горизонтально: джойстик движения, одна кнопка огня с автонаведением, лут собирается сам.',
      'ft.social': 'Друзья, гильдии, чат', 'ft.socialP': 'Добавляй друзей, пиши им, зови в свою комнату. С 20 ранга основывай гильдию со своим чатом.',
      'ft.ranks': 'Ранги и достижения', 'ft.ranksP': 'Каждый рейд даёт опыт, выиграл ты или нет. Открывай титулы, которые горят над головой в следующем рейде.',
      'ft.chain': 'Твой кошелёк, твой вывод', 'ft.chainP': 'Вход через Ready, Braavos, Cartridge или просто почту. Депозиты и выводы в Starknet, и вывод идёт только на тот адрес, с которого ты вошёл.',
      'ft.fair': 'Решает сервер, а не твой экран', 'ft.fairP': 'Каждое попадание, лут и выплату считает сервер. Браузер только говорит, куда ты идёшь и целишься.',
      'ft.lang': '10 языков, живой пинг, комнаты ожидания', 'ft.langP': 'English, Українська, Русский, Español, Français, Português, Türkçe, 中文, हिन्दी, العربية. Видно, кто в какой комнате ждёт, и можно сразу присоединиться.',
      'rd.eyebrow': 'Где мы сейчас', 'rd.h': 'Путь к запуску', 'rd.now': 'Сейчас',
      'rd.1': 'Открытый тест', 'rd.1p': 'Уже работает. Играй онлайн в Starknet Sepolia с бесплатными тестовыми токенами. Найди баг и расскажи нам.',
      'rd.2': 'Закрытая бета в мейннете', 'rd.2p': 'Настоящие токены с маленькими лимитами, для приглашённых игроков.',
      'rd.3': 'Запуск', 'rd.3p': 'Открытые двери, турниры и сезоны там, где это разрешает закон.',
      'fq.eyebrow': 'Вопросы', 'fq.h': 'Перед тем как зайти',
      'fq.q1': 'Это бесплатно?', 'fq.a1': 'Да. Тренировка против ботов не требует ничего, даже аккаунта. Онлайн в тестовой сети играется на бесплатных тестовых токенах.',
      'fq.q2': 'Мне нужна крипта?', 'fq.a2': 'Нет. Тренировку можно играть сразу. Для онлайна в тестовой сети войди через кошелёк Starknet или почту и возьми тестовые токены из крана.',
      'fq.q3': 'Там сейчас настоящие деньги?', 'fq.a3': 'Пока нет. Открытый тест идёт в Starknet Sepolia, где токены ничего не стоят. Игра на настоящие токены будет позже, закрытой бетой, только для взрослых и только там, где это законно.',
      'fq.q4': 'Работает на телефоне?', 'fq.a4': 'Да, в браузере. Поверни телефон горизонтально: движение левым джойстиком, огонь кнопкой справа.',
      'fq.q5': 'А читерить можно?', 'fq.a5': 'Рейд ведёт сервер и проверяет каждое движение, попадание и выплату. Игра в браузере только рисует то, что случилось на сервере.',
      'fn.h': 'Шторм уже надвигается.', 'fn.p': 'Без загрузки, без регистрации для тренировки. Один клик, и ты в темноте с ножом.',
      'ft.foot': 'Тестовая бета. Токены в Sepolia ничего не стоят. Игра на настоящие токены: 18+ и только там, где это законно.',
    },
  };

  const MODES = [
    { id: 'raid', ico: '🎒', c: '#3ddc97', size: '10', chips: { en: ['Extract', 'Keep your loot'], uk: ['Вихід', 'Забираєш лут'], ru: ['Выход', 'Забираешь лут'] },
      n: { en: 'Raid', uk: 'Рейд', ru: 'Рейд' },
      d: { en: 'Loot, fight, get out through an exit. Keep what you carry.', uk: 'Лути, бийся, виходь через вихід. Забираєш те, що несеш.', ru: 'Лути, дерись, уходи через выход. Забираешь то, что несёшь.' } },
    { id: 'br', ico: '👑', c: '#ffd166', size: '2–20', chips: { en: ['Storm', 'Winner takes all'], uk: ['Шторм', 'Переможець забирає все'], ru: ['Шторм', 'Победитель забирает всё'] },
      n: { en: 'Battle Royale', uk: 'Королівська битва', ru: 'Королевская битва' },
      d: { en: 'Up to 20 runners. Last one standing takes the whole pot.', uk: 'До 20 бійців. Останній живий забирає весь банк.', ru: 'До 20 бойцов. Последний выживший забирает весь банк.' } },
    { id: 'duel', ico: '⚔️', c: '#58c6ff', size: '1v1', chips: { en: ['90 s', 'Both stakes'], uk: ['90 с', 'Обидві ставки'], ru: ['90 с', 'Обе ставки'] },
      n: { en: 'Duel', uk: 'Дуель', ru: 'Дуэль' },
      d: { en: 'One on one. Winner takes both stakes.', uk: 'Один на один. Переможець забирає обидві ставки.', ru: 'Один на один. Победитель забирает обе ставки.' } },
    { id: 'dm', ico: '💀', c: '#ff4d5e', size: '12', chips: { en: ['Respawn', 'Most kills'], uk: ['Відродження', 'Найбільше вбивств'], ru: ['Возрождение', 'Больше убийств'] },
      n: { en: 'Deathmatch', uk: 'Бій на смерть', ru: 'Бой насмерть' },
      d: { en: 'Everyone for themselves, respawn after every death. Most kills at the whistle takes the pot.', uk: 'Кожен сам за себе, відродження після кожної смерті. Найбільше вбивств наприкінці забирає банк.', ru: 'Каждый сам за себя, возрождение после каждой смерти. Больше всех убийств к концу забирает банк.' } },
    { id: 'gl', ico: '🛰️', c: '#b388ff', size: '12', chips: { en: ['Turrets', 'Laser mines', 'Medkits'], uk: ['Турелі', 'Лазерні міни', 'Аптечки'], ru: ['Турели', 'Лазерные мины', 'Аптечки'] },
      n: { en: 'Guns + Lasers', uk: 'Гармати + Лазери', ru: 'Пушки + Лазеры' },
      d: { en: 'Deathmatch with a buy menu: kills pay credits for medkits, sentry turrets and laser tripmines.', uk: 'Бій на смерть із магазином: вбивства дають кредити на аптечки, турелі та лазерні міни.', ru: 'Бой насмерть с магазином: убийства дают кредиты на аптечки, турели и лазерные мины.' } },
    { id: 'hardcore', ico: '☠️', c: '#ff7a45', size: '12', chips: { en: ['One hit', 'No mercy'], uk: ['Одне влучання', 'Без жалю'], ru: ['Одно попадание', 'Без пощады'] },
      n: { en: 'Hardcore', uk: 'Хардкор', ru: 'Хардкор' },
      d: { en: 'Minimal health: one bullet and you are down. Last one standing takes the pot.', uk: 'Мінімум здоров\'я: одна куля, і ти труп. Останній живий забирає банк.', ru: 'Минимум здоровья: одна пуля, и ты труп. Последний выживший забирает банк.' } },
    { id: 'weapons', ico: '🔪', c: '#ebe5d6', size: '12', chips: { en: ['Knives', 'Pistols', 'Shotguns', 'Rifles', 'Snipers'], uk: ['Ножі', 'Пістолети', 'Дробовики', 'Гвинтівки', 'Снайперки'], ru: ['Ножи', 'Пистолеты', 'Дробовики', 'Винтовки', 'Снайперки'] },
      n: { en: 'One weapon', uk: 'Одна зброя', ru: 'Одно оружие' },
      d: { en: 'Five modes where everyone gets the same gun, all raid. Pure aim.', uk: 'П\'ять режимів, де в усіх однакова зброя весь рейд. Лише влучність.', ru: 'Пять режимов, где у всех одинаковое оружие весь рейд. Только меткость.' } },
    { id: 'teams', ico: '👥', c: '#3ddc97', size: '2v2 · 4v4 · 8v8', chips: { en: ['Shared pot', 'Squads'], uk: ['Спільний банк', 'Загони'], ru: ['Общий банк', 'Отряды'] },
      n: { en: 'Teams', uk: 'Команди', ru: 'Команды' },
      d: { en: 'Every stake grows one pot. The last team standing splits it.', uk: 'Кожна ставка росте в один банк. Остання жива команда ділить його.', ru: 'Каждая ставка растит один банк. Последняя выжившая команда делит его.' } },
  ];

  const FEED = {
    en: [['ape_42', 'dropped', 'fee_sniper'], 'DOUBLE KILL', ['gm_ghost', 'extracted', '$4.20'], 'SHOTGUN UNLOCKED', ['wagmi_wolf', 'dropped', 'paper_hands'], 'FIRST BLOOD', ['rug_ranger', 'takes the lead with', '5'], 'RAMPAGE', ['dust_dealer', 'extracted', '$12.80'], 'LAST EXIT OPEN'],
    uk: [['ape_42', 'поклав', 'fee_sniper'], 'ПОДВІЙНЕ ВБИВСТВО', ['gm_ghost', 'вийшов з', '$4.20'], 'ДРОБОВИК ВІДКРИТО', ['wagmi_wolf', 'поклав', 'paper_hands'], 'ПЕРША КРОВ', ['rug_ranger', 'лідирує з', '5'], 'ЛЮТЬ', ['dust_dealer', 'вийшов з', '$12.80'], 'ОСТАННІЙ ВИХІД'],
    ru: [['ape_42', 'уложил', 'fee_sniper'], 'ДВОЙНОЕ УБИЙСТВО', ['gm_ghost', 'вышел с', '$4.20'], 'ДРОБОВИК ОТКРЫТ', ['wagmi_wolf', 'уложил', 'paper_hands'], 'ПЕРВАЯ КРОВЬ', ['rug_ranger', 'лидирует с', '5'], 'БУЙСТВО', ['dust_dealer', 'вышел с', '$12.80'], 'ПОСЛЕДНИЙ ВЫХОД'],
  };

  const BAG = {
    en: [['You dropped <b>ape_42</b>', 1.2], ['Picked up a <b>stack</b>', 0.8], ['You dropped <b>fee_sniper</b>', 2.1], ['Picked up a <b>chest</b>', 3.4], ['<span class="ok">Extracting… hold still</span>', 0], ['<span class="ok">Extracted. The bag is yours.</span>', 0]],
    uk: [['Ти поклав <b>ape_42</b>', 1.2], ['Підібрав <b>пачку</b>', 0.8], ['Ти поклав <b>fee_sniper</b>', 2.1], ['Підібрав <b>скриню</b>', 3.4], ['<span class="ok">Вихід… не рухайся</span>', 0], ['<span class="ok">Вийшов. Сумка твоя.</span>', 0]],
    ru: [['Ты уложил <b>ape_42</b>', 1.2], ['Подобрал <b>пачку</b>', 0.8], ['Ты уложил <b>fee_sniper</b>', 2.1], ['Подобрал <b>сундук</b>', 3.4], ['<span class="ok">Выход… не двигайся</span>', 0], ['<span class="ok">Вышел. Сумка твоя.</span>', 0]],
  };

  const english = new Map();
  for (const el of document.querySelectorAll('[data-t]')) english.set(el, el.innerHTML);
  let lang = 'en';
  try {
    lang = localStorage.getItem('darkbags.site.lang') || '';
  } catch {}
  if (!['en', 'uk', 'ru'].includes(lang)) {
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    lang = nav === 'uk' ? 'uk' : nav === 'ru' ? 'ru' : 'en';
  }

  function setLang(l) {
    lang = l;
    document.documentElement.lang = l;
    try {
      localStorage.setItem('darkbags.site.lang', l);
    } catch {}
    for (const [el, en] of english) el.innerHTML = T[l]?.[el.dataset.t] ?? en;
    for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === l));
    renderModes();
    renderTicker();
    bagStep = 0;
  }
  for (const b of document.querySelectorAll('[data-lang]')) b.addEventListener('click', () => setLang(b.dataset.lang));

  // ---------------------------------------------------------------- modes
  function renderModes() {
    const grid = $('mode-grid');
    grid.innerHTML = MODES.map(
      (m, i) => `<article class="mode reveal${grid.dataset.shown ? ' in' : ''}" style="--c:${m.c};--d:${(i % 4) * 0.07}s">
        <div class="mode-top"><span class="mode-ico" aria-hidden="true">${m.ico}</span><h3>${m.n[lang]}</h3></div>
        <p>${m.d[lang]}</p>
        <div class="chips"><span class="chip hot">${m.size}</span>${m.chips[lang].map((c) => `<span class="chip">${c}</span>`).join('')}</div>
      </article>`,
    ).join('');
    for (const el of grid.querySelectorAll('.reveal:not(.in)')) io?.observe(el);
    grid.dataset.shown = '1';
  }

  // --------------------------------------------------------------- ticker
  function renderTicker() {
    const one = FEED[lang].map((x) => (typeof x === 'string' ? `<span class="hot">${x}</span>` : `<span><b>${x[0]}</b> ${x[1]} <b class="${x[1].includes('$') || /\$/.test(x[2]) ? 'ok' : ''}">${x[2]}</b></span>`)).join('');
    $('ticker').innerHTML = one + one; // two copies: the loop is seamless at -50%
  }

  // --------------------------------------------------------------- reveal
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(
        (es) => {
          for (const e of es)
            if (e.isIntersecting) {
              e.target.classList.add('in');
              io.unobserve(e.target);
            }
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
      )
    : null;
  for (const el of document.querySelectorAll('.reveal')) (io ? io.observe(el) : el.classList.add('in'));
  document.querySelectorAll('.steps .step').forEach((el, i) => el.style.setProperty('--d', `${i * 0.12}s`));

  // ------------------------------------------------------------ top bar
  const bar = $('bar');
  const onScroll = () => bar.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------------------------------------------------------------- title
  const title = document.querySelector('.title');
  if (!calm) {
    let k = 0;
    for (const span of title.querySelectorAll('span')) {
      const word = span.textContent;
      span.textContent = '';
      for (const ch of word) {
        const c = document.createElement('i');
        c.className = 'ch';
        c.style.fontStyle = 'normal';
        c.textContent = ch;
        c.style.animationDelay = `${0.15 + k++ * 0.07}s`;
        span.append(c);
      }
    }
    const glitch = () => {
      title.classList.add('glitch');
      setTimeout(() => title.classList.remove('glitch'), 380);
      setTimeout(glitch, 2600 + Math.random() * 3800);
    };
    setTimeout(glitch, 1800);
  }

  // ------------------------------------------- flashlight + tracers (hero)
  const hero = $('hero');
  const dark = hero.querySelector('.hero-dark');
  const light = { x: 0.5, y: 0.45, tx: 0.5, ty: 0.45, user: false };
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    light.tx = (e.clientX - r.left) / r.width;
    light.ty = (e.clientY - r.top) / r.height;
    light.user = true;
  });
  hero.addEventListener('pointerleave', () => (light.user = false));

  const cv = $('hero-fx');
  const ctx = cv.getContext('2d');
  let W = 0;
  let H = 0;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const size = () => {
    W = hero.clientWidth;
    H = hero.clientHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  addEventListener('resize', size);
  const tracers = [];
  const sparks = [];
  const COLORS = ['#f7931a', '#ffd166', '#58c6ff', '#ff4d5e', '#b388ff'];
  function shot() {
    const fromLeft = Math.random() < 0.5;
    const y = H * (0.15 + Math.random() * 0.7);
    const a = (fromLeft ? 0 : Math.PI) + (Math.random() - 0.5) * 0.5;
    tracers.push({ x: fromLeft ? -40 : W + 40, y, vx: Math.cos(a) * (1400 + Math.random() * 600), vy: Math.sin(a) * 900, c: COLORS[Math.floor(Math.random() * COLORS.length)], life: 1.4 });
  }
  let heroOn = true;
  new IntersectionObserver(([e]) => (heroOn = e.isIntersecting)).observe(hero);
  let last = performance.now();
  let nextShot = 0;
  let t = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    if (heroOn) {
      if (!light.user) {
        // wander like a runner looking around
        light.tx = 0.5 + Math.sin(t * 0.45) * 0.28;
        light.ty = 0.45 + Math.sin(t * 0.7 + 1) * 0.16;
      }
      light.x += (light.tx - light.x) * Math.min(1, dt * 6);
      light.y += (light.ty - light.y) * Math.min(1, dt * 6);
      dark.style.setProperty('--mx', `${(light.x * 100).toFixed(2)}%`);
      dark.style.setProperty('--my', `${(light.y * 100).toFixed(2)}%`);
      ctx.clearRect(0, 0, W, H);
      if (!calm) {
        nextShot -= dt;
        if (nextShot <= 0) {
          shot();
          nextShot = 0.35 + Math.random() * 1.1;
        }
        // the storm's edge sweeping the corner
        const r = Math.max(W, H) * (0.78 + Math.sin(t * 0.25) * 0.05);
        ctx.save();
        ctx.setLineDash([14, 12]);
        ctx.lineDashOffset = -t * 30;
        ctx.strokeStyle = 'rgba(255, 77, 94, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(W * 0.5, H * 0.52, r * 0.62, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = tracers.length - 1; i >= 0; i--) {
          const p = tracers[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          const tail = 0.06;
          const g = ctx.createLinearGradient(p.x - p.vx * tail, p.y - p.vy * tail, p.x, p.y);
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(1, p.c);
          ctx.strokeStyle = g;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(p.x - p.vx * tail, p.y - p.vy * tail);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          if (Math.random() < 0.02 && p.x > 0 && p.x < W) for (let k = 0; k < 10; k++) sparks.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 380, vy: (Math.random() - 0.5) * 380, life: 0.5, c: p.c });
          if (p.life <= 0 || p.x < -200 || p.x > W + 200) tracers.splice(i, 1);
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vx *= 0.94;
          s.vy *= 0.94;
          s.life -= dt;
          ctx.globalAlpha = Math.max(0, s.life * 2);
          ctx.fillStyle = s.c;
          ctx.fillRect(s.x, s.y, 2, 2);
          if (s.life <= 0) sparks.splice(i, 1);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------- the bag fills as you read
  let bagStep = 0;
  let bagVal = 1;
  let bagOn = false;
  const bagNum = $('bag-num');
  const bagBar = $('bag-bar');
  const bagFeed = $('bag-feed');
  new IntersectionObserver(([e]) => (bagOn = e.isIntersecting), { threshold: 0.5 }).observe(document.querySelector('.bagmeter'));
  function bagTick() {
    if (bagOn) {
      const steps = BAG[lang];
      if (bagStep >= steps.length) {
        bagStep = 0;
        bagVal = 1;
        bagFeed.innerHTML = '';
      } else {
        const [line, add] = steps[bagStep++];
        bagVal += add;
        bagFeed.innerHTML = line;
      }
      bagNum.textContent = `$${bagVal.toFixed(2)}`;
      bagBar.style.width = `${Math.min(100, (bagVal / 9.5) * 100)}%`;
    }
    setTimeout(bagTick, bagStep >= BAG[lang].length ? 2600 : 1300);
  }
  bagTick();

  // --------------------------------------------------------------- trailer
  const screen = $('screen');
  const demo = $('demo');
  $('demo-play').addEventListener('click', () => {
    demo.muted = false;
    demo.play().catch(() => {});
  });
  demo.addEventListener('play', () => screen.classList.add('playing'));
  demo.addEventListener('pause', () => screen.classList.remove('playing'));
  demo.addEventListener('ended', () => screen.classList.remove('playing'));

  // -------------------------------------------- magnetic buttons, tilt cards
  if (!calm && matchMedia('(hover: hover)').matches) {
    for (const b of document.querySelectorAll('.magnet')) {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`;
      });
      b.addEventListener('pointerleave', () => (b.style.transform = ''));
    }
    for (const c of document.querySelectorAll('.tilt')) {
      c.addEventListener('pointermove', (e) => {
        const r = c.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        c.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`;
      });
      c.addEventListener('pointerleave', () => (c.style.transform = ''));
    }
  }

  // ------------------------------------------------- live players, if up
  async function live() {
    try {
      const r = await fetch(STATS, { cache: 'no-store' });
      const s = await r.json();
      if (typeof s.online === 'number' && s.online > 0) {
        $('live-n').textContent = s.online;
        $('live').hidden = false;
      }
    } catch {
      /* server asleep or unreachable: the badge stays hidden */
    }
  }
  live();
  setInterval(() => document.visibilityState === 'visible' && live(), 20000);

  setLang(lang);
})();

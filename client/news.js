// "What's new": the update notes, opened once when a player comes in after an update (and
// any time from Settings). Newest first; each has its date and time and a list per language.
import { getLang, t } from './i18n.js';
import { store } from './store.js';
import { esc } from './game.js';

const $ = (id) => document.getElementById(id);
const SEEN = 'darkbags.news.seen';

export const NEWS = [
  {
    id: '2026-10-02b',
    at: '2026-10-02T13:45:00+03:00',
    items: {
      en: ['Locker: tap your runner to see only what you own, filter and sort by rarity, preview and equip (outfits, weapon skins, turret skins)', 'Health no longer comes back by itself in a match: only Guns + Lasers medkits heal', 'Every enemy still standing shows on the minimap (teammates in green)', 'Enemy names and red health bars in every mode', 'Friends: browse everyone who has ever played (show more), invite players into your guild', 'Smoother menus: the live map behind windows pauses while they are open', 'Stakes: a $100 table, and type your own from $0.10 to $10,000', 'Share cards show your name', "What's new: these notes open after every update (also in Settings)"],
      uk: ['Шафка: натисни на персонажа — лише твої речі, фільтр і сортування за рідкістю, приміряти й екіпірувати (образи, скіни зброї, скіни турелей)', 'Здоров’я в матчі більше не відновлюється само: лікують лише аптечки в «Гармати + Лазери»', 'Усі живі вороги на міні-карті (союзники зеленим)', 'Ніки ворогів і червоні шкали здоров’я в усіх режимах', 'Друзі: усі гравці, які хоч раз грали («Показати ще»), запрошення в гільдію', 'Плавніші меню: жива карта за вікнами стає на паузу, поки вони відкриті', 'Ставки: стіл $100 і своя сума від $0.10 до $10 000', 'На картках «Поділитися» видно твій нік', '«Що нового»: ці нотатки відкриваються після кожного оновлення (також у Налаштуваннях)'],
      ru: ['Шкафчик: нажми на персонажа — только твои вещи, фильтр и сортировка по редкости, примерить и экипировать (образы, скины оружия, скины турелей)', 'Здоровье в матче больше не восстанавливается само: лечат только аптечки в «Пушки + Лазеры»', 'Все живые враги на мини-карте (союзники зелёным)', 'Ники врагов и красные полоски здоровья во всех режимах', 'Друзья: все игроки, кто хоть раз играл («Показать ещё»), приглашения в гильдию', 'Плавнее меню: живая карта за окнами на паузе, пока они открыты', 'Ставки: стол $100 и своя сумма от $0.10 до $10 000', 'На карточках «Поделиться» виден твой ник', '«Что нового»: эти заметки открываются после каждого обновления (также в Настройках)'],
      es: ['Taquilla: toca tu corredor para ver solo lo tuyo, filtra y ordena por rareza, prueba y equipa (atuendos, skins de arma y de torreta)', 'La salud ya no se recupera sola en partida: solo curan los botiquines de Armas + Láseres', 'Todos los enemigos vivos aparecen en el minimapa (aliados en verde)', 'Nombres de enemigos y barras de vida rojas en todos los modos', 'Amigos: todos los que han jugado alguna vez (mostrar más), invita jugadores a tu gremio', 'Menús más fluidos: el mapa en vivo detrás de las ventanas se pausa', 'Apuestas: mesa de $100 y tu propia cantidad de $0.10 a $10.000', 'Las tarjetas para compartir muestran tu nombre', 'Novedades: estas notas se abren tras cada actualización (también en Ajustes)'],
      fr: ['Casier : touche ton coureur pour ne voir que tes objets, filtre et trie par rareté, essaie et équipe (tenues, skins d’arme et de tourelle)', 'La santé ne revient plus seule en match : seuls les médikits de Armes + Lasers soignent', 'Tous les ennemis encore debout sur la mini-carte (alliés en vert)', 'Noms des ennemis et barres de vie rouges dans tous les modes', 'Amis : tous ceux qui ont déjà joué (voir plus), invite des joueurs dans ta guilde', 'Menus plus fluides : la carte en direct derrière les fenêtres se met en pause', 'Mises : une table à 100 $ et ton propre montant de 0,10 $ à 10 000 $', 'Les cartes à partager affichent ton pseudo', "Nouveautés : ces notes s'ouvrent après chaque mise à jour (aussi dans Réglages)"],
      pt: ['Armário: toque no seu corredor para ver só o que é seu, filtre e ordene por raridade, prove e equipe (roupas, skins de arma e de torreta)', 'A vida não volta mais sozinha na partida: só os kits médicos de Armas + Lasers curam', 'Todos os inimigos vivos aparecem no minimapa (aliados em verde)', 'Nomes de inimigos e barras de vida vermelhas em todos os modos', 'Amigos: todos que já jogaram (mostrar mais), convide jogadores para sua guilda', 'Menus mais suaves: o mapa ao vivo atrás das janelas pausa enquanto estão abertas', 'Apostas: mesa de $100 e seu próprio valor de $0,10 a $10.000', 'Os cartões de compartilhar mostram seu nome', 'Novidades: estas notas abrem após cada atualização (também em Ajustes)'],
      tr: ['Dolap: koşucuna dokun, yalnızca senin eşyaların; nadirliğe göre filtrele ve sırala, dene ve kuşan (kıyafetler, silah ve taret görünümleri)', 'Can artık maçta kendiliğinden dolmuyor: yalnızca Silahlar + Lazerler medkitleri iyileştirir', 'Ayakta kalan tüm düşmanlar mini haritada (takım arkadaşları yeşil)', 'Tüm modlarda düşman isimleri ve kırmızı can çubukları', 'Arkadaşlar: bir kez bile oynamış herkes (daha fazla), oyuncuları loncana davet et', 'Daha akıcı menüler: pencereler açıkken arkadaki canlı harita durur', 'Bahisler: $100 masası ve $0.10–$10.000 arası kendi tutarın', 'Paylaşım kartlarında adın görünür', 'Yenilikler: bu notlar her güncellemeden sonra açılır (Ayarlar’da da)'],
      zh: ['储物柜：点击角色只看你拥有的物品，按稀有度筛选和排序，试穿并装备（服装、武器皮肤、炮塔皮肤）', '比赛中生命不再自动恢复：只有「枪械+激光」的医疗包能治疗', '所有存活的敌人显示在小地图上（队友为绿色）', '所有模式中显示敌人名字和红色血条', '好友：浏览所有玩过的玩家（显示更多），邀请玩家加入你的公会', '菜单更流畅：窗口打开时后方的实时地图暂停', '赌注：新增 $100 桌，并可自填 $0.10 至 $10,000', '分享卡片显示你的昵称', '更新内容：每次更新后自动打开（也可在设置中查看）'],
      hi: ['लॉकर: अपने रनर पर टैप करो — सिर्फ़ तुम्हारी चीज़ें, दुर्लभता से फ़िल्टर और सॉर्ट, देखो और पहनो (आउटफ़िट, हथियार और टर्रेट स्किन)', 'मैच में हेल्थ अब अपने-आप वापस नहीं आती: सिर्फ़ गन्स + लेज़र्स के मेडकिट ठीक करते हैं', 'ज़िंदा सभी दुश्मन मिनी-मैप पर (साथी हरे)', 'हर मोड में दुश्मनों के नाम और लाल हेल्थ बार', 'दोस्त: जिसने भी कभी खेला सब (और दिखाओ), खिलाड़ियों को अपनी गिल्ड में बुलाओ', 'स्मूद मेन्यू: विंडो खुली रहने पर पीछे का लाइव मैप रुक जाता है', 'दांव: $100 टेबल, और $0.10 से $10,000 तक अपना दांव लिखो', 'शेयर कार्ड पर तुम्हारा नाम दिखता है', 'नया क्या है: ये नोट हर अपडेट के बाद खुलते हैं (सेटिंग्स में भी)'],
      ar: ['الخزانة: المس عدّاءك لترى ما تملكه فقط، صفِّ ورتّب حسب الندرة، جرّب وجهّز (أزياء، أشكال أسلحة وأبراج)', 'الصحة لم تعد تعود وحدها أثناء المباراة: فقط حقائب الإسعاف في الأسلحة + الليزر تعالج', 'كل الأعداء الأحياء على الخريطة المصغرة (الحلفاء بالأخضر)', 'أسماء الأعداء وأشرطة صحة حمراء في كل الأوضاع', 'الأصدقاء: كل من لعب ولو مرة (عرض المزيد)، وادعُ لاعبين إلى نقابتك', 'قوائم أسلس: الخريطة الحية خلف النوافذ تتوقف أثناء فتحها', 'الرهانات: طاولة 100$ ورهانك الخاص من 0.10$ إلى 10,000$', 'بطاقات المشاركة تعرض اسمك', 'الجديد: تُفتح هذه الملاحظات بعد كل تحديث (وفي الإعدادات أيضاً)'],
    },
  },
  {
    id: '2026-10-02a',
    at: '2026-10-02T01:22:00+03:00',
    items: {
      en: ['Ranked battles: a season rating from Bronze to Neon Legend, a bonus spin, neon season titles with bonus XP, and a leaderboard', 'Battle pass: monthly seasons with armour sets, seasonal weapon and turret skins', '18 new cases and a CS-style opening reel; a full-screen show for every new rank', '7 new guns with magazines and automatic reload; red and green team colours', '7 new music tracks'],
      uk: ['Рейтингові бої: сезонний рейтинг від Бронзи до Неонової легенди, бонусна рулетка, неонові сезонні титули з бонусом XP і таблиця лідерів', 'Бойовий пропуск: щомісячні сезони з бронею, сезонними скінами зброї та турелей', '18 нових кейсів і прокрутка відкриття як у CS; повноекранне вітання з кожним новим рангом', '7 нових стволів із магазинами й автоматичною перезарядкою; червоні й зелені кольори команд', '7 нових музичних треків'],
      ru: ['Рейтинговые бои: сезонный рейтинг от Бронзы до Неоновой легенды, бонусная рулетка, неоновые сезонные титулы с бонусом XP и таблица лидеров', 'Боевой пропуск: ежемесячные сезоны с бронёй, сезонными скинами оружия и турелей', '18 новых кейсов и прокрутка открытия как в CS; полноэкранное поздравление с каждым новым рангом', '7 новых стволов с магазинами и автоматической перезарядкой; красные и зелёные цвета команд', '7 новых музыкальных треков'],
      es: ['Clasificatorias: rango de temporada de Bronce a Leyenda Neón, giro extra, títulos neón con XP extra y tabla de líderes', 'Pase de batalla: temporadas mensuales con armaduras y skins de arma y torreta', '18 cajas nuevas y ruleta de apertura estilo CS; pantalla completa con cada nuevo rango', '7 armas nuevas con cargadores y recarga automática; colores de equipo rojo y verde', '7 temas musicales nuevos'],
      fr: ['Classé : classement de saison de Bronze à Légende Néon, tirage bonus, titres néon avec XP bonus et classement', 'Passe de combat : saisons mensuelles avec armures, skins d’arme et de tourelle', '18 nouvelles caisses et une roulette d’ouverture façon CS ; un écran plein pour chaque nouveau grade', '7 nouvelles armes avec chargeurs et rechargement automatique ; couleurs d’équipe rouge et vert', '7 nouveaux morceaux'],
      pt: ['Ranqueadas: classificação da temporada do Bronze à Lenda Neon, giro bônus, títulos neon com XP extra e ranking', 'Passe de batalha: temporadas mensais com armaduras, skins de arma e torreta', '18 caixas novas e roleta de abertura estilo CS; tela cheia a cada nova patente', '7 armas novas com carregadores e recarga automática; cores de equipe vermelho e verde', '7 músicas novas'],
      tr: ['Dereceli: Bronzdan Neon Efsane’ye sezon puanı, bonus çark, XP bonuslu neon unvanlar ve lider tablosu', 'Savaş bileti: zırh setli, sezonluk silah ve taret görünümlü aylık sezonlar', '18 yeni kasa ve CS tarzı açılış çarkı; her yeni rütbe için tam ekran gösteri', 'Şarjörlü ve otomatik doldurmalı 7 yeni silah; kırmızı ve yeşil takım renkleri', '7 yeni müzik parçası'],
      zh: ['排位赛：从青铜到霓虹传奇的赛季积分、额外转盘、带经验加成的霓虹赛季称号与排行榜', '战斗通行证：每月赛季，含护甲套装、赛季武器与炮塔皮肤', '18 个新箱子与 CS 风格开箱转盘；每次升衔全屏庆祝', '7 把带弹匣和自动换弹的新枪；红绿队伍配色', '7 首新音乐'],
      hi: ['रैंक्ड: ब्रॉन्ज़ से नियॉन लीजेंड तक सीज़न रेटिंग, बोनस स्पिन, बोनस XP वाले नियॉन टाइटल और लीडरबोर्ड', 'बैटल पास: कवच सेट, सीज़नल हथियार और टर्रेट स्किन वाले मासिक सीज़न', '18 नए केस और CS जैसा ओपनिंग रील; हर नई रैंक पर फ़ुल-स्क्रीन जश्न', 'मैगज़ीन और ऑटो रीलोड वाली 7 नई बंदूकें; लाल और हरे टीम रंग', '7 नए म्यूज़िक ट्रैक'],
      ar: ['المصنّفة: تصنيف موسمي من البرونز إلى أسطورة النيون، دورة إضافية، ألقاب نيون بخبرة إضافية، وجدول متصدرين', 'تذكرة المعركة: مواسم شهرية بدروع وأشكال أسلحة وأبراج موسمية', '18 صندوقاً جديداً وعجلة فتح على طريقة CS؛ احتفال بملء الشاشة لكل رتبة جديدة', '7 أسلحة جديدة بمخازن وإعادة تلقيم تلقائية؛ ألوان فرق حمراء وخضراء', '7 مقطوعات موسيقية جديدة'],
    },
  },
];

export function createNews() {
  function render() {
    const lang = getLang();
    const fmt = (iso) => new Date(iso).toLocaleString(lang, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    $('news-body').innerHTML = NEWS.map((n, i) => `<article class="news-item${i === 0 ? ' latest' : ''}"><time datetime="${n.at}">${esc(fmt(n.at))}</time><ul>${(n.items[lang] ?? n.items.en).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></article>`).join('');
  }
  function open() {
    render();
    $('dlg-news').showModal();
    store.set(SEEN, NEWS[0].id);
  }
  // after an update: once, as the player comes in
  function maybeShow() {
    if (store.get(SEEN, null) !== NEWS[0].id) setTimeout(open, 500);
  }
  const markSeen = () => store.set(SEEN, NEWS[0].id);
  $('news-ok').addEventListener('click', () => $('dlg-news').close());
  return { open, maybeShow, markSeen };
}

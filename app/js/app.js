/* ЕГЭ Квест — ядро: состояние, награды, карта Королевства, профиль, движок уроков (башня, книга и мини-игры — в world.js) */
const App = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const coin = '<i class="coin"></i>';

  /* ===== Контент ===== */
  const TASKS = {
    1: 'Слово на месте пропуска', 2: 'Лексическое значение', 3: 'Стилистика текста', 4: 'Ударения', 5: 'Паронимы',
    6: 'Лексические нормы', 7: 'Морфологические нормы', 8: 'Синтаксические нормы', 9: 'Корни',
    10: 'Приставки', 11: 'Суффиксы', 12: 'Окончания глаголов', 13: 'НЕ с разными частями речи',
    14: 'Слитно / раздельно', 15: 'Н и НН', 16: 'Однородные члены и ССП', 17: 'Обособленные члены',
    18: 'Вводные слова', 19: 'СПП', 20: 'Разные виды связи', 21: 'Пунктуационный анализ',
    22: 'Смысл текста', 23: 'Типы речи', 24: 'Лексика текста', 25: 'Связь предложений',
    26: 'Средства выразительности', 27: 'Сочинение',
  };
  // Маршрут по главам; задания открываются строго по порядку, первым — №17
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  // Каждая глава — область Королевства Слова со своим боссом на последней станции
  const GROUPS = [
    { name: 'Пунктуация', region: 'Цитадель знаков', e: '⚔️', boss: 'Старый хранитель Цитадели', bossE: '🧙‍♂️', tasks: [17, 16, 18, 19, 20, 21], label: 'задания 16–21' },
    { name: 'Орфография', region: 'Лес потерянных букв', e: '🌲', boss: 'Тёмный переписчик', bossE: '🦇', tasks: range(9, 15), label: 'задания 9–15' },
    { name: 'Речевые нормы', region: 'Долина эха', e: '🏔️', boss: 'Эхо-искажатель', bossE: '👻', tasks: range(4, 8), label: 'задания 4–8' },
    { name: 'Текст', region: 'Библиотека тысячи страниц', e: '📚', boss: 'Смотритель смыслов', bossE: '🦉', tasks: [1, 2, 3, ...range(22, 26)], label: 'задания 1–3, 22–26' },
    { name: 'Сочинение', region: 'Замок Слова', e: '🏰', boss: 'Великий Экзаменатор', bossE: '🐉', tasks: [27], label: 'задание 27' },
  ];
  const ROUTE = GROUPS.flatMap((g) => g.tasks);
  const GROUP_STARTS = GROUPS.map((g) => ROUTE.indexOf(g.tasks[0]));
  const LESSONS = {};
  const CHESTS = [4, 9, 14, 19, 24]; // после какого по счёту пройденного задания открывается сундук

  const LEVEL_TITLES = ['Ученик мага', 'Подмастерье', 'Чародей запятых', 'Заклинатель слов', 'Хранитель рун', 'Маг орфографии', 'Архимаг пунктуации', 'Магистр слова', 'Верховный магистр', 'Легенда Королевства'];
  const GOOD = ['Огонь! 🔥', 'Чётко! 😎', 'Мозг на максималках 🧠', 'Вот это уровень!', 'Филолог от бога ✨', 'Красота! 💜', 'Ты в ударе! ⚡', 'В яблочко! 🎯', 'ЕГЭ уже нервничает 😏', 'Так держать! 🚀', 'Запятые тебя боятся 💪', 'Легенда! 👑', 'Это было чисто! 🧼', 'Изи! 😌'];
  const BAD = ['Почти! Посмотри ещё раз 👀', 'Ошибка — это тоже опыт 💡', 'Спокойно, разберёмся 🙌', 'Ещё попытка — и всё получится!', 'Мозг учится прямо сейчас 🧩', 'Не сдаёмся! 💜'];


  const ACH = [
    { id: 'first', e: '🌱', name: 'Первый шаг', d: 'Первая верная проверка' },
    { id: 'bases', e: '🧱', name: 'Основатель', d: 'Верно выделить грамматические основы' },
    { id: 'clean', e: '💎', name: 'Без единой ошибки', d: 'Пройти задание на 3 звезды' },
    { id: 't1', e: '🔑', name: 'Первый ключ', d: 'Пройти задание 1' },
    { id: 't17', e: '🗝️', name: 'Мастер обособления', d: 'Пройти задание 17' },
    { id: 'builder', e: '🕯️', name: 'Новосёл', d: 'Поставить первый предмет в башню' },
    { id: 'mayor', e: '🏰', name: 'Хозяин башни', d: 'Обустроить башню: 8 предметов' },
    { id: 'familiar', e: '🦉', name: 'Верный спутник', d: 'Завести фамильяра' },
    { id: 'secret', e: '🚪', name: 'Тайная дверь', d: 'Открыть секретную комнату' },
    { id: 'mission', e: '📜', name: 'Исполнитель', d: 'Выполнить ежедневную миссию' },
    { id: 'rich', e: '💎', name: 'Хранитель эссенции', d: 'Накопить 200 эссенции' },
    { id: 'lvl3', e: '⭐', name: 'Уровень 3', d: 'Достичь 3-го уровня' },
    { id: 'streak3', e: '🔥', name: 'Серия 3 дня', d: 'Заниматься 3 дня подряд' },
  ];
  const AVATARS = ['🦊', '🐱', '🐼', '🦄', '🐸', '🐯', '🐧', '🦉', '🐲', '🐙'];

  /* ===== Состояние ===== */
  const SAVE_KEY = 'egequest.v1';
  const fresh = () => ({
    name: '', avatar: '🦊', totalXp: 0, coins: 30, done: {}, chests: [],
    tower: { slots: {}, familiar: null, lastCollect: Date.now() }, daily: null, magister: null, game: {},
    ach: {}, streak: { count: 0, last: null },
    sound: true, stats: { correct: 0, wrong: 0 }, onboarded: false,
  });
  let S = load();
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const st = Object.assign(fresh(), JSON.parse(raw));
        // Город заменён башней: за построенные здания возвращаем эссенцию
        if (st.city) { st.coins += Object.keys(st.city.plots || {}).length * 50; delete st.city; }
        return st;
      }
    } catch (_) {}
    return fresh();
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (_) {} }

  function levelInfo(total = S.totalXp) {
    let lvl = 1, need = 100, acc = 0;
    while (total >= acc + need) { acc += need; lvl++; need = 100 + (lvl - 1) * 50; }
    return { lvl, into: total - acc, need, title: LEVEL_TITLES[Math.min(lvl - 1, LEVEL_TITLES.length - 1)] };
  }
  // Бонус к опыту даёт обстановка башни (считает world.js)
  let xpBonus = () => 0;
  // Простейшая шина событий: уроки сообщают о верных шагах, миссии их считают
  const listeners = {};
  const on = (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn);
  const emit = (ev, data) => (listeners[ev] || []).forEach((fn) => fn(data));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  function touchStreak() {
    const t = today();
    if (S.streak.last === t) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const ys = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
    S.streak.count = S.streak.last === ys ? S.streak.count + 1 : 1;
    S.streak.last = t;
    if (S.streak.count >= 3) unlock('streak3');
  }

  /* ===== Звук и эффекты ===== */
  let actx = null;
  function sound(kind) {
    if (!S.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const seq = { ok: [523, 659, 784], coin: [988, 1319], err: [196, 165], level: [523, 659, 784, 1047, 1319], tap: [660] }[kind] || [440];
      seq.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = kind === 'err' ? 'sawtooth' : 'triangle';
        o.frequency.value = f;
        const t0 = actx.currentTime + i * (kind === 'tap' ? 0 : 0.09);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(kind === 'tap' ? 0.05 : 0.18, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + (kind === 'tap' ? 0.06 : 0.22));
        o.connect(g).connect(actx.destination);
        o.start(t0); o.stop(t0 + 0.25);
      });
    } catch (_) {}
  }
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} };

  function confetti(n = 120) {
    const c = $('#confetti'), ctx = c.getContext('2d');
    c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const cols = ['#7c3aed', '#a78bfa', '#fbbf24', '#f59e0b', '#fde68a', '#c4b5fd'];
    const ps = Array.from({ length: n }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4,
      a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, c: pick(cols), s: Math.random() < 0.5,
    }));
    let f = 0;
    (function tick() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of ps) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
        if (p.s) ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); else { ctx.beginPath(); ctx.arc(0, 0, p.r / 2.4, 0, 7); ctx.fill(); }
        ctx.restore();
      }
      if (++f < 150) requestAnimationFrame(tick); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })();
  }

  function floatText(text, anchor) {
    const r = anchor ? anchor.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0 };
    const el = h(`<div class="floater">${text}</div>`);
    el.style.left = r.left + r.width / 2 + 'px';
    el.style.top = r.top + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  function toast(text, kind = '') {
    const el = h(`<div class="toast ${kind}">${text}</div>`);
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2300);
    setTimeout(() => el.remove(), 2800);
  }

  function modal(html, { onClose, cls = '' } = {}) {
    const m = h(`<div class="modal-bg"><div class="modal ${cls}">${html}</div></div>`);
    $('#modal-root').appendChild(m);
    const close = () => { m.classList.add('out'); setTimeout(() => m.remove(), 200); onClose && onClose(); };
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) close(); });
    return { el: m.firstElementChild, close };
  }

  /* Подтверждение в самом приложении (системные confirm() работают не везде) */
  function ask(text, okLabel, onOk) {
    const m = modal(`<div class="center"><p class="ask-text">${text}</p><button class="btn primary ask-ok">${okLabel}</button><button class="btn ghost" data-close>Отмена</button></div>`);
    m.el.querySelector('.ask-ok').addEventListener('click', () => { m.close(); onOk(); });
  }

  /* ===== Награды ===== */
  function reward(xp, coins, { anchor, phrase = true, quiet = false } = {}) {
    const before = levelInfo().lvl;
    const gx = Math.round(xp * (1 + xpBonus()));
    S.totalXp += gx;
    S.coins += coins;
    touchStreak();
    save();
    if (!quiet) {
      if (gx) floatText(`+${gx} XP`, anchor);
      if (coins) setTimeout(() => floatText(`+${coins} ${coin}`, anchor), 250);
      if (phrase && xp >= 10) toast(pick(GOOD), 'good');
      sound(coins ? 'coin' : 'ok');
    }
    topbar(true);
    if (S.coins >= 200) unlock('rich');
    const after = levelInfo().lvl;
    if (after > before) setTimeout(() => levelUp(after), 600);
    return gx;
  }

  function levelUp(lvl) {
    S.coins += 25;
    save();
    if (lvl >= 3) unlock('lvl3');
    sound('level'); confetti(160); buzz([30, 40, 60]);
    const li = levelInfo();
    modal(`<div class="lvlup"><div class="lvl-badge big">${lvl}</div><h2>Новый уровень!</h2><p>Теперь ты — <b>${li.title}</b></p><p class="muted">Бонус: +25 ${coin} и новые предметы для башни</p><button class="btn primary" data-close>Круто! 🎉</button></div>`);
    topbar(true);
  }

  function unlock(id) {
    if (S.ach[id]) return;
    S.ach[id] = Date.now();
    S.coins += 15;
    save();
    const a = ACH.find((x) => x.id === id);
    setTimeout(() => { toast(`${a.e} Достижение: <b>${a.name}</b> · +15 ${coin}`, 'achv'); sound('coin'); }, 900);
    topbar(true);
  }

  /* ===== Верхняя панель ===== */
  function topbar(pulse) {
    const li = levelInfo();
    $('.tb-avatar').textContent = S.avatar;
    $('.tb-level').textContent = li.lvl;
    $('.tb-title').textContent = li.title;
    $('.tb-xpbar i').style.width = Math.round((li.into / li.need) * 100) + '%';
    $('.tb-xptext').textContent = `${li.into} / ${li.need} XP`;
    $('.tb-coins b').textContent = S.coins;
    $('.tb-streak b').textContent = S.streak.count;
    if (pulse) { const c = $('.tb-coins'); c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse'); }
  }

  /* ===== Навигация ===== */
  let tab = 'tower';
  const VIEWS = {};
  function go(t) {
    tab = t;
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    const v = $('#view');
    v.innerHTML = '';
    v.scrollTop = 0;
    (VIEWS[t] || renderMap)(v);
  }

  /* ===== Путь к замку ===== */
  const doneCount = () => ROUTE.filter((n) => S.done[n]).length;

  function castleSvg(open) {
    return `<svg viewBox="0 0 220 180" class="castle-svg">
      <defs><linearGradient id="cw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#6d28d9"/></linearGradient></defs>
      <rect x="40" y="80" width="140" height="95" fill="url(#cw)"/>
      ${[40, 60, 80, 100, 120, 140, 160].map((x) => `<rect x="${x}" y="70" width="12" height="12" fill="#7c3aed"/>`).join('')}
      <rect x="20" y="50" width="44" height="125" fill="#7c3aed"/><rect x="156" y="50" width="44" height="125" fill="#7c3aed"/>
      <rect x="84" y="28" width="52" height="147" fill="#6d28d9"/>
      <polygon points="14,52 70,52 42,8" fill="#fbbf24"/><polygon points="150,52 206,52 178,8" fill="#fbbf24"/><polygon points="78,30 142,30 110,-14" fill="#f59e0b"/>
      <path d="M42 8 v-14 l16 6 -16 6z" fill="#fbbf24"/><path d="M178 8 v-14 l16 6 -16 6z" fill="#fbbf24"/>
      <rect x="34" y="80" width="14" height="20" rx="7" fill="#fde68a"/><rect x="172" y="80" width="14" height="20" rx="7" fill="#fde68a"/>
      <rect x="103" y="50" width="14" height="22" rx="7" fill="#fde68a"/>
      <path d="M90 175 v-38 a20 20 0 0 1 40 0 v38z" fill="${open ? '#fde68a' : '#3b0764'}"/>
      ${open ? '' : '<path d="M96 175 v-36 M104 175 v-40 M112 175 v-40 M120 175 v-38 M127 175 v-34" stroke="#6d28d9" stroke-width="2"/>'}
    </svg>`;
  }

  function renderMap(v) {
    const dc = doneCount();
    const head = h(`<div class="map-head card">
      <div><div class="eyebrow">Твой путь к 100 баллам</div><h2>Карта Королевства Слова</h2></div>
      <div class="prog-row"><div class="pbar"><i style="width:${(dc / 27) * 100}%"></i></div><b>${dc}/27</b></div>
      <div class="muted small">Пять областей, 26 заданий и сочинение в Замке Слова. В конце каждой области ждёт босс.</div>
      <div class="group-chips">${GROUPS.map((g, gi) => { const n = g.tasks.filter((t) => S.done[t]).length; return `<span class="gchip ${n === g.tasks.length ? 'full' : ''}">${g.e} ${g.region} <b>${n}/${g.tasks.length}</b></span>`; }).join('')}</div>
    </div>`);
    v.appendChild(head);
    const wrap = h('<div class="map"></div>');
    v.appendChild(wrap);
    const W = Math.min((v.clientWidth || 360) - 28, 520);
    wrap.style.width = W + 'px';
    // Перед каждой главой — дополнительный отступ под указатель
    const step = 136, gapG = 120, top = 300, bottom = 250;
    const off = [0];
    for (let i = 1; i < ROUTE.length; i++) off[i] = off[i - 1] + step + (GROUP_STARTS.includes(i) ? gapG : 0);
    const H = top + off[ROUTE.length - 1] + bottom;
    const pts = ROUTE.map((_, i) => ({ x: W / 2 + Math.sin(i * 0.85) * W * 0.27, y: H - bottom - off[i] }));
    pts[ROUTE.length - 1] = { x: W / 2, y: top - 10 };
    const p = [pts[0], ...pts, pts[pts.length - 1]];
    let d = `M${pts[0].x},${pts[0].y + 240}L${pts[0].x},${pts[0].y}`;
    const prefix = [d];
    for (let i = 1; i < p.length - 2; i++) {
      const c1x = p[i].x + (p[i + 1].x - p[i - 1].x) / 6, c1y = p[i].y + (p[i + 1].y - p[i - 1].y) / 6;
      const c2x = p[i + 1].x - (p[i + 2].x - p[i].x) / 6, c2y = p[i + 1].y - (p[i + 2].y - p[i].y) / 6;
      d += `C${c1x},${c1y} ${c2x},${c2y} ${p[i + 1].x},${p[i + 1].y}`;
      prefix.push(d);
    }
    // доля пройденной дороги
    // Персонаж стоит на первом непройденном задании пути
    const curIdx = ROUTE.findIndex((n) => !S.done[n]);
    // Дорога закрашивается до самого дальнего пройденного задания
    const lastDone = ROUTE.reduce((acc, n, i) => (S.done[n] ? i : acc), -1);
    wrap.style.height = H + 'px';
    wrap.innerHTML = `<svg class="road" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <path d="${d}" class="road-edge"/><path d="${d}" class="road-body"/>
        <path d="${d}" class="road-done" id="roadDone"/><path d="${d}" class="road-line"/>
      </svg>
      <div class="castle ${dc >= 26 ? 'open' : ''}" style="left:${W / 2}px;top:${top - 290}px">${castleSvg(dc >= 27)}<div class="castle-label">Замок Слова</div></div>
      <div class="start-sign" style="left:${pts[0].x}px;top:${pts[0].y + 222}px">СТАРТ</div>`;
    // пройденная часть дороги
    const done = wrap.querySelector('#roadDone');
    try {
      const len = done.getTotalLength();
      const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tmp.setAttribute('d', prefix[curIdx < 0 ? prefix.length - 1 : Math.max(0, lastDone)]);
      done.parentNode.appendChild(tmp);
      const reach = tmp.getTotalLength();
      tmp.remove();
      done.style.strokeDasharray = `${len}`;
      done.style.strokeDashoffset = `${len}`;
      done.getBoundingClientRect();
      requestAnimationFrame(() => { done.style.strokeDashoffset = `${Math.max(0, len - reach)}`; });
    } catch (_) {}
    // главы: подложка участка дороги и указатель в начале главы
    GROUPS.forEach((g, gi) => {
      const s = GROUP_STARTS[gi];
      const yStart = pts[s].y + (step + gapG) / 2;
      const yEnd = gi + 1 < GROUPS.length ? pts[GROUP_STARTS[gi + 1]].y + (step + gapG) / 2 : 0;
      const n = g.tasks.filter((t) => S.done[t]).length;
      const reached = curIdx < 0 || s <= curIdx;
      const full = n === g.tasks.length;
      if (gi < GROUPS.length - 1) wrap.prepend(h(`<div class="zone z${gi % 2}" style="top:${yEnd}px;height:${yStart - yEnd}px"></div>`));
      wrap.appendChild(h(`<div class="gsign ${reached ? 'reached' : 'locked'} ${full ? 'full' : ''}" style="top:${yStart}px">
          <span class="gs-e">${full ? '✅' : reached ? g.e : '🔒'}</span>
          <span class="gs-t"><small>${g.name} · ${g.label}</small><b>${g.region}</b></span>
          <span class="gs-n">${n}/${g.tasks.length}</span>
        </div>`));
    });
    // декор
    const deco = ['🌲', '🌳', '🌼', '🍄', '🌲', '🪨', '🌷', '🌳', '🦋', '🌲'];
    pts.forEach((pt, i) => {
      if (i === ROUTE.length - 1) return;
      const side = Math.sin(i * 0.85) > 0 ? -1 : 1;
      const x = pt.x + side * (W * 0.3) + ((i * 37) % 20) - 10;
      wrap.appendChild(h(`<div class="deco" style="left:${Math.max(16, Math.min(W - 16, x))}px;top:${pt.y - 20 + ((i * 13) % 30)}px">${deco[i % deco.length]}</div>`));
    });
    ['☁️', '☁️'].forEach((c, i) => wrap.appendChild(h(`<div class="deco cloud" style="left:${i ? W - 50 : 40}px;top:${20 + i * 60}px">${c}</div>`)));
    // станции
    ROUTE.forEach((n, i) => {
      const pt = pts[i];
      const isDone = !!S.done[n];
      const open = curIdx < 0 || i <= curIdx;
      const ready = open && !!LESSONS[n];
      const isCur = i === curIdx;
      const isCastle = n === 27;
      const g = GROUPS.find((x) => x.tasks.includes(n));
      const isBoss = g.tasks[g.tasks.length - 1] === n;
      const cls = ['station', isDone ? 'done' : '', isCur ? 'cur' : '', ready ? 'ready' : 'soon', isCastle ? 'essay' : '', isBoss ? 'boss' : ''].join(' ');
      const stars = isDone ? '★'.repeat(S.done[n].stars) + '☆'.repeat(3 - S.done[n].stars) : '';
      const st = h(`<button class="${cls}" style="left:${pt.x}px;top:${pt.y}px" data-n="${n}">
          <span class="st-num">${isCastle ? '✍️' : n}</span>
          ${!ready && !isDone ? '<span class="st-lock">🔒</span>' : ''}
          ${isCur ? `<span class="st-avatar">${S.avatar}</span>` : ''}
          ${isBoss && !isDone ? `<span class="st-boss" title="${g.boss}">${g.bossE}</span>` : ''}
          <span class="st-label">${isBoss ? '👹 ' : ''}${isCastle ? '27 · ' : ''}${TASKS[n]}${stars ? `<em>${stars}</em>` : ''}</span>
        </button>`);
      st.addEventListener('click', () => openStation(n));
      wrap.appendChild(st);
    });
    // сундуки
    CHESTS.forEach((ci) => {
      const a = pts[ci], b = pts[ci + 1];
      const opened = S.chests.includes(ci);
      const avail = dc > ci;
      const ch = h(`<button class="chest ${opened ? 'opened' : ''} ${avail && !opened ? 'avail' : ''}" style="left:${(a.x + b.x) / 2 > W / 2 ? W * 0.16 : W * 0.84}px;top:${(a.y + b.y) / 2}px">${opened ? '📭' : '🎁'}</button>`);
      ch.addEventListener('click', () => {
        if (opened) return toast('Этот сундук уже открыт');
        if (!avail) return toast(`🎁 Сундук откроется после ${ci + 1}-го пройденного задания`);
        S.chests.push(ci); save();
        reward(30, 50, { anchor: ch });
        confetti(90);
        go('map');
      });
      wrap.appendChild(ch);
    });
    // прокрутка к текущей станции
    requestAnimationFrame(() => {
      // Карта открывается на текущей станции; в самом начале видно СТАРТ → 1
      const cur = curIdx >= 0 ? wrap.querySelectorAll('.station')[curIdx] : null;
      v.scrollTop = curIdx <= 0 ? v.scrollHeight : Math.max(0, cur.offsetTop + wrap.offsetTop - v.clientHeight / 2);
    });
  }

  function openStation(n) {
    sound('tap');
    // Задания открываются строго по порядку пути
    const i = ROUTE.indexOf(n), curIdx = ROUTE.findIndex((x) => !S.done[x]);
    const open = S.done[n] || curIdx < 0 || i <= curIdx;
    if (open && LESSONS[n]) return openLesson(n);
    if (!open) return modal(`<div class="center"><div class="big-emoji">🔒</div><h2>Задание ${n}. ${TASKS[n]}</h2><p>Станции открываются по порядку. Сначала пройди задание <b>№${ROUTE[curIdx]}</b> — и дорога поведёт дальше.</p><button class="btn primary" data-close>Понятно</button></div>`);
    if (n === 27) return modal(`<div class="center"><div class="big-emoji">🐉</div><h2>Великий Экзаменатор</h2><p>Финальный босс ждёт в Замке Слова. Ворота откроются, когда ты соберёшь ключи от всех 26 заданий.</p><p class="muted">Ключей: ${doneCount()} / 26 🗝️</p><button class="btn primary" data-close>Вперёд!</button></div>`);
    modal(`<div class="center"><div class="big-emoji">🔒</div><h2>Задание ${n}. ${TASKS[n]}</h2><p>Ты дошёл до этой станции! 🎉 Урок по ней уже в разработке и скоро появится здесь.</p><button class="btn primary" data-close>Понятно</button></div>`);
  }

  /* ===== Профиль ===== */
  function renderProfile(v) {
    const li = levelInfo();
    v.appendChild(h(`<div class="card profile">
      <button class="pf-avatar">${S.avatar}</button>
      <input class="pf-name" placeholder="Твоё имя" value="${(S.name || '').replace(/"/g, '&quot;')}" maxlength="20">
      <div class="pf-level"><span class="lvl-badge">${li.lvl}</span> ${li.title}</div>
      <div class="city-stats">
        <div><b>${S.totalXp}</b><span>XP всего</span></div>
        <div><b>${doneCount()}</b><span>заданий</span></div>
        <div><b>${S.stats.correct}</b><span>верных проверок</span></div>
        <div><b>${S.streak.count}🔥</b><span>дней подряд</span></div>
      </div>
    </div>`));
    $('.pf-name', v).addEventListener('change', (e) => { S.name = e.target.value.trim(); save(); });
    $('.pf-avatar', v).addEventListener('click', () => pickAvatar(() => go('profile')));
    v.appendChild(h(`<div class="card"><h3>Достижения</h3><div class="ach-grid">${ACH.map((a) => `<div class="ach ${S.ach[a.id] ? 'got' : ''}"><span>${a.e}</span><b>${a.name}</b><small>${a.d}</small></div>`).join('')}</div></div>`));
    const inst = h(`<div class="card install"><h3>📲 Установить на телефон</h3>
      <div class="inst-btn"></div>
      <details ${isIOS() ? 'open' : ''}><summary><b>iPhone / iPad</b> (без App Store)</summary><ol>
        <li>Открой эту страницу в <b>Safari</b>.</li><li>Нажми <b>«Поделиться»</b> <span class="ios-share">⬆︎</span> внизу экрана.</li>
        <li>Выбери <b>«На экран „Домой“»</b> → <b>«Добавить»</b>.</li><li>Запускай «ЕГЭ Квест» с иконки — как обычное приложение, работает и без интернета.</li></ol></details>
      <details ${isIOS() ? '' : 'open'}><summary><b>Android</b></summary><ol>
        <li>Открой страницу в <b>Chrome</b>.</li><li>Нажми кнопку «Установить» выше или меню <b>⋮</b> → <b>«Установить приложение»</b> / «Добавить на главный экран».</li></ol></details>
    </div>`);
    v.appendChild(inst);
    if (deferredPrompt) {
      const b = h('<button class="btn gold">Установить приложение</button>');
      b.addEventListener('click', async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; b.remove(); });
      $('.inst-btn', inst).appendChild(b);
    } else if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
      $('.inst-btn', inst).innerHTML = '<p class="ok-text">✅ Приложение уже установлено</p>';
    }
    const set = h(`<div class="card"><h3>Настройки</h3>
      <label class="switch-row"><span>Звуки</span><input type="checkbox" ${S.sound ? 'checked' : ''}></label>
      <button class="btn ghost danger reset">Сбросить прогресс</button></div>`);
    if (VIEWS.magisterCard) VIEWS.magisterCard(v);
    $('input', set).addEventListener('change', (e) => { S.sound = e.target.checked; save(); });
    $('.reset', set).addEventListener('click', () => {
      ask('Точно сбросить весь прогресс, эссенцию и башню?', 'Сбросить', () => { S = fresh(); save(); topbar(); onboarding(); go('tower'); });
    });
    v.appendChild(set);
  }

  // Образы магов — эксклюзив MAGISTER
  const MAG_AVATARS = ['🧙', '🧝', '🧚', '🧛', '🧜', '🦹'];
  function pickAvatar(cb) {
    const mag = !!(S.magister && S.magister.active);
    const m = modal(`<h2>Выбери персонажа</h2><div class="av-grid">${AVATARS.map((a) => `<button data-a="${a}" class="${a === S.avatar ? 'on' : ''}">${a}</button>`).join('')}</div>
      <h3>Образы магов <span class="mag-badge">MAGISTER</span></h3><div class="av-grid">${MAG_AVATARS.map((a) => `<button data-a="${a}" data-mag="1" class="${a === S.avatar ? 'on' : ''} ${mag ? '' : 'mag-lock'}">${a}</button>`).join('')}</div>`);
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.mag && !mag) { m.close(); App.openMagister && App.openMagister(); return; }
      S.avatar = b.dataset.a; save(); topbar(); m.close(); cb && cb();
    });
  }

  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function onboarding() {
    if (S.onboarded) return;
    const m = modal(`<div class="center onb">
      <div class="big-emoji">🧙</div>
      <h2>Добро пожаловать в Королевство Слова!</h2>
      <p>Тёмная магия спутала знаки и буквы. Пройди пять областей и победи их боссов. За каждый верный шаг получай <b>опыт</b> и <b>эссенцию</b>, а на эссенцию обустраивай свою <b>башню мага</b>.</p>
      <input class="pf-name" placeholder="Как тебя зовут?" maxlength="20">
      <div class="av-grid small">${AVATARS.map((a, i) => `<button data-a="${a}" class="${i === 0 ? 'on' : ''}">${a}</button>`).join('')}</div>
      <button class="btn primary go">Начать путь 🚀</button>
    </div>`);
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b) { m.el.querySelectorAll('[data-a]').forEach((x) => x.classList.toggle('on', x === b)); S.avatar = b.dataset.a; }
      if (e.target.closest('.go')) {
        S.name = m.el.querySelector('.pf-name').value.trim();
        S.onboarded = true; save(); m.close(); topbar();
        toast(`Стартовый бонус: 30 ${coin} эссенции`, 'good'); go('tower');
      }
    });
  }

  /* ===== Движок уроков ===== */
  function openLesson(n) {
    const L = LESSONS[n];
    const root = $('#lesson');
    root.innerHTML = `<div class="l-head">
        <button class="l-close" aria-label="Закрыть">✕</button>
        <div class="l-prog"><i></i></div>
        <button class="l-algo" title="Алгоритм">📜</button>
        <span class="l-combo"></span>
      </div>
      <div class="l-body"></div>
      <div class="l-foot"><div class="l-feedback"></div><div class="l-btns"><button class="btn ghost l-extra hidden"></button><button class="btn primary l-main">Дальше</button></div></div>`;
    root.classList.remove('hidden');
    document.body.classList.add('in-lesson');
    const body = $('.l-body', root), prog = $('.l-prog i', root), fb = $('.l-feedback', root);
    const main = $('.l-main', root), extra = $('.l-extra', root), combo = $('.l-combo', root);
    const ctx = { errors: 0, xp: 0, coins: 0, combo: 0, data: {} };
    let idx = 0;

    const api = {
      ctx, S,
      next: () => show(idx + 1),
      foot({ label = 'Дальше', enabled = true, onClick = api.next, extraLabel = null, onExtra = null } = {}) {
        main.textContent = label;
        main.disabled = !enabled;
        main.onclick = () => { sound('tap'); onClick(); };
        if (extraLabel) { extra.textContent = extraLabel; extra.classList.remove('hidden'); extra.onclick = onExtra; }
        else extra.classList.add('hidden');
      },
      feedback(kind, html) {
        fb.className = 'l-feedback ' + (kind || '');
        fb.innerHTML = html || '';
        root.classList.toggle('fb-open', !!kind);
      },
      good(xp, coins, anchor, text) {
        ctx.combo++;
        const mult = ctx.combo >= 3 ? 2 : 1;
        const gx = reward(xp * mult, coins, { anchor: anchor || main, phrase: false });
        ctx.xp += gx; ctx.coins += coins;
        S.stats.correct++; save();
        emit('step');
        if (!S.ach.first) unlock('first');
        combo.textContent = ctx.combo >= 2 ? `🔥 x${ctx.combo}` : '';
        combo.classList.toggle('hot', ctx.combo >= 3);
        buzz(15);
        api.feedback('ok', `<b>${pick(GOOD)}</b> <span class="fb-rew">+${gx} XP${coins ? ` · +${coins} ${coin}` : ''}${mult > 1 ? ' · комбо x2!' : ''}</span>${text ? `<div>${text}</div>` : ''}`);
      },
      bad(msgs) {
        ctx.combo = 0; ctx.errors++;
        combo.textContent = ''; combo.classList.remove('hot');
        S.stats.wrong++; save();
        const gx = reward(2, 0, { quiet: true });
        ctx.xp += gx;
        sound('err'); buzz([20, 40, 20]);
        root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake');
        api.feedback('bad', `<b>${pick(BAD)}</b> <span class="fb-rew">+2 XP за попытку</span>${(msgs || []).map((m) => `<div>• ${m}</div>`).join('')}`);
      },
      spendHint(cost, text) {
        if (S.coins < cost) { toast(`Нужно ${cost} ${coin} эссенции для подсказки`, 'bad'); return false; }
        S.coins -= cost; save(); topbar(true);
        modal(`<div class="center"><div class="big-emoji">💡</div><p>${text}</p><button class="btn primary" data-close>Понял(а)</button></div>`);
        return true;
      },
      openAlgo,
      toast, confetti, sound, modal, reward, unlock,
      finish(stars) {
        const first = !S.done[n];
        const prev = S.done[n] || { stars: 0, times: 0 };
        S.done[n] = { stars: Math.max(prev.stars, stars), times: prev.times + 1 };
        save();
        const bx = first ? 60 : 20, bc = first ? 40 : 10;
        const gx = reward(bx, bc, { quiet: true });
        ctx.xp += gx; ctx.coins += bc;
        if (n === 1) unlock('t1');
        if (n === 17) unlock('t17');
        if (stars === 3) unlock('clean');
        emit('lesson', n);
        return { first, bonusXp: gx, bonusCoins: bc };
      },
      close,
    };

    function show(i) {
      idx = i;
      if (i >= L.slides.length) return close();
      body.innerHTML = '';
      body.scrollTop = 0;
      api.feedback(null);
      api.foot();
      prog.style.width = Math.round((i / (L.slides.length - 1)) * 100) + '%';
      L.slides[i](body, api);
    }
    function close() {
      root.classList.add('hidden');
      root.innerHTML = '';
      document.body.classList.remove('in-lesson');
      go(tab);
    }
    $('.l-close', root).onclick = () => {
      if (idx === 0 || idx >= L.slides.length - 1) close();
      else ask('Выйти из задания? Прогресс урока не сохранится.', 'Выйти', close);
    };
    $('.l-algo', root).onclick = () => openAlgo(L.algoImg);
    show(0);
  }

  function openAlgo(src) {
    // src — картинка-схема или готовая HTML-схема алгоритма
    const inner = src.trim().startsWith('<') ? `<div class="algo-html">${src}</div>` : `<img src="${src}" alt="Алгоритм выполнения задания">`;
    modal(`<div class="algo-full">${inner}</div><button class="btn primary" data-close>Закрыть</button>`, { cls: 'wide' });
  }

  /* ===== PWA ===== */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });

  function start() {
    VIEWS.map = renderMap;
    VIEWS.profile = renderProfile;
    document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => { sound('tap'); go(b.dataset.tab); }));
    $('.tb-coins').addEventListener('click', () => go('tower'));
    $('.tb-avatar').addEventListener('click', () => go('profile'));
    topbar();
    go('tower');
    onboarding();
    let rt;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (tab === 'map' && $('#lesson').classList.contains('hidden')) go('map'); }, 250); });
    try { if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (_) {}
  }

  // Внутреннее API для world.js
  const core = {
    get S() { return S; }, save, reward, modal, toast, ask, topbar, levelInfo, go, unlock, sound, buzz, confetti, floatText,
    on, emit, openLesson, openStation, GROUPS, ROUTE, TASKS, LESSONS, GOOD, BAD, pick,
    setXpBonus: (fn) => { xpBonus = fn; },
    get tab() { return tab; },
  };
  return { start, LESSONS, TASKS, coin, h, $, pick, openAlgo, confetti, VIEWS, core };
})();

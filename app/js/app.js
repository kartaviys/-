/* ЕГЭ Квест — ядро: состояние, награды, путь к замку, город, профиль, движок уроков */
const App = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const coin = '<i class="coin"></i>';

  /* ===== Контент ===== */
  const TASKS = {
    1: 'Слово на месте пропуска', 2: 'Лексическое значение', 3: 'Стилистика текста', 4: 'Ударения', 5: 'Паронимы',
    6: 'Лексические нормы', 7: 'Морфологические нормы', 8: 'Синтаксические нормы', 9: 'Корни',
    10: 'Приставки', 11: 'Суффиксы', 12: 'Окончания глаголов и суффиксы причастий и деепричастий', 13: 'НЕ с разными частями речи',
    14: 'Слитное / раздельное / через дефис', 15: 'Н и НН', 16: 'Однородные члены и ССП', 17: 'Обособленные члены',
    18: 'Вводные конструкции, обращения и междометия', 19: 'СПП', 20: 'Сложное предложение с разными видами связи', 21: 'Пунктуационный анализ',
    22: 'Средства выразительности', 23: 'Смысл текста', 24: 'Типы речи', 25: 'Лексика и фразеология',
    26: 'Средства связи предложений', 27: 'Сочинение', 100: 'Зачёт по пунктуации', 101: 'Зачёт по орфографии',
    102: 'Зачёт по речевым нормам', 103: 'Зачёт по тексту',
  };
  // Маршрут по главам; задания открываются строго по порядку, первым — №17
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const GROUPS = [
    { name: 'Лес пунктуации', scenery: 'forest', short: 'Пунктуация', e: '🌲', tasks: [17, 16, 18, 19, 20, 21, 100], label: 'задания 16–21 + зачёт' },
    { name: 'Орфографические холмы', scenery: 'hills', short: 'Орфография', e: '⛰️', tasks: [...range(9, 15), 101], label: 'задания 9–15' },
    { name: 'Озеро языковых норм', scenery: 'lake', short: 'Речевые нормы', e: '🏞️', tasks: [...range(4, 8), 102], label: 'задания 4–8' },
    { name: 'Текстовые горы', scenery: 'mountains', short: 'Текст', e: '🏔️', tasks: [1, 2, 3, ...range(22, 26), 103], label: 'задания 1–3, 22–26' },
    { name: 'Сочинение', short: 'Сочинение', e: '✍️', tasks: [27], label: 'задание 27' },
  ];
  const ROUTE = GROUPS.flatMap((g) => g.tasks);
  // заданий ЕГЭ на пути — 27 (зачёт в счёт не идёт)
  const isExamTask = (n) => n >= 1 && n <= 27;
  const EGE = ROUTE.filter(isExamTask);
  // первичные баллы за задания и шкала перевода в тестовые баллы
  const PTS = Object.fromEntries(range(1, 27).map((n) => [n, n === 8 || n === 22 ? 2 : n === 27 ? 22 : 1]));
  const SCALE = [0, 3, 5, 8, 10, 12, 15, 17, 20, 22, 24, 27, 29, 32, 34, 36, 37, 39, 40, 42, 43, 45, 46, 48, 49, 51, 52, 54, 55, 57, 58, 60, 61, 63, 64, 66, 67, 69, 70, 72, 73, 75, 78, 81, 83, 86, 89, 91, 94, 97, 100];
  const GROUP_STARTS = GROUPS.map((g) => ROUTE.indexOf(g.tasks[0]));
  const LESSONS = {};
  const CHESTS = [4, 9, 14, 19, 24]; // после какого по счёту пройденного задания открывается сундук

  const LEVEL_TITLES = ['Новичок', 'Ученик писаря', 'Грамотей', 'Знаток запятых', 'Охотник за оборотами', 'Мастер слова', 'Хранитель правил', 'Магистр пунктуации', 'Архитектор текста', 'Король ЕГЭ'];
  const GOOD = ['Огонь! 🔥', 'Чётко! 😎', 'Мозг на максималках 🧠', 'Вот это уровень!', 'Филолог от бога ✨', 'Красота! 💜', 'Ты в ударе! ⚡', 'В яблочко! 🎯', 'ЕГЭ уже нервничает 😏', 'Так держать! 🚀', 'Запятые тебя боятся 💪', 'Легенда! 👑', 'Это было чисто! 🧼', 'Изи! 😌'];
  const BAD = ['Почти! Посмотри ещё раз 👀', 'Ошибка — это тоже опыт 💡', 'Спокойно, разберёмся 🙌', 'Ещё попытка — и всё получится!', 'Мозг учится прямо сейчас 🧩', 'Не сдаёмся! 💜'];


  const ACH = [
    { id: 'streak3', e: '🔥', name: 'Серия 3 дня', d: 'Заниматься 3 дня подряд' },
    { id: 'streak7', e: '📅', name: 'Неделя без пропусков', d: 'Заниматься 7 дней подряд' },
    { id: 'streak14', e: '🗓️', name: 'Две недели', d: 'Заниматься 14 дней подряд' },
    { id: 'streak30', e: '🏅', name: 'Месяц силы воли', d: 'Заниматься 30 дней подряд' },
    { id: 'run5', e: '⚡', name: 'Разгон', d: '5 верных ответов подряд' },
    { id: 'run10', e: '🎯', name: 'Снайпер', d: '10 верных ответов подряд' },
    { id: 'run25', e: '🧠', name: 'Без промаха', d: '25 верных ответов подряд' },
    { id: 'ok50', e: '✅', name: '50 верных', d: 'Всего 50 верных ответов' },
    { id: 'ok200', e: '💯', name: '200 верных', d: 'Всего 200 верных ответов' },
    { id: 'ok500', e: '👑', name: '500 верных', d: 'Всего 500 верных ответов' },
    { id: 'clean', e: '💎', name: 'Без единой ошибки', d: 'Пройти задание на 3 звезды' },
    { id: 'game', e: '🎲', name: 'Игрок', d: 'Сыграть в мини-игру' },
  ];

  /* ===== Состояние ===== */
  const SAVE_KEY = 'egequest.v1';
  const fresh = () => ({
    name: '', avatar: '🦊', totalXp: 0, coins: 30, done: {}, chests: [], prog: {},
    city: { plots: {}, lastCollect: Date.now() }, ach: {}, streak: { count: 0, last: null },
    practice16V2: true, sound: false, stats: { correct: 0, wrong: 0 }, run: 0, blocks: 0, lastAd: 0, onboarded: false, toured: false,
  });
  let S = load();
  function load() {
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) {
      const previous = JSON.parse(raw);
      const saved = Object.assign(fresh(), previous);
      if (!previous.practice16V2) {
        // В прежней версии памятка была после разбора, а тренировка начиналась сразу.
        const i = saved.prog[16];
        if (i >= 14) saved.prog[16] = i + 1;
        else if (i === 12 || i === 13) saved.prog[16] = 25 - i;
      }
      return saved;
    } } catch (_) {}
    return fresh();
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (_) {} }

  function levelInfo() {
    const lvl = 1 + doneCount();
    return { lvl, title: LEVEL_TITLES[Math.min(lvl - 1, LEVEL_TITLES.length - 1)] };
  }
  const xpBonus = () => 0;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  function touchStreak() {
    const t = today();
    if (S.streak.last === t) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const ys = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
    S.streak.count = S.streak.last === ys ? S.streak.count + 1 : 1;
    S.streak.last = t;
    [3, 7, 14, 30].forEach((k) => { if (S.streak.count >= k) unlock('streak' + k); });
  }

  /* ===== Звук и эффекты ===== */
  // звуки отключены
  function sound() {}
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
    // в уроке — только последнее сообщение, чтобы не закрывать задание
    if (document.body.classList.contains('in-lesson')) $('#toasts').innerHTML = '';
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2300);
    setTimeout(() => el.remove(), 2800);
  }

  function modal(html, { onClose, cls = '', sticky = false } = {}) {
    const m = h(`<div class="modal-bg"><div class="modal ${cls}">${html}</div></div>`);
    $('#modal-root').appendChild(m);
    const close = () => { m.classList.add('out'); setTimeout(() => m.remove(), 200); onClose && onClose(); };
    m.addEventListener('click', (e) => { if ((e.target === m && !sticky) || e.target.closest('[data-close]')) close(); });
    return { el: m.firstElementChild, close };
  }

  /* Подтверждение в самом приложении (системные confirm() работают не везде) */
  function ask(text, okLabel, onOk) {
    const m = modal(`<div class="center"><p class="ask-text">${text}</p><button class="btn primary ask-ok">${okLabel}</button><button class="btn ghost" data-close>Отмена</button></div>`);
    m.el.querySelector('.ask-ok').addEventListener('click', () => { m.close(); onOk(); });
  }

  /* Очки опыта улетают «в копилку»: искры летят от места ответа к счётчику опыта */
  function flyXP(from, amount, to, onArrive) {
    if (!from || !to) { onArrive && onArrive(); return; }
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const n = Math.max(3, Math.min(9, Math.ceil(amount / 4)));
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    let arrived = 0;
    for (let i = 0; i < n; i++) {
      const el = h(`<div class="xp-spark">${i === 0 ? `+${amount}` : '✦'}</div>`);
      document.body.appendChild(el);
      const dx = (Math.random() - 0.5) * 120, dy = -40 - Math.random() * 80;
      const anim = el.animate([
        { transform: `translate(${x0}px,${y0}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${x0 + dx}px,${y0 + dy}px) scale(1.15)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${x1}px,${y1}px) scale(.5)`, opacity: 0.9 },
      ], { duration: 900 + i * 70, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
      anim.onfinish = () => {
        el.remove();
        if (++arrived === 1) { to.classList.remove('bump'); void to.offsetWidth; to.classList.add('bump'); sound('coin'); onArrive && onArrive(); }
      };
    }
  }

  /* ===== Награды ===== */
  function reward(xp, coins, { anchor, phrase = true, quiet = false } = {}) {
    const gx = Math.round(xp * (1 + xpBonus()));
    S.totalXp += gx;
    touchStreak();
    save();
    if (!quiet) {
      if (gx) floatText(`+${gx} XP`, anchor);
      if (phrase && xp >= 10) toast(pick(GOOD), 'good');
      sound('ok');
    }
    topbar(true);
    return gx;
  }

  let pendingLevel = 0, pendingToasts = [];
  function levelUp(lvl) {
    sound('level'); confetti(160); buzz([30, 40, 60]);
    const li = levelInfo();
    modal(`<div class="lvlup"><div class="lvl-badge big">${lvl}</div><h2>Новый уровень!</h2><p>Теперь ты — <b>${li.title}</b></p><p class="muted">Так держать — впереди новые задания!</p><button class="btn primary" data-close>Круто! 🎉</button></div>`);
    topbar(true);
  }

  function unlock(id) {
    if (S.ach[id]) return;
    S.ach[id] = Date.now();
    S.totalXp += 10;
    save();
    const a = ACH.find((x) => x.id === id);
    const msg = `${a.e} Достижение: <b>${a.name}</b> · +10 XP`;
    // во время урока не перекрываем задание — покажем после
    if (document.body.classList.contains('in-lesson')) pendingToasts.push(msg);
    else setTimeout(() => { toast(msg, 'achv'); sound('coin'); }, 900);
    topbar();
  }

  /* ===== Верхняя панель ===== */
  function topbar(pulse) {
    const li = levelInfo();
    $('.tb-avatar').textContent = ((S.name || '').trim()[0] || '?').toUpperCase();
    $('.tb-level').textContent = li.lvl;
    $('.tb-title').textContent = li.title;
    $('.tb-xpbar i').style.width = Math.round(doneCount() / EGE.length * 100) + '%';
    $('.tb-xptext').textContent = `${S.totalXp} XP`;
    $('.tb-streak b').textContent = S.streak.count;
  }

  /* ===== Навигация ===== */
  let tab = 'map';
  function go(t) {
    tab = t;
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    const v = $('#view');
    v.innerHTML = '';
    v.scrollTop = 0;
    ({ map: renderMap, games: (x) => App.renderGames(x), profile: renderProfile })[t](v);
  }

  /* ===== Путь к замку ===== */
  const doneCount = () => EGE.filter((n) => S.done[n]).length;
  const primary = () => EGE.reduce((a, n) => a + (S.done[n] ? PTS[n] : 0), 0);

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
      <div><div class="eyebrow">Твой путь к 100 баллам</div><h2>Дорога к Замку Грамотности</h2></div>
      <div class="prog-row"><div class="pbar"><i style="width:${(dc / EGE.length) * 100}%"></i></div><b>${dc}/${EGE.length}</b></div>
      <div class="muted small">Каждое задание — ключ 🗝️ от ворот замка.</div>
      <div class="group-chips">${GROUPS.map((g, gi) => { const tasks = g.tasks.filter(isExamTask); const n = tasks.filter((t) => S.done[t]).length; return `<span class="gchip ${n === tasks.length ? 'full' : ''}">${gi + 1}. ${g.short} <b>${n}/${tasks.length}</b></span>`; }).join('')}</div>
    </div>`);
    v.appendChild(head);
    v.appendChild(pointsCard());
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
      <div class="castle ${dc >= 26 ? 'open' : ''}" style="left:${W / 2}px;top:${top - 290}px">${castleSvg(dc >= 27)}<div class="castle-label">Замок Грамотности</div></div>
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
      const tasks = g.tasks.filter(isExamTask); const n = tasks.filter((t) => S.done[t]).length;
      const reached = curIdx < 0 || s <= curIdx;
      const full = n === tasks.length;
      if (g.scenery) {
        const zoneBottom = gi === 0 ? H : yStart;
        wrap.prepend(h(`<div class="zone scenery-${g.scenery}" style="top:${yEnd}px;height:${zoneBottom - yEnd}px" aria-hidden="true"></div>`));
      }
      wrap.appendChild(h(`<div class="gsign ${reached ? 'reached' : 'locked'} ${full ? 'full' : ''}" style="top:${yStart}px">
          <span class="gs-e">${full ? '✅' : reached ? g.e : '🔒'}</span>
          <span class="gs-t"><small>Глава ${gi + 1} · ${g.label}</small><b>${g.name}</b></span>
          <span class="gs-n">${n}/${tasks.length}</span>
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
      const cls = ['station', isDone ? 'done' : '', isCur ? 'cur' : '', ready ? 'ready' : 'soon', isCastle ? 'essay' : ''].join(' ');
      const stars = isDone ? '★'.repeat(S.done[n].stars) + '☆'.repeat(3 - S.done[n].stars) : '';
      const st = h(`<button class="${cls}" style="left:${pt.x}px;top:${pt.y}px" data-n="${n}">
          <span class="st-num">${isCastle ? '✍️' : !isExamTask(n) ? '🏆' : n}</span>
          ${!ready && !isDone ? '<span class="st-lock">🔒</span>' : ''}
          ${isCur ? '<span class="st-avatar">📍</span>' : ''}
          <span class="st-label">${isCastle ? '27 · ' : ''}${TASKS[n]}${stars ? `<em>${stars}</em>` : ''}${!isDone && ready && S.prog[n] && LESSONS[n] ? `<em class="st-pct">${Math.round((S.prog[n] / (LESSONS[n].slides.length - 1)) * 100)}%</em>` : ''}</span>
        </button>`);
      st.addEventListener('click', () => openStation(n));
      wrap.appendChild(st);
    });
    // сундуки
    CHESTS.forEach((ci) => {
      const a = pts[ROUTE.indexOf(EGE[ci])], b = pts[ROUTE.indexOf(EGE[ci + 1])];
      const opened = S.chests.includes(ci);
      const avail = dc > ci;
      const ch = h(`<button class="chest ${opened ? 'opened' : ''} ${avail && !opened ? 'avail' : ''}" style="left:${(a.x + b.x) / 2 > W / 2 ? W * 0.16 : W * 0.84}px;top:${(a.y + b.y) / 2}px">${opened ? '📭' : '🎁'}</button>`);
      ch.addEventListener('click', () => {
        if (opened) return toast('Этот сундук уже открыт');
        if (!avail) return toast(`🎁 Сундук откроется после ${ci + 1}-го пройденного задания`);
        S.chests.push(ci); save();
        reward(30, 0, { anchor: ch });
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
    if (!open) return modal(`<div class="center"><div class="big-emoji">🔒</div><h2>${isExamTask(n) ? `Задание ${n}. ` : ''}${TASKS[n]}</h2><p>Станции открываются по порядку. Сначала пройди задание <b>№${ROUTE[curIdx]}</b> — и дорога поведёт дальше.</p><button class="btn primary" data-close>Понятно</button></div>`);
    if (n === 27) return modal(`<div class="center"><div class="big-emoji">🏰</div><h2>Сочинение — финальный босс</h2><p>Ворота замка откроются, когда ты соберёшь ключи от всех 26 заданий.</p><p class="muted">Ключей: ${Math.min(doneCount(), 26)} / 26 🗝️</p><button class="btn primary" data-close>Вперёд!</button></div>`);
    modal(`<div class="center"><div class="big-emoji">🔒</div><h2>${isExamTask(n) ? `Задание ${n}. ` : ''}${TASKS[n]}</h2><p>Ты дошёл до этой станции! 🎉 Урок по ней уже в разработке и скоро появится здесь.</p><button class="btn primary" data-close>Понятно</button></div>`);
  }

  /* ===== Профиль ===== */
  function renderProfile(v) {
    const li = levelInfo();
    v.appendChild(h(`<div class="card profile">
      <div class="pf-avatar">${((S.name || '').trim()[0] || '?').toUpperCase()}</div>
      <input class="pf-name" placeholder="Твоё имя" value="${(S.name || '').replace(/"/g, '&quot;')}" maxlength="20">
      <div class="pf-level"><span class="lvl-badge">${li.lvl}</span> ${li.title}</div>
      <div class="city-stats">
        <div><b>${S.totalXp}</b><span>XP всего</span></div>
        <div><b>${doneCount()}</b><span>заданий</span></div>
        <div><b>${S.stats.correct}</b><span>верных ответов</span></div>
        <div><b>${S.streak.count}🔥</b><span>дней подряд</span></div>
      </div>
    </div>`));
    $('.pf-name', v).addEventListener('change', (e) => { S.name = e.target.value.trim(); save(); topbar(); $('.pf-avatar', v).textContent = (S.name[0] || '?').toUpperCase(); });
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
      <button class="btn ghost tour-again">Показать знакомство с приложением</button>
      <button class="btn ghost danger reset">Сбросить прогресс</button></div>`);
    $('.tour-again', set).addEventListener('click', () => { go('map'); setTimeout(tour, 300); });
    $('.reset', set).addEventListener('click', () => {
      ask('Точно сбросить весь прогресс?', 'Сбросить', () => { S = fresh(); save(); topbar(); onboarding(); go('map'); });
    });
    v.appendChild(set);
    if (App.proCard) v.insertBefore(App.proCard(), v.children[1] || null);
  }

  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function onboarding() {
    if (S.onboarded) { if (!S.toured) setTimeout(tour, 400); return; }
    const m = modal(`<div class="center onb">
      <div class="big-emoji">🏰</div>
      <h2>Добро пожаловать в ЕГЭ квест!</h2>
      <p>Тебе предстоит пройти по дороге к <b>Замку грамотности</b> и освоить 26 заданий ЕГЭ.</p>
      <input class="pf-name" placeholder="Как тебя зовут?" maxlength="20">
      <button class="btn primary go">Начать путь 🚀</button>
    </div>`);
    m.el.querySelector('.go').addEventListener('click', () => {
      S.name = m.el.querySelector('.pf-name').value.trim();
      S.onboarded = true; save(); m.close(); topbar();
      go('map');
      setTimeout(tour, 350);
    });
  }

  /* Знакомство с приложением: подсветка частей экрана с короткими подсказками */
  function tour() {
    if (tab !== 'map') go('map');
    const v = $('#view');
    const steps = [
      { sel: '.map-head', t: 'Твой путь к 100 баллам', d: 'Здесь видно, сколько из 27 заданий ЕГЭ ты уже прошёл. Каждое пройденное задание — ключ от ворот замка.' },
      { sel: '.pts-card', t: 'Баллы ЕГЭ', d: 'Сколько первичных баллов даёт каждое задание и во сколько тестовых баллов они превращаются. Максимум — 100.' },
      { sel: '.gsign', t: '5 блоков дороги', d: 'Дорога разделена на 5 блоков: лес пунктуации, орфографические холмы, озеро языковых норм, текстовые горы и замок с сочинением.' },
      { sel: '.station.cur', t: 'Задания', d: 'Кружок — это задание. Внутри: теория маленькими блоками и практика. Задания открываются по порядку — начнём с №17.' },
      { sel: '.station[data-n="100"]', t: 'Зачёт', d: 'В конце блока ждёт зачёт 🏆: теория и задания из ЕГЭ по всем темам блока.' },
      { sel: '.chest', t: 'Сундуки', d: 'По пути встречаются сундуки 🎁 с бонусным опытом — открываются после пройденных заданий.' },
      { sel: '.tb-xp', t: 'Опыт и уровень', d: 'За верные ответы и пройденные блоки копится опыт (XP). Опыт повышает уровень — от «Новичка» до «Короля ЕГЭ».' },
      { sel: '.tb-streak', t: 'Серия дней', d: 'Занимайся каждый день — огонёк считает дни подряд. За серии ты получаешь достижения.' },
      { sel: '.tabbar [data-tab="games"]', t: 'Мини-игры', d: 'Лабиринт, алхимия, классификации и другие активности помогут закрепить правила в игровом формате.' },
      { sel: '.tabbar [data-tab="profile"]', t: 'Профиль', d: 'Твои достижения, статистика, информация о версии PRO и установка приложения на телефон.' },
    ].filter((x) => $(x.sel));
    let k = 0;
    const ov = h('<div class="tour"><div class="tour-hole"></div><div class="tour-tip"><div class="tour-n"></div><b class="tour-t"></b><p class="tour-d"></p><div class="tour-btns"><button class="btn ghost tour-skip">Пропустить</button><button class="btn primary tour-next">Дальше</button></div></div></div>');
    document.body.appendChild(ov);
    const hole = $('.tour-hole', ov), tip = $('.tour-tip', ov);
    const end = () => { ov.remove(); S.toured = true; save(); go('map'); };
    const place = () => {
      const st = steps[k], el = $(st.sel);
      const r = el.getBoundingClientRect(), pad = 6;
      Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      $('.tour-n', ov).textContent = `${k + 1} из ${steps.length}`;
      $('.tour-t', ov).textContent = st.t;
      $('.tour-d', ov).textContent = st.d;
      $('.tour-next', ov).textContent = k === steps.length - 1 ? 'Поехали! 🚀' : 'Дальше';
      const below = r.bottom + 12 + 190 < innerHeight;
      tip.style.top = below ? r.bottom + 14 + 'px' : '';
      tip.style.bottom = below ? '' : Math.max(12, innerHeight - r.top + 14) + 'px';
      if (!below && r.top < 220) { tip.style.bottom = ''; tip.style.top = Math.min(innerHeight - 200, r.bottom + 14) + 'px'; }
    };
    const showStep = () => {
      const el = $(steps[k].sel);
      if (v.contains(el)) {
        const er = el.getBoundingClientRect(), vr = v.getBoundingClientRect();
        if (er.top < vr.top + 10 || er.bottom > vr.bottom - 10) v.scrollTop += er.top - vr.top - Math.max(20, (vr.height - Math.min(er.height, vr.height * 0.5)) / 3);
      }
      requestAnimationFrame(place);
    };
    $('.tour-next', ov).addEventListener('click', () => { if (++k >= steps.length) end(); else showStep(); });
    $('.tour-skip', ov).addEventListener('click', end);
    showStep();
  }

  /* Плашка с баллами: сколько даёт каждое задание и перевод в тестовые баллы */
  const plural = (n) => (n === 1 ? 'балл' : n > 1 && n < 5 ? 'балла' : 'баллов');
  function pointsCard() {
    const pr = primary(), sec = SCALE[pr];
    const tile = (n) => `<div class="pt ${S.done[n] ? 'done' : ''} ${n === 27 ? 'essay' : ''}" style="flex-basis:${PTS[n] === 2 ? 56 : 34}px"><b>${n}</b><span>${PTS[n]}</span></div>`;
    const el = h(`<div class="card pts-card">
      <div class="pts-top"><div><div class="eyebrow">Баллы ЕГЭ</div><b class="pts-big">${sec}<small> / 100</small></b><div class="muted small">за пройденные задания: ${pr} из 50 первичных</div></div>
        <button class="btn ghost pts-more">Подробнее</button></div>
      <div class="pts-split"><div class="ps-test" style="flex:28"><b>Тест · задания 1–26</b><span>28 первичных баллов</span></div><div class="ps-essay" style="flex:22"><b>Сочинение</b><span>22 первичных балла</span></div></div>
      <div class="pts-more-box hidden">
        <div class="small muted">Первичные баллы за каждое задание:</div>
        <div class="pts-grid">${range(1, 27).map(tile).join('')}</div>
        <div class="small"><b>1 балл</b> — задания 1–7, 9–21, 23–26 · <b>2 балла</b> — задания 8 и 22 · <b>22 балла</b> — сочинение (27)</div>
        <details><summary>Шкала перевода первичных баллов в тестовые</summary><div class="scale">${SCALE.slice(1).map((x, i) => `<span class="${i + 1 === pr ? 'on' : ''}"><i>${i + 1}</i>${x}</span>`).join('')}</div></details>
      </div>
    </div>`);
    $('.pts-more', el).addEventListener('click', (e) => { const b = $('.pts-more-box', el); b.classList.toggle('hidden'); e.target.textContent = b.classList.contains('hidden') ? 'Подробнее' : 'Свернуть'; });
    return el;
  }

  /* ===== Движок уроков ===== */
  // практика — слайды, где ученик отвечает; остальное — теория
  const PRACTICE_RE = /Practice16\(|choicePh\(|sortPh\(|commaPh\(|answerPh\(|reasonAnswer\(|api\.good\(/;
  const kindOf = (f) => f.kind || (/Упражнение|Практика|Тренировка/.test(f.block || '') || PRACTICE_RE.test(String(f)) ? 'practice' : 'theory');

  function openLesson(n) {
    const L = LESSONS[n];
    const root = $('#lesson');
    root.innerHTML = `<div class="l-head">
        <button class="l-close" aria-label="Закрыть">✕</button>
        <button class="l-back" aria-label="Назад">‹</button>
        <button class="l-fwd" aria-label="Вперёд">›</button>
        <span class="l-sp"></span>
        <button class="l-toc" aria-label="Оглавление" title="Оглавление">☰</button>
        <div class="l-bank" title="Копилка опыта"><b>0</b><small>XP</small></div>
        <span class="l-combo"></span>
      </div>
      <div class="l-progrow"><div class="l-prog"></div></div>
      <div class="l-body"></div>
      <div class="l-foot"><div class="l-feedback"></div><div class="l-btns"><button class="btn ghost l-extra hidden"></button><button class="btn primary l-main">Дальше</button></div></div>`;
    root.classList.remove('hidden');
    document.body.classList.add('in-lesson');
    const body = $('.l-body', root), progEl = $('.l-prog', root), fb = $('.l-feedback', root);
    const main = $('.l-main', root), extra = $('.l-extra', root), combo = $('.l-combo', root);
    const fwd = $('.l-fwd', root), back = $('.l-back', root);
    const ctx = { errors: 0, xp: 0, coins: 0, combo: 0, data: {} };
    const bank = $('.l-bank', root), bankN = $('.l-bank b', root);
    const total = L.slides.length - 1;
    const kinds = L.slides.map(kindOf);
    // полоска прогресса: участки теории и практики
    const runs = [];
    kinds.forEach((k, i) => { if (i === total) return; if (runs.length && runs[runs.length - 1].k === k) runs[runs.length - 1].n++; else runs.push({ k, from: i, n: 1 }); });
    progEl.innerHTML = runs.map((r) => `<span class="lp-seg ${r.k}" style="flex:${r.n}" title="${r.k === 'practice' ? 'Практика' : 'Теория'}"><i></i></span>`).join('');
    const segs = [...progEl.querySelectorAll('.lp-seg')];
    let idx = 0, shownXp = 0, maxIdx = 0;
    const cache = new Map();
    // счётчик копилки догоняет реальный опыт, когда долетают искры
    const bankTo = (v) => {
      const from = shownXp, t0 = performance.now();
      shownXp = v;
      const step = (t) => { const k = Math.min(1, (t - t0) / 500); bankN.textContent = Math.round(from + (v - from) * k); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    };
    const toBank = (anchor, gx) => flyXP(anchor || main, gx, bank, () => bankTo(ctx.xp));
    // опыт копится тихо и улетает в копилку один раз — в конце блока
    let pending = 0;
    const flush = (bonus = 0) => {
      const gx = (bonus ? reward(bonus, 0, { quiet: true }) : 0);
      ctx.xp += gx;
      const total = pending + gx; pending = 0;
      if (total > 0) toBank(main, total);
    };
    const awarded = new Set();
    const blockOf = (i) => (L.slides[i] && L.slides[i].block) || null;
    const isPractice = () => kinds[idx] === 'practice';
    const drawCombo = () => {
      const on = isPractice() && ctx.combo >= 2;
      combo.textContent = on ? `🔥 x${ctx.combo}` : '';
      combo.classList.toggle('hot', on && ctx.combo >= 3);
    };

    const api = {
      ctx, S, mainEl: main,
      next: () => show(idx + 1),
      foot({ label = 'Дальше', enabled = true, onClick = api.next, extraLabel = null, onExtra = null } = {}) {
        main.textContent = label;
        main.disabled = !enabled;
        main.onclick = () => onClick();
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
        const gx = reward(xp * mult, 0, { quiet: true });
        ctx.xp += gx; pending += gx;
        ctx.correct = (ctx.correct || 0) + 1;
        S.stats.correct++; S.run = (S.run || 0) + 1; save();
        [5, 10, 25].forEach((k) => { if (S.run >= k) unlock('run' + k); });
        [50, 200, 500].forEach((k) => { if (S.stats.correct >= k) unlock('ok' + k); });
        drawCombo();
        buzz(15);
        api.feedback('ok', `<b>${pick(GOOD)}</b>${text ? `<div>${text}</div>` : ''}`);
      },
      bad(msgs, { concise = false } = {}) {
        ctx.combo = 0; ctx.errors++;
        S.run = 0;
        drawCombo();
        S.stats.wrong++; save();
        buzz([20, 40, 20]);
        root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake');
        api.feedback('bad', concise ? (msgs || []).join('<br>') : `<b>${pick(BAD)}</b>${(msgs || []).map((m) => `<div>• ${m}</div>`).join('')}`);
      },
      spendHint(cost, text) {
        modal(`<div class="center"><div class="big-emoji">💡</div><p>${text}</p><button class="btn primary" data-close>Понял(а)</button></div>`);
        return true;
      },
      openAlgo,
      toast, confetti, sound, modal, reward, unlock,
      fly: (anchor, xp) => { const gx = reward(xp, 0, { quiet: true }); ctx.xp += gx; pending += gx; return gx; },
      finish(stars) {
        const beforeLevel = levelInfo().lvl;
        const first = !S.done[n];
        const prev = S.done[n] || { stars: 0, times: 0 };
        S.done[n] = { stars: Math.max(prev.stars, stars), times: prev.times + 1 };
        save();
        const bx = first ? 60 : 20, bc = 0;
        const before = ctx.xp;
        flush(bx);
        const gx = ctx.xp - before;
        delete S.prog[n];
        // общий урок на несколько станций (19–20) закрывает их все
        (L.alsoDone || []).forEach((x) => { const p = S.done[x] || { stars: 0, times: 0 }; S.done[x] = { stars: Math.max(p.stars, stars), times: p.times + 1 }; delete S.prog[x]; });
        save();
        const afterLevel = levelInfo().lvl;
        if (afterLevel > beforeLevel) pendingLevel = afterLevel;
        topbar(true);
        if (stars === 3) unlock('clean');
        return { first, bonusXp: gx, bonusCoins: bc };
      },
      close,
    };

    // уходя со слайда, запоминаем его целиком — при возврате он будет таким, каким его оставили
    function stash() {
      if (!body.childNodes.length) return;
      const frag = document.createDocumentFragment();
      while (body.firstChild) frag.appendChild(body.firstChild);
      cache.set(idx, {
        frag, scroll: body.scrollTop,
        main: { text: main.textContent, disabled: main.disabled, onclick: main.onclick },
        extra: { text: extra.textContent, hidden: extra.classList.contains('hidden'), onclick: extra.onclick },
        fb: { cls: fb.className, html: fb.innerHTML },
      });
    }
    function restore(c) {
      body.appendChild(c.frag);
      main.textContent = c.main.text; main.disabled = c.main.disabled; main.onclick = c.main.onclick;
      extra.textContent = c.extra.text; extra.classList.toggle('hidden', c.extra.hidden); extra.onclick = c.extra.onclick;
      fb.className = c.fb.cls; fb.innerHTML = c.fb.html;
      root.classList.toggle('fb-open', c.fb.cls.trim() !== 'l-feedback');
      requestAnimationFrame(() => { body.scrollTop = c.scroll; });
    }

    function show(i) {
      const prev = idx;
      if (i >= L.slides.length) return close();
      // блок пройден: накопленный опыт + бонус улетают в копилку (за вводный блок без теории — ничего)
      const pb = blockOf(prev), nb = blockOf(i);
      let adAfter = false;
      if (i > prev && pb && pb !== nb && !awarded.has(pb)) {
        awarded.add(pb);
        flush(pb === 'Задание' ? 0 : 10);
        if (pb !== 'Задание') { S.blocks = (S.blocks || 0) + 1; adAfter = shouldAd(); }
      }
      stash();
      idx = i;
      maxIdx = Math.max(maxIdx, i);
      if (!S.done[n] && i > (S.prog[n] || 0) && i < total) { S.prog[n] = i; save(); }
      const c = cache.get(i);
      if (c) { cache.delete(i); restore(c); }
      else {
        body.innerHTML = '';
        body.scrollTop = 0;
        api.feedback(null);
        api.foot();
        L.slides[i](body, api);
      }
      segs.forEach((sg, k) => { const r = runs[k]; sg.firstChild.style.width = Math.max(0, Math.min(1, (i - r.from) / r.n)) * 100 + '%'; });
      back.disabled = i === 0;
      fwd.classList.toggle('hidden', i >= maxIdx);
      drawCombo();
      if (adAfter) setTimeout(() => App.proAd && App.proAd(), 500);
    }
    // реклама PRO — изредка, после пройденного блока
    function shouldAd() {
      if (!App.proAd || S.blocks < 3) return false;
      if (Date.now() - (S.lastAd || 0) < 40 * 60 * 1000) return false;
      if (S.blocks % 4 !== 3) return false;
      S.lastAd = Date.now(); save();
      return true;
    }
    function close() {
      root.classList.add('hidden');
      root.innerHTML = '';
      document.body.classList.remove('in-lesson');
      go(tab);
      if (pendingLevel) { const l = pendingLevel; pendingLevel = 0; setTimeout(() => levelUp(l), 400); }
      pendingToasts.splice(0).forEach((m, k) => setTimeout(() => toast(m, 'achv'), 1200 + k * 2600));
    }
    // оглавление: можно перейти к любому уже открытому слайду
    function toc() {
      const open = S.done[n] ? total : maxIdx;
      const groups = [];
      L.slides.forEach((f, i) => {
        if (i === total) return;
        const b = f.block || 'Слайд';
        const g = groups[groups.length - 1];
        if (g && g.b === b) g.items.push(i); else groups.push({ b, items: [i] });
      });
      const m = modal(`<h2>Оглавление</h2><div class="toc">${groups.map((g) => {
        const first = g.items[0], pr = g.items.some((i) => kinds[i] === 'practice'), th = g.items.some((i) => kinds[i] !== 'practice');
        const st = g.items.includes(idx) ? 'cur' : first <= open ? 'open' : 'lock';
        return `<button class="toc-i ${st}" data-i="${first}" ${st === 'lock' ? 'disabled' : ''}><span class="toc-k">${pr ? '✍️' : '📖'}</span><span class="toc-t">${g.b}<small>${pr && th ? 'теория + практика' : pr ? 'практика' : 'теория'}</small></span><span class="toc-s">${st === 'lock' ? '🔒' : st === 'cur' ? '📍' : first < maxIdx ? '✓' : ''}</span></button>`;
      }).join('')}</div><button class="btn ghost" data-close>Закрыть</button>`, { cls: 'wide' });
      m.el.querySelectorAll('.toc-i:not([disabled])').forEach((b) => b.addEventListener('click', () => { m.close(); const i = +b.dataset.i; if (i !== idx) { maxIdx = Math.max(maxIdx, open); show(i); } }));
    }
    back.onclick = () => { if (idx > 0) show(idx - 1); };
    fwd.onclick = () => { if (idx < maxIdx) show(idx + 1); };
    $('.l-toc', root).onclick = toc;
    $('.l-close', root).onclick = () => {
      if (idx === 0 || idx >= total) close();
      else ask('Выйти из задания? Мы запомним, где ты остановился — сможешь продолжить.', 'Выйти', close);
    };
    const saved = S.prog[n] || 0;
    if (saved > 0 && !S.done[n]) {
      show(0);
      const m = modal(`<div class="center"><div class="big-emoji">📍</div><h2>Продолжим?</h2><p>Ты уже прошёл <b>${saved} из ${total}</b> шагов этого задания${blockOf(saved) ? ` и остановился на блоке «${blockOf(saved)}»` : ''}.</p><button class="btn primary go-on">Продолжить 🚀</button><button class="btn ghost" data-close>Начать сначала</button></div>`);
      m.el.querySelector('.go-on').addEventListener('click', () => { m.close(); maxIdx = saved; show(saved); });
    } else show(0);
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
    document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
    $('.tb-avatar').addEventListener('click', () => go('profile'));
    topbar();
    go('map');
    onboarding();
    let rt;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (tab === 'map' && $('#lesson').classList.contains('hidden')) go('map'); }, 250); });
    try { if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (_) {}
  }

  const core = { reward, sound, buzz, confetti, pick, GOOD, BAD, modal, toast, save, unlock, topbar, get S() { return S; } };
  return { start, LESSONS, TASKS, PTS, coin, h, $, pick, openAlgo, confetti, core, tour };
})();

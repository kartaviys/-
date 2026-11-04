/* Королевство Слова: башня мага (главный экран), книга заклинаний, мини-игры, ежедневные миссии, подписка MAGISTER */
(() => {
  const { h, coin, core: C } = App;
  const $ = (s, r = document) => r.querySelector(s);
  const S = () => C.S;
  const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

  /* ===== MAGISTER ===== */
  // Промокоды вида MAG-XXXX-XXXX: 6 символов + 2 контрольных (их выдаёт tools/magister-codes.mjs)
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const fnv = (str) => { let x = 0x811c9dc5; for (const ch of str) { x ^= ch.charCodeAt(0); x = Math.imul(x, 0x01000193) >>> 0; } return x; };
  const checkPart = (body) => { const x = fnv(body + '|MAGISTER|2026'); return ALPH[x % 32] + ALPH[(x >>> 5) % 32]; };
  function validCode(raw) {
    const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^MAG/, '');
    if (c.length !== 8 || [...c].some((ch) => !ALPH.includes(ch))) return null;
    return checkPart(c.slice(0, 6)) === c.slice(6) ? c : null;
  }
  const isMag = () => !!(S().magister && S().magister.active);
  const magBadge = '<span class="mag-badge">MAGISTER</span>';

  const FREE_LIST = ['Путь ученика по всем областям', 'Теория по всем темам — Книга заклинаний', 'Практика заданий ЕГЭ', 'Карта Королевства Слова', 'Опыт и уровни', 'Развитие башни', 'Базовые сюжетные испытания и мини-игра «Лес потерянных букв»'];
  const MAG_LIST = [
    ['Все мини-игры', true], ['Магические дуэли', true], ['Эксклюзивные предметы и образы', true],
    ['Дополнительные квесты', false], ['Расширенная система коллекций', false],
    ['Проверка сочинений с разбором ошибок', false], ['Персональные тренировочные испытания', false],
  ];

  function openMagister() {
    const active = isMag();
    const m = C.modal(`<div class="mag">
      <div class="mag-hero"><div class="mag-crown">👑</div><h2>MAGISTER</h2><p>Полная магическая сила</p></div>
      <div class="mag-cols">
        <div class="mag-col"><b>FREE · Путь ученика</b><ul>${FREE_LIST.map((x) => `<li>✓ ${x}</li>`).join('')}</ul></div>
        <div class="mag-col gold"><b>MAGISTER</b><ul>${MAG_LIST.map(([x, ready]) => `<li>✦ ${x}${ready ? '' : ' <em>скоро</em>'}</li>`).join('')}</ul></div>
      </div>
      <p class="muted small">Вся подготовка к ЕГЭ остаётся бесплатной. MAGISTER добавляет разнообразие, азарт и обратную связь.</p>
      ${active ? `<p class="ok-text">✅ MAGISTER активен (код ${S().magister.code.slice(0, 4)}-…)</p>` : `
        <label class="mag-label" for="magCode">Код активации</label>
        <div class="mag-form"><input id="magCode" class="mag-input" placeholder="MAG-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn gold mag-go">Активировать</button></div>
        <p class="muted small">Код выдаёт преподаватель после оплаты.</p>`}
      <button class="btn ghost" data-close>Закрыть</button>
    </div>`, { cls: 'mag-modal' });
    const go = m.el.querySelector('.mag-go');
    if (!go) return;
    const submit = () => {
      const code = validCode(m.el.querySelector('.mag-input').value);
      if (!code) { C.toast('Код не подходит. Проверь буквы и цифры', 'bad'); C.sound('err'); return; }
      S().magister = { active: true, code, at: Date.now() };
      C.save(); m.close();
      C.sound('level'); C.confetti(200); C.buzz([30, 40, 60]);
      C.modal(`<div class="center"><div class="big-emoji">👑</div><h2>Добро пожаловать, Магистр!</h2><p>Открыты все мини-игры, магические дуэли и эксклюзивные предметы для башни.</p><button class="btn primary" data-close>Ура!</button></div>`);
      C.go(C.tab);
    };
    go.addEventListener('click', submit);
    m.el.querySelector('.mag-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  App.VIEWS.magisterCard = (v) => {
    const card = h(`<div class="card mag-card ${isMag() ? 'on' : ''}"><span>👑</span><div><b>MAGISTER</b><small>${isMag() ? 'Подписка активна' : 'Все мини-игры, дуэли и эксклюзивные предметы'}</small></div><button class="btn gold">${isMag() ? 'Подробнее' : 'Узнать'}</button></div>`);
    card.querySelector('button').addEventListener('click', openMagister);
    v.insertBefore(card, v.children[1] || null);
  };

  /* ===== Башня ===== */
  const ROOMS = [
    { id: 'study', name: 'Кабинет', e: '🕯️', lvl: 1, slots: 6, cats: ['furniture', 'artifact', 'plant'] },
    { id: 'green', name: 'Оранжерея', e: '🌿', lvl: 3, slots: 4, cats: ['plant'] },
    { id: 'hall', name: 'Зал артефактов', e: '🔮', lvl: 5, slots: 4, cats: ['artifact'] },
    { id: 'secret', name: 'Секретная комната', e: '🚪', lvl: 7, slots: 4, cats: ['furniture', 'artifact', 'plant'], secret: true },
  ];
  const CATS = { furniture: 'Мебель', artifact: 'Артефакты', plant: 'Растения', familiar: 'Фамильяры' };
  const ITEMS = [
    { id: 'chair', cat: 'furniture', e: '🪑', name: 'Дубовый стул', price: 20, inc: 1, lvl: 1 },
    { id: 'candle', cat: 'furniture', e: '🕯️', name: 'Канделябр', price: 25, inc: 2, lvl: 1 },
    { id: 'sofa', cat: 'furniture', e: '🛋️', name: 'Бархатный диван', price: 50, inc: 3, lvl: 1 },
    { id: 'shelf', cat: 'furniture', e: '📚', name: 'Книжный шкаф', price: 70, inc: 3, lvl: 2, xp: 0.05 },
    { id: 'mirror', cat: 'furniture', e: '🪞', name: 'Зеркало прорицаний', price: 90, inc: 5, lvl: 3 },
    { id: 'bed', cat: 'furniture', e: '🛏️', name: 'Ложе с балдахином', price: 120, inc: 6, lvl: 4 },
    { id: 'scroll', cat: 'artifact', e: '📜', name: 'Свиток правил', price: 40, inc: 2, lvl: 1 },
    { id: 'hourglass', cat: 'artifact', e: '⏳', name: 'Песочные часы', price: 60, inc: 3, lvl: 2 },
    { id: 'orb', cat: 'artifact', e: '🔮', name: 'Хрустальный шар', price: 80, inc: 4, lvl: 2 },
    { id: 'amphora', cat: 'artifact', e: '🏺', name: 'Древняя амфора', price: 100, inc: 5, lvl: 3 },
    { id: 'key', cat: 'artifact', e: '🗝️', name: 'Ключ от тайн', price: 130, inc: 6, lvl: 4 },
    { id: 'wand', cat: 'artifact', e: '🪄', name: 'Волшебная палочка', price: 160, inc: 7, lvl: 5, xp: 0.1 },
    { id: 'sprout', cat: 'plant', e: '🌱', name: 'Росток мудрости', price: 15, inc: 1, lvl: 1 },
    { id: 'cactus', cat: 'plant', e: '🌵', name: 'Колючий кактус', price: 25, inc: 1, lvl: 1 },
    { id: 'mushroom', cat: 'plant', e: '🍄', name: 'Светящийся гриб', price: 35, inc: 2, lvl: 2 },
    { id: 'sakura', cat: 'plant', e: '🌸', name: 'Сакура запятых', price: 45, inc: 2, lvl: 3 },
    { id: 'sunflower', cat: 'plant', e: '🌻', name: 'Подсолнух-эрудит', price: 60, inc: 3, lvl: 3 },
    { id: 'mandrake', cat: 'plant', e: '🪴', name: 'Мандрагора', price: 110, inc: 5, lvl: 4 },
    { id: 'globe', cat: 'artifact', e: '🌌', name: 'Звёздный глобус', price: 150, inc: 8, lvl: 1, mag: true, xp: 0.05 },
    { id: 'crystal', cat: 'plant', e: '💠', name: 'Кристальный цветок', price: 120, inc: 6, lvl: 1, mag: true },
    { id: 'throne', cat: 'furniture', e: '👑', name: 'Трон Магистра', price: 200, inc: 10, lvl: 1, mag: true, xp: 0.05 },
  ];
  const FAMILIARS = [
    { id: 'frog', cat: 'familiar', e: '🐸', name: 'Жаб-философ', price: 80, inc: 3, lvl: 1 },
    { id: 'owl', cat: 'familiar', e: '🦉', name: 'Мудрая сова', price: 120, inc: 4, lvl: 2, xp: 0.05 },
    { id: 'cat', cat: 'familiar', e: '🐈‍⬛', name: 'Чёрный кот', price: 120, inc: 5, lvl: 2 },
    { id: 'fox', cat: 'familiar', e: '🦊', name: 'Огненный лис', price: 180, inc: 6, lvl: 3 },
    { id: 'dragon', cat: 'familiar', e: '🐉', name: 'Дракончик', price: 300, inc: 10, lvl: 5, xp: 0.1 },
    { id: 'unicorn', cat: 'familiar', e: '🦄', name: 'Единорог', price: 250, inc: 10, lvl: 1, mag: true, xp: 0.1 },
  ];
  const ALL = [...ITEMS, ...FAMILIARS];
  const INCOME_CAP_H = 12;
  const T = () => S().tower;
  const owned = () => [...Object.values(T().slots), T().familiar].filter(Boolean).map((id) => ALL.find((x) => x.id === id)).filter(Boolean);
  const income = () => owned().reduce((s, x) => s + x.inc, 0);
  const pending = () => Math.floor(income() * Math.min(INCOME_CAP_H, (Date.now() - T().lastCollect) / 3.6e6));
  C.setXpBonus(() => owned().reduce((s, x) => s + (x.xp || 0), 0));

  function towerSvg(floors, lit) {
    const fw = 112, fh = 46, x0 = 44, base = 290;
    let body = '';
    for (let f = 0; f < floors; f++) {
      const y = base - (f + 1) * fh;
      body += `<rect x="${x0}" y="${y}" width="${fw}" height="${fh}" fill="${f % 2 ? '#7c3aed' : '#6d28d9'}"/>`;
      for (let w = 0; w < 3; w++) {
        const on = f * 3 + w < lit;
        body += `<rect x="${x0 + 16 + w * 32}" y="${y + 12}" width="16" height="22" rx="8" fill="${on ? '#fde68a' : '#4c1d95'}"${on ? ' class="win-on"' : ''}/>`;
      }
      body += `<rect x="${x0 - 4}" y="${y - 3}" width="${fw + 8}" height="6" rx="3" fill="#5b21b6"/>`;
    }
    const topY = base - floors * fh;
    return `<svg viewBox="0 0 200 300" class="tower-svg" aria-hidden="true">
      <ellipse cx="100" cy="292" rx="86" ry="8" fill="#ede9fe"/>
      ${body}
      <path d="M86 290 v-26 a14 14 0 0 1 28 0 v26z" fill="#3b0764"/>
      <rect x="${x0 - 10}" y="${topY - 10}" width="${fw + 20}" height="12" rx="4" fill="#5b21b6"/>
      <polygon points="${x0 - 14},${topY - 8} ${x0 + fw + 14},${topY - 8} 100,${topY - 96}" fill="#fbbf24"/>
      <polygon points="100,${topY - 96} ${x0 + fw + 14},${topY - 8} 112,${topY - 8}" fill="#f59e0b"/>
      <path d="M100 ${topY - 96} v-22 l18 7 -18 7z" fill="#a78bfa"/>
      <text x="100" y="${topY - 38}" text-anchor="middle" font-size="18" fill="#7c3aed">✦</text>
    </svg>`;
  }

  /* ===== Ежедневная миссия ===== */
  const MISSIONS = [
    { id: 'forest', story: 'Тёмная магия проникла в Лес потерянных букв.', task: 'Восстанови 15 слов', goal: 15, ev: 'forest', btn: '🌲 В Лес', act: () => startGame('forest') },
    { id: 'citadel', story: 'Старый хранитель Цитадели знаков вызывает тебя на испытание.', task: 'Докажи, что умеешь управлять пунктуацией: 8 верных шагов в заданиях', goal: 8, ev: 'step', btn: '🗺️ К испытанию', act: () => C.go('map') },
    { id: 'herald', story: 'Королевский гонец принёс свиток с печатью.', task: 'Пройди одно задание на карте до финальной звезды', goal: 1, ev: 'lesson', btn: '🗺️ На карту', act: () => C.go('map') },
  ];
  const MISSION_REWARD = { xp: 100, ess: 40 };
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  function mission() {
    const t = todayKey();
    if (!S().daily || S().daily.date !== t) {
      const dayN = Math.floor(Date.now() / 864e5);
      S().daily = { date: t, id: MISSIONS[dayN % MISSIONS.length].id, progress: 0, claimed: false };
      C.save();
    }
    return { st: S().daily, m: MISSIONS.find((x) => x.id === S().daily.id) };
  }
  function bump(ev, n = 1) {
    const { st, m } = mission();
    if (m.ev !== ev || st.claimed || st.progress >= m.goal) return;
    st.progress = Math.min(m.goal, st.progress + n);
    C.save();
    if (st.progress >= m.goal) C.toast('📜 Ежедневная миссия выполнена! Забери награду в башне', 'achv');
  }
  C.on('step', () => bump('step'));
  C.on('lesson', () => bump('lesson'));

  /* Следующий босс: последняя станция первой непройденной области */
  function nextBoss() {
    const g = C.GROUPS.find((x) => x.tasks.some((t) => !S().done[t]));
    if (!g) return null;
    return { g, left: g.tasks.filter((t) => !S().done[t]).length };
  }

  /* ===== Главный экран: башня ===== */
  function renderTower(v) {
    const li = C.levelInfo();
    const rooms = ROOMS.filter((r) => li.lvl >= r.lvl);
    const items = Object.keys(T().slots).length;
    const fam = ALL.find((x) => x.id === T().familiar);
    const boss = nextBoss();
    const { st, m } = mission();
    const pend = pending();
    v.appendChild(h(`<div class="realm">
      <button class="side side-left" data-act="map">
        <span class="side-e">🗺️</span><b>Карта мира</b>
        ${boss ? `<small class="boss-tag">${boss.g.bossE} Босс: ${boss.g.boss}</small><small>${boss.g.region} · осталось ${boss.left}</small>` : '<small>Все области пройдены!</small>'}
      </button>
      <div class="tower-wrap">
        <div class="tower-name">${S().name ? `Башня · ${S().name}` : 'Башня мага'}</div>
        ${towerSvg(rooms.length + 1, items + (fam ? 1 : 0))}
        <span class="tw-avatar">${S().avatar}</span>
        ${fam ? `<span class="tw-fam">${fam.e}</span>` : ''}
        <span class="tw-sparkle s1">✦</span><span class="tw-sparkle s2">✧</span>
      </div>
      <div class="side-col">
        <button class="side" data-act="book"><span class="side-e">📖</span><b>Книга заклинаний</b><small>теория</small></button>
        <button class="side" data-act="games"><span class="side-e">🎲</span><b>Мини-игры</b><small>${isMag() ? 'все открыты' : '1 бесплатно'}</small></button>
      </div>
    </div>`));
    v.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      C.sound('tap');
      ({ map: () => C.go('map'), book: () => C.go('book'), games: openGames })[b.dataset.act]();
    }));
    // ежедневная миссия
    const done = st.progress >= m.goal;
    const mc = h(`<div class="card mission-card ${done ? 'ready' : ''} ${st.claimed ? 'claimed' : ''}">
      <div class="mc-top"><span class="mc-e">📜</span><div><div class="eyebrow">Ежедневная миссия</div><p class="mc-story">${m.story} <b>${m.task}</b> и получи ${MISSION_REWARD.xp} XP.</p></div></div>
      <div class="prog-row"><div class="pbar"><i style="width:${(st.progress / m.goal) * 100}%"></i></div><b>${st.progress}/${m.goal}</b></div>
      <button class="btn ${st.claimed ? 'ghost' : done ? 'gold' : 'primary'} mc-btn" ${st.claimed ? 'disabled' : ''}>${st.claimed ? 'Выполнено ✓ Новая миссия — завтра' : done ? `Забрать: +${MISSION_REWARD.xp} XP и +${MISSION_REWARD.ess} ${coin}` : m.btn}</button>
    </div>`);
    mc.querySelector('.mc-btn').addEventListener('click', (e) => {
      if (st.claimed) return;
      if (!done) return m.act();
      st.claimed = true; C.save();
      C.reward(MISSION_REWARD.xp, MISSION_REWARD.ess, { anchor: e.currentTarget });
      C.confetti(140); C.unlock('mission');
      C.go('tower');
    });
    v.appendChild(mc);
    // доход башни
    const inc = income();
    const ic = h(`<div class="card tower-income">
      <div class="city-stats">
        <div><b>${li.lvl}</b><span>уровень</span></div>
        <div><b>${owned().length}</b><span>предметов</span></div>
        <div><b>${inc}</b><span>${coin}/час</span></div>
        <div><b>+${Math.round(owned().reduce((s, x) => s + (x.xp || 0), 0) * 100)}%</b><span>к опыту</span></div>
      </div>
      <button class="btn ${pend > 0 ? 'gold' : 'ghost'} collect" ${pend > 0 ? '' : 'disabled'}>${pend > 0 ? `Собрать эссенцию: +${pend} ${coin}` : inc ? 'Эссенция копится… загляни позже' : 'Поставь первый предмет — он начнёт копить эссенцию'}</button>
    </div>`);
    ic.querySelector('.collect').addEventListener('click', (e) => {
      const p = pending();
      if (!p) return;
      T().lastCollect = Date.now(); S().coins += p; C.save();
      C.floatText(`+${p} ${coin}`, e.currentTarget); C.sound('coin'); C.buzz(20);
      C.topbar(true); C.go('tower');
    });
    v.appendChild(ic);
    // фамильяр
    const fc = h(`<div class="card room fam-room"><div class="room-h"><span>🐾</span><b>Фамильяр</b><small>${fam ? fam.name : 'магический спутник'}</small></div>
      <button class="slot fam ${fam ? 'full' : ''}">${fam ? `<span class="pe">${fam.e}</span><span class="pn">${fam.name}</span>` : '<span class="plus">+</span><span class="pn">Завести фамильяра</span>'}</button></div>`);
    fc.querySelector('.slot').addEventListener('click', () => shop({ cats: ['familiar'], familiar: true }));
    v.appendChild(fc);
    // комнаты
    ROOMS.forEach((r) => {
      const open = li.lvl >= r.lvl;
      if (!open && r.secret) {
        v.appendChild(h(`<div class="card room locked secret"><div class="room-h"><span>❓</span><b>???</b><small>Где-то в башне скрыта дверь… откроется на ${r.lvl} уровне</small></div></div>`));
        return;
      }
      if (!open) { v.appendChild(h(`<div class="card room locked"><div class="room-h"><span>🔒</span><b>${r.name}</b><small>откроется на ${r.lvl} уровне</small></div></div>`)); return; }
      if (r.secret) C.unlock('secret');
      const card = h(`<div class="card room ${r.secret ? 'secret' : ''}"><div class="room-h"><span>${r.e}</span><b>${r.name}</b><small>${r.cats.map((c) => CATS[c]).join(' · ')}</small></div><div class="slots"></div></div>`);
      const grid = card.querySelector('.slots');
      for (let i = 0; i < r.slots; i++) {
        const key = `${r.id}:${i}`;
        const it = ALL.find((x) => x.id === T().slots[key]);
        const b = h(it ? `<button class="slot full"><span class="pe">${it.e}</span><span class="pn">${it.name}</span><span class="pi">+${it.inc} ${coin}/ч</span></button>` : '<button class="slot"><span class="plus">+</span></button>');
        b.addEventListener('click', () => (it ? itemInfo(it, key) : shop({ cats: r.cats, key })));
        grid.appendChild(b);
      }
      v.appendChild(card);
    });
    if (!S().done[17] && S().coins < 15) v.appendChild(h(`<div class="card hint-card">💡 Пройди первое задание на карте, чтобы заработать эссенцию для башни.</div>`));
  }
  App.VIEWS.tower = renderTower;

  function itemInfo(it, key) {
    const m = C.modal(`<div class="center"><div class="big-emoji">${it.e}</div><h2>${it.name}</h2>
      <div class="chips"><span class="chip">+${it.inc} ${coin}/час</span>${it.xp ? `<span class="chip violet">+${it.xp * 100}% XP</span>` : ''}${it.mag ? '<span class="chip violet">MAGISTER</span>' : ''}</div>
      <button class="btn ghost move">Убрать в сундук (+${Math.round(it.price / 2)} ${coin})</button>
      <button class="btn primary" data-close>Красота</button></div>`);
    m.el.querySelector('.move').addEventListener('click', () => {
      delete T().slots[key]; S().coins += Math.round(it.price / 2); C.save(); m.close(); C.topbar(true); C.go('tower');
    });
  }

  function shop({ cats, key, familiar }) {
    const lvl = C.levelInfo().lvl;
    const list = ALL.filter((x) => cats.includes(x.cat));
    const html = list.map((b) => {
      const locked = lvl < b.lvl || (b.mag && !isMag());
      const poor = S().coins < b.price;
      return `<button class="shop-item ${locked ? 'locked' : ''} ${poor ? 'poor' : ''}" data-id="${b.id}">
        <span class="se">${b.e}</span>
        <span class="sbody"><b>${b.name}${b.mag ? ` ${magBadge}` : ''}</b><small>${CATS[b.cat]}</small><small class="sinc">+${b.inc} ${coin}/ч${b.xp ? ` · +${b.xp * 100}% XP` : ''}</small></span>
        <span class="sprice">${b.mag && !isMag() ? '👑' : lvl < b.lvl ? `🔒 ур. ${b.lvl}` : `${b.price} ${coin}`}</span>
      </button>`;
    }).join('');
    const m = C.modal(`<h2>${familiar ? 'Выбери фамильяра' : 'Обустроим башню'}</h2><p class="muted">У тебя ${S().coins} ${coin} эссенции</p><div class="shop">${html}</div><button class="btn ghost" data-close>Закрыть</button>`, { cls: 'sheet' });
    m.el.addEventListener('click', (e) => {
      const el = e.target.closest('.shop-item');
      if (!el) return;
      const b = ALL.find((x) => x.id === el.dataset.id);
      if (b.mag && !isMag()) { m.close(); openMagister(); return; }
      if (lvl < b.lvl) { C.toast(`Откроется на ${b.lvl} уровне — продолжай учиться! ✨`, 'bad'); return; }
      if (S().coins < b.price) { C.toast(`Не хватает ${b.price - S().coins} ${coin}. Реши ещё пару заданий! 💪`, 'bad'); C.sound('err'); return; }
      if (!owned().length) T().lastCollect = Date.now();
      S().coins -= b.price;
      if (familiar) {
        const prev = ALL.find((x) => x.id === T().familiar);
        if (prev) S().coins += Math.round(prev.price / 2);
        T().familiar = b.id; C.unlock('familiar');
      } else {
        T().slots[key] = b.id; C.unlock('builder');
        if (Object.keys(T().slots).length >= 8) C.unlock('mayor');
      }
      C.save(); m.close();
      C.sound('level'); C.confetti(70); C.buzz(30);
      C.toast(`${b.e} ${b.name} — теперь в твоей башне!`, 'good');
      C.topbar(true); C.go('tower');
    });
  }

  /* ===== Книга заклинаний ===== */
  function renderBook(v) {
    v.appendChild(h(`<div class="card book-head"><div class="eyebrow">Книга заклинаний</div><h2>Теория по всем темам</h2><p class="muted small">Каждое заклинание — алгоритм решения задания. Открывай в любой момент, даже прямо во время урока (кнопка 📜).</p></div>`));
    C.GROUPS.forEach((g) => {
      const card = h(`<div class="card book-ch"><div class="room-h"><span>${g.e}</span><b>${g.region}</b><small>${g.name} · ${g.label}</small></div><div class="spells"></div></div>`);
      const list = card.querySelector('.spells');
      g.tasks.forEach((n) => {
        const L = C.LESSONS[n];
        const learned = !!S().done[n];
        const b = h(`<button class="spell ${L ? 'ready' : 'soon'} ${learned ? 'learned' : ''}"><span class="sp-n">${n}</span><span class="sp-t"><b>${C.TASKS[n]}</b><small>${L ? (learned ? '✨ изучено' : 'открыть алгоритм') : 'страница ещё пишется'}</small></span><span class="sp-i">${L ? '📜' : '🔒'}</span></button>`);
        b.addEventListener('click', () => (L ? App.openAlgo(L.algoImg) : C.toast('Эта страница книги ещё пишется ✍️')));
        list.appendChild(b);
      });
      v.appendChild(card);
    });
  }
  App.VIEWS.book = renderBook;

  /* ===== Мини-игры ===== */
  const LETTERS = [
    ['р_стение', ['а', 'о'], 0, 'Чередование раст/рос: перед «ст» пишется «а».'],
    ['выр_сли', ['а', 'о'], 1, 'Чередование раст/рос: без «ст» и «щ» — «о».'],
    ['з_ря', ['а', 'о'], 0, 'Зар/зор: без ударения пишется «а».'],
    ['пл_вец', ['а', 'о'], 1, 'Исключение: пловец, пловчиха.'],
    ['к_снуться', ['а', 'о'], 1, 'Кас/кос: если после корня нет суффикса «а» — «о».'],
    ['предл_гать', ['а', 'о'], 0, 'Лаг/лож: перед «г» — «а».'],
    ['пол_жить', ['а', 'о'], 1, 'Лаг/лож: перед «ж» — «о».'],
    ['заг_рать', ['а', 'о'], 1, 'Гар/гор: без ударения — «о».'],
    ['ск_чок', ['а', 'о'], 0, 'Исключение: скачок, скачу.'],
    ['р_внина', ['а', 'о'], 0, 'Исключение: равнина.'],
    ['ум_рать', ['и', 'е'], 0, 'Чередование мер/мир: если после корня суффикс «а» — «и».'],
    ['бл_стеть', ['и', 'е'], 1, 'Блест/блист: без суффикса «а» после корня — «е».'],
    ['пр_красный', ['е', 'и'], 0, 'Пре- в значении «очень»: прекрасный = очень красивый.'],
    ['пр_ехать', ['е', 'и'], 1, 'При- в значении приближения: приехать.'],
    ['иск_сство', ['у', 'о'], 0, 'Словарное слово: искусство.'],
    ['инт_ллигент', ['е', 'и'], 0, 'Словарное слово: интеллигент.'],
    ['ап_льсин', ['е', 'и'], 0, 'Словарное слово: апельсин.'],
    ['д_корация', ['е', 'и'], 0, 'Словарное слово: декорация.'],
    ['привил_гия', ['е', 'и'], 0, 'Словарное слово: привилегия.'],
    ['ст_рожил', ['а', 'о'], 0, 'Старожил — от слова «старый».'],
  ].map(([w, o, c, why]) => ({ q: `<span class="gw">${w.replace('_', '<i>_</i>')}</span>`, options: o, correct: c, why, fill: (i) => w.replace('_', `<b>${o[i]}</b>`) }));

  const STRESS = [
    ['звонИт', 'звОнит'], ['тОрты', 'тортЫ'], ['бАнты', 'бантЫ'], ['красИвее', 'красивЕе'], ['кухОнный', 'кУхонный'],
    ['щавЕль', 'щАвель'], ['жалюзИ', 'жАлюзи'], ['каталОг', 'катАлог'], ['свЁкла', 'свеклА'], ['(она) началА', '(она) нАчала'],
    ['включИт', 'вклЮчит'], ['цемЕнт', 'цЕмент'], ['слИвовый', 'сливОвый'], ['корЫсть', 'кОрысть'], ['Иксы', 'иксЫ'],
    ['экспЕрт', 'Эксперт'], ['донЕльзя', 'дОнельзя'], ['баловАть', 'бАловать'], ['крАны', 'кранЫ'], ['шАрфы', 'шарфЫ'],
    ['срЕдства', 'средствА'], ['обеспЕчение', 'обеспечЕние'],
  ].map(([ok, bad]) => {
    const flip = Math.random() < 0.5;
    return { q: '<span class="gq">Как правильно?</span>', options: flip ? [bad, ok] : [ok, bad], correct: flip ? 1 : 0, why: `Правильно: <b>${ok}</b>`, big: true };
  });

  const COMMAS = [
    ['Срывая листья _ ветер гнал их по дорожке.', 1, 'Деепричастный оборот обособляется всегда.'],
    ['Покрытые снегом _ деревья стояли неподвижно.', 0, 'Причастный оборот перед главным словом не обособляется.'],
    ['Деревья _ покрытые снегом, стояли неподвижно.', 1, 'Причастный оборот после главного слова обособляется.'],
    ['Он слушал _ затаив дыхание.', 1, 'Деепричастный оборот обособляется.'],
    ['К счастью _ дождь закончился.', 1, '«К счастью» — вводное слово.'],
    ['Мама _ посмотри на небо!', 1, '«Мама» — обращение.'],
    ['Мы шли по дороге _ и пели песни.', 0, 'Однородные сказуемые с одиночным «и» — без запятой.'],
    ['Солнце село _ и стало прохладно.', 1, 'Сложносочинённое предложение: две основы, соединённые «и».'],
    ['Я знаю _ что ты придёшь.', 1, 'Сложноподчинённое предложение: запятая перед «что».'],
    ['Он работал не покладая рук _ до самого вечера.', 0, '«Не покладая рук» — фразеологизм, не обособляется.'],
    ['Несмотря на дождь _ мы пошли гулять.', 1, 'Обстоятельство с предлогом «несмотря на» обособляется.'],
    ['Кот _ свернувшись клубком, спал на диване.', 1, 'Деепричастный оборот выделяется с двух сторон.'],
    ['Книга _ лежавшая на столе, оказалась моей.', 1, 'Причастный оборот после главного слова.'],
    ['Лежавшая на столе _ книга оказалась моей.', 0, 'Причастный оборот перед главным словом.'],
    ['Наверное _ завтра будет снег.', 1, '«Наверное» — вводное слово.'],
  ].map(([t, c, why]) => ({ q: `<span class="gs">${t.replace('_', '<i>?</i>')}</span>`, options: ['Без запятой', 'Нужна запятая'], correct: c, why }));

  const GAMES = [
    { id: 'forest', name: 'Лес потерянных букв', e: '🌲', desc: 'Вставь пропущенную букву и верни словам смысл', free: true, pool: () => LETTERS },
    { id: 'comma', name: 'Запятая-молния', e: '⚡', desc: 'Нужна запятая или нет? Отвечай, пока не погасла молния', timer: 7, pool: () => COMMAS },
    { id: 'stress', name: 'Эхо ударений', e: '🔊', desc: 'Найди верное ударение — Долина эха ждёт', pool: () => STRESS },
    { id: 'duel', name: 'Магическая дуэль', e: '⚔️', desc: 'Сразись с Тёмным учеником: кто ответит вернее', duel: true, timer: 8, pool: () => [...LETTERS, ...COMMAS, ...STRESS] },
  ];

  function openGames() {
    const m = C.modal(`<h2>🎲 Мини-игры</h2><p class="muted">Быстрые испытания на опыт и эссенцию</p>
      <div class="games">${GAMES.map((g) => {
        const locked = !g.free && !isMag();
        const best = (S().game[g.id] || {}).best;
        return `<button class="game ${locked ? 'locked' : ''}" data-g="${g.id}"><span class="ge">${g.e}</span><span class="sbody"><b>${g.name}${g.free ? ' <span class="free-badge">FREE</span>' : ` ${magBadge}`}</b><small>${g.desc}</small>${best != null ? `<small class="sinc">Рекорд: ${best}/10</small>` : ''}</span><span class="sprice">${locked ? '👑' : '▶'}</span></button>`;
      }).join('')}</div><button class="btn ghost" data-close>Закрыть</button>`, { cls: 'sheet' });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('.game');
      if (!b) return;
      const g = GAMES.find((x) => x.id === b.dataset.g);
      m.close();
      if (!g.free && !isMag()) return openMagister();
      startGame(g.id);
    });
  }

  function startGame(id) {
    const g = GAMES.find((x) => x.id === id);
    if (!g.free && !isMag()) return openMagister();
    const qs = shuffle(g.pool()).slice(0, 10);
    const root = $('#lesson');
    root.innerHTML = `<div class="l-head"><button class="l-close" aria-label="Закрыть">✕</button><div class="l-prog"><i></i></div><span class="g-score">0</span></div>
      <div class="l-body"><div class="slide game-screen"></div></div>
      <div class="l-foot"><div class="l-feedback"></div><div class="l-btns"><button class="btn primary l-main" disabled>Выбери ответ</button></div></div>`;
    root.classList.remove('hidden');
    const scr = $('.game-screen', root), prog = $('.l-prog i', root), sc = $('.g-score', root), fb = $('.l-feedback', root), main = $('.l-main', root);
    let i = 0, score = 0, bot = 0, timerId = null;
    const close = () => { clearInterval(timerId); root.classList.add('hidden'); root.innerHTML = ''; C.go(C.tab); };
    $('.l-close', root).onclick = close;
    const feedback = (kind, html) => { fb.className = 'l-feedback ' + (kind || ''); fb.innerHTML = html || ''; root.classList.toggle('fb-open', !!kind); };

    const ask = () => {
      const q = qs[i];
      feedback(null);
      prog.style.width = (i / qs.length) * 100 + '%';
      main.disabled = true; main.textContent = 'Выбери ответ';
      scr.innerHTML = `<div class="g-title">${g.e} ${g.name}${g.duel ? `<span class="duel-score">Ты ${score} : ${bot} 🧛 Тёмный ученик</span>` : ''}</div>
        ${g.timer ? '<div class="g-timer"><i></i></div>' : ''}
        <div class="g-card">${q.q}</div>
        <div class="g-opts ${q.big ? 'big' : ''}">${q.options.map((o, j) => `<button class="opt" data-j="${j}">${o}</button>`).join('')}</div>`;
      let answered = false;
      const finishQ = (j) => {
        if (answered) return;
        answered = true; clearInterval(timerId);
        const ok = j === q.correct;
        scr.querySelectorAll('.opt').forEach((b, k) => { b.disabled = true; if (k === q.correct) b.classList.add('right'); else if (k === j) b.classList.add('wrong'); });
        if (q.fill) scr.querySelector('.g-card').innerHTML = `<span class="gw">${q.fill(q.correct)}</span>`;
        if (g.duel && Math.random() < 0.7) bot++;
        if (ok) {
          score++; sc.textContent = score;
          C.reward(4, 1, { quiet: true }); C.sound('ok'); C.buzz(12);
          if (g.id === 'forest') bump('forest');
          feedback('ok', `<b>${C.pick(C.GOOD)}</b> <span class="fb-rew">+4 XP · +1 ${coin}</span><div>${q.why}</div>`);
        } else {
          C.sound('err'); C.buzz([20, 40, 20]);
          feedback('bad', `<b>${j < 0 ? 'Время вышло! ⏰' : C.pick(C.BAD)}</b><div>${q.why}</div>`);
        }
        if (g.duel) scr.querySelector('.duel-score').textContent = `Ты ${score} : ${bot} 🧛 Тёмный ученик`;
        main.disabled = false;
        main.textContent = i < qs.length - 1 ? 'Дальше' : 'Итоги';
        main.onclick = () => { i++; i < qs.length ? ask() : end(); };
      };
      scr.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => finishQ(+b.dataset.j)));
      if (g.timer) {
        const bar = scr.querySelector('.g-timer i');
        const t0 = Date.now();
        timerId = setInterval(() => {
          const left = 1 - (Date.now() - t0) / (g.timer * 1000);
          bar.style.width = Math.max(0, left) * 100 + '%';
          if (left <= 0) finishQ(-1);
        }, 100);
      }
    };

    const end = () => {
      prog.style.width = '100%';
      const rec = S().game[id] || {};
      const newBest = rec.best == null || score > rec.best;
      S().game[id] = { best: Math.max(score, rec.best || 0), plays: (rec.plays || 0) + 1 };
      C.save();
      const win = g.duel ? score > bot : score >= 8;
      const bx = win ? 20 : 5, be = win ? 10 : 2;
      C.reward(bx, be, { quiet: true });
      if (win) { C.confetti(160); C.sound('level'); }
      feedback(null);
      scr.innerHTML = `<div class="intro final"><div class="big-emoji">${g.duel ? (win ? '🏆' : score === bot ? '🤝' : '🧛') : win ? '🌟' : g.e}</div>
        <h2>${g.duel ? (win ? 'Победа в дуэли!' : score === bot ? 'Ничья!' : 'Тёмный ученик победил… пока') : win ? 'Блестяще!' : 'Хорошая тренировка!'}</h2>
        <div class="score-ring" style="--p:${score * 10}"><b>${g.duel ? `${score}:${bot}` : `${score}/10`}</b></div>
        ${newBest && score > 0 ? '<p class="ok-text">🎉 Новый рекорд!</p>' : ''}
        <p class="lead">Бонус за игру: +${bx} XP и +${be} ${coin}</p></div>`;
      main.textContent = 'Ещё раз';
      main.onclick = () => { root.innerHTML = ''; startGame(id); };
    };
    ask();
  }
  App.startGame = startGame;
  App.openMagister = openMagister;
})();

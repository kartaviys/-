/* Мини-игры для закрепления тем (вкладка «Мини-игры») и информация о версии ПРО */
(() => {
  const { h, core: C } = App;
  const $ = (s, r = document) => r.querySelector(s);
  const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

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
    ['Покрытые снегом _ деревья стояли неподвижно.', 0, 'Причастный оборот перед определяемым словом не обособляется.'],
    ['Деревья _ покрытые снегом, стояли неподвижно.', 1, 'Причастный оборот после определяемого слова обособляется.'],
    ['Он слушал _ затаив дыхание.', 1, 'Деепричастный оборот обособляется.'],
    ['К счастью _ дождь закончился.', 1, '«К счастью» — вводное слово.'],
    ['Мама _ посмотри на небо!', 1, '«Мама» — обращение.'],
    ['Мы шли по дороге _ и пели песни.', 0, 'Однородные сказуемые с одиночным «и» — без запятой.'],
    ['Солнце село _ и стало прохладно.', 1, 'Сложносочинённое предложение: две основы, соединённые «и».'],
    ['Я знаю _ что ты придёшь.', 1, 'Сложноподчинённое предложение: запятая перед «что».'],
    ['Он работал не покладая рук _ до самого вечера.', 0, '«Не покладая рук» — фразеологизм, не обособляется.'],
    ['Несмотря на дождь _ мы пошли гулять.', 1, 'Обстоятельство с предлогом «несмотря на» обособляется.'],
    ['Кот _ свернувшись клубком, спал на диване.', 1, 'Деепричастный оборот выделяется с двух сторон.'],
    ['Книга _ лежавшая на столе, оказалась моей.', 1, 'Причастный оборот после определяемого слова.'],
    ['Лежавшая на столе _ книга оказалась моей.', 0, 'Причастный оборот перед определяемым словом.'],
    ['Наверное _ завтра будет снег.', 1, '«Наверное» — вводное слово.'],
  ].map(([t, c, why]) => ({ q: `<span class="gs">${t.replace('_', '<i>?</i>')}</span>`, options: ['Без запятой', 'Нужна запятая'], correct: c, why }));


  const INTRO = [
    ['Дом, может быть, восстановят.', 0], ['Он может быть полезным.', 1], ['Кажется, мы опаздываем.', 0], ['Луна кажется бледной.', 1],
    ['Осёл, возможно, ещё поумнеет.', 0], ['Ошибку возможно исправить.', 1], ['Лес, видно, расположен севернее.', 0], ['Из окна видно лес.', 1],
    ['Мой друг, верно, задержится.', 0], ['Эти данные внесены верно.', 1], ['Он был, однако, угрюм.', 0], ['Однако он ничего не знает.', 1],
    ['Действительно, его работа интересна.', 0], ['Его работа действительно интересна.', 1], ['Если наступит весна, значит, будет тепло.', 0], ['Бороться — значит победить.', 1],
  ].map(([t, c]) => {
    const plain = t.replace(/,\s(может быть|кажется|возможно|видно|верно|однако|значит),?/i, ' $1').replace(/^(Кажется|Действительно),/, '$1');
    return { q: `<span class="gs">${c === 0 ? plain : t}</span>`, options: ['вводное — нужны запятые', 'не вводное'], correct: c, why: c === 0 ? `Вводное: <b>${t}</b>` : `Член предложения, запятые не нужны: <b>${t}</b>` };
  });

  /* ===== Лабиринт: в каждой комнате выбери дверь с верным написанием ===== */
  const MAZE = [
    ['прекрасный', 'прикрасный'], ['пригорок', 'прегорок'], ['искусство', 'исскуство'], ['рассчитать', 'расчитать'],
    ['расчёт', 'рассчёт'], ['бесполезный', 'безполезный'], ['безвкусный', 'бесвкусный'], ['деревянный', 'деревяный'],
    ['кожаный', 'кожанный'], ['серебряный', 'серебрянный'], ['стеклянный', 'стекляный'], ['ветреный', 'ветренный'],
    ['чересчур', 'черезчур'], ['предыстория', 'предистория'], ['подыграть', 'подиграть'], ['цыплёнок', 'циплёнок'],
    ['цирк', 'цырк'], ['огурцы', 'огурци'], ['ключик', 'ключек'], ['замочек', 'замочик'], ['по-моему', 'по моему', 'помоему'],
    ['полгорода', 'пол-города', 'пол города'], ['пол-яблока', 'полъяблока', 'пол яблока'], ['кое-где', 'коегде', 'кое где'],
    ['несмотря на дождь', 'не смотря на дождь'], ['привокзальный', 'превокзальный'],
  ];
  /* ===== Алхимия: собери зелье из подходящих ингредиентов ===== */
  const POTIONS = [
    { name: 'Зелье причастий', c: '#8b5cf6', d: 'Добавь только причастия', ok: ['читающий', 'построенный', 'бегущий', 'нарисованный'], no: ['читая', 'красный', 'деревянный', 'построив'] },
    { name: 'Эликсир вводных слов', c: '#f59e0b', d: 'Добавь только вводные слова', ok: ['конечно', 'по-моему', 'к счастью', 'во-первых'], no: ['вдруг', 'даже', 'якобы', 'почти'] },
    { name: 'Настойка НН', c: '#10b981', d: 'Добавь слова, где пишется НН', ok: ['деревянный', 'стеклянный', 'прочитанный', 'искусственный'], no: ['кожаный', 'серебряный', 'ветреный', 'юный'] },
    { name: 'Отвар деепричастий', c: '#ec4899', d: 'Добавь только деепричастия', ok: ['читая', 'построив', 'улыбаясь', 'будучи'], no: ['читающий', 'улыбка', 'построенный', 'быстро'] },
    { name: 'Зелье приставки ПРИ-', c: '#0ea5e9', d: 'Добавь слова с приставкой ПРИ-', ok: ['приехать', 'пригород', 'приклеить', 'привокзальный'], no: ['прекрасный', 'преградить', 'преемник', 'пребывать'] },
  ];
  /* ===== Сортировка: отправь слово в нужную корзину ===== */
  const SORTS = [
    { name: 'ПРЕ или ПРИ?', bins: ['ПРЕ', 'ПРИ'], items: [['пр_красный', 0], ['пр_ехать', 1], ['пр_градить', 0], ['пр_школьный', 1], ['пр_мудрый', 0], ['пр_морский', 1], ['пр_клеить', 1], ['пр_рвать', 0]] },
    { name: 'Н или НН?', bins: ['Н', 'НН'], items: [['деревя_ый', 1], ['кожа_ый', 0], ['стекля_ый', 1], ['серебря_ый', 0], ['ветре_ый', 0], ['оловя_ый', 1], ['кури_ый', 0], ['жаре_ый', 0]] },
    { name: 'Слитно, раздельно или через дефис?', bins: ['слитно', 'раздельно', 'дефис'], items: [['(пол)яблока', 2], ['(пол)города', 0], ['(по)моему', 2], ['(не)смотря на дождь', 0], ['(в)течение дня', 1], ['(кое)где', 2], ['(во)время урока', 1], ['(на)встречу другу', 0]] },
    { name: 'Вводное слово или нет?', bins: ['вводное', 'член предложения'], items: [['<i>Конечно</i>, он придёт.', 0], ['Он <i>может быть</i> полезным.', 1], ['<i>Кажется</i>, дождь.', 0], ['Луна <i>кажется</i> бледной.', 1], ['<i>К счастью</i>, всё обошлось.', 0], ['Данные внесены <i>верно</i>.', 1]] },
  ];

  const GAMES = [
    { id: 'maze', name: 'Лабиринт грамотности', e: '🌀', topic: 'Орфография · выбирай двери с верным написанием', kind: 'maze' },
    { id: 'alchemy', name: 'Алхимия', e: '⚗️', topic: 'Свари зелье из подходящих слов', kind: 'alchemy' },
    { id: 'sort', name: 'Сортировщик', e: '🗂️', topic: 'Разложи слова по корзинам: ПРЕ/ПРИ, Н/НН и другие', kind: 'sort' },
    { id: 'comma', name: 'Запятая-молния', e: '⚡', topic: 'Пунктуация · задания 16–19 · на время', timer: 8, pool: () => COMMAS },
    { id: 'letters', name: 'Пропущенная буква', e: '🔤', topic: 'Орфография · корни и приставки', pool: () => LETTERS },
    { id: 'stress', name: 'Эхо ударений', e: '🔊', topic: 'Задание 4 · ударения', pool: () => STRESS },
    { id: 'intro', name: 'Вводное или нет?', e: '🧩', topic: 'Задание 18 · вводные слова', pool: () => INTRO },
  ];

  /* ===== ПРО ===== */
  const CMP = [
    ['Теория и задания 1–26', '✓', '✓'], ['Задание 27 (сочинение)', '—', '✓'], ['Тренировки и зачёты', '✓', '✓'], ['Мини-игры', 'базовые', 'по каждому заданию'],
    ['Проверка сочинений экспертом ЕГЭ', '—', '✓'], ['Материал: как готовиться к сочинению', '—', '✓'], ['Индивидуальный учёт ошибок и их отработка', '—', '✓'],
    ['Пробники раз в месяц', '—', '✓'], ['Система повторения', '—', '✓'], ['Реклама', 'есть', 'нет'],
  ];
  function openPro() {
    C.modal(`<div class="pro">
      <div class="pro-hero"><div class="pro-crown">⭐</div><h2>ЕГЭ Квест ПРО</h2><p>Платная версия приложения</p></div>
      <div class="pro-why"><b>Тест — это только 54 балла ЕГЭ.</b> Остальные <b>46 баллов</b> — сочинение, и его нужно отрабатывать.</div>
      <table class="pro-cmp"><thead><tr><th></th><th>Бесплатно</th><th class="pro-col">ПРО</th></tr></thead>
        <tbody>${CMP.map(([a, f, p]) => `<tr><td>${a}</td><td class="${f === '—' ? 'no' : ''}">${f}</td><td class="pro-col">${p}</td></tr>`).join('')}</tbody></table>
      <button class="btn ghost" data-close>Понятно</button></div>`, { cls: 'wide' });
  }
  App.openPro = openPro;
  App.proCard = () => {
    const c = h(`<div class="card pro-card"><span>⭐</span><div><b>Версия ПРО</b><small>Проверка сочинений, материал по подготовке к сочинению, пробники, учёт ошибок</small></div><button class="btn gold">Подробнее</button></div>`);
    c.querySelector('button').addEventListener('click', openPro);
    return c;
  };

  /* Короткий интерактивный ролик о ПРО — изредка после пройденного блока */
  App.proAd = () => {
    const m = C.modal(`<div class="ad">
      <div class="ad-bars">${[0, 1, 2, 3].map(() => '<i><b></b></i>').join('')}</div>
      <button class="ad-x hidden" data-close aria-label="Закрыть">✕</button>
      <div class="ad-stage"></div>
    </div>`, { cls: 'ad-modal', sticky: true });
    const st = m.el.querySelector('.ad-stage'), bars = [...m.el.querySelectorAll('.ad-bars b')];
    let k = -1, timer = null;
    const frames = [
      () => `<div class="ad-f"><div class="ad-big"><span class="ad-num" data-to="54">0</span><small>баллов</small></div><p>Столько даёт <b>тестовая часть</b> ЕГЭ — задания 1–26.</p><div class="ad-pie" style="--p:54"></div></div>`,
      () => `<div class="ad-f"><p class="ad-q">А где остальные <b>46 баллов</b>?</p><div class="ad-opts"><button data-a="0">В заданиях 1–26</button><button data-a="1">В сочинении</button><button data-a="0">Дают за явку 😄</button></div></div>`,
      () => `<div class="ad-f"><div class="ad-emoji">✍️</div><p><b>46 баллов — сочинение!</b> Это почти половина результата. Его нужно отрабатывать: писать, получать проверку и исправлять ошибки.</p></div>`,
      () => `<div class="ad-f"><div class="ad-emoji">⭐</div><p class="ad-q">В версии <b>ПРО</b>:</p><ul class="ad-list"><li>✓ проверка твоих сочинений</li><li>✓ материал: как готовиться к сочинению</li><li>✓ пробники и учёт ошибок</li></ul><button class="btn gold ad-more">Узнать о ПРО</button><button class="btn ghost ad-skip" data-close>Не сейчас</button></div>`,
    ];
    const go = (n) => {
      clearTimeout(timer);
      k = n;
      bars.forEach((b, i) => { b.style.transition = 'none'; b.style.width = i < k ? '100%' : '0'; });
      st.innerHTML = frames[k]();
      const num = st.querySelector('.ad-num');
      if (num) { const t0 = performance.now(); const tick = (t) => { const q = Math.min(1, (t - t0) / 1200); num.textContent = Math.round(54 * q); if (q < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
      const cur = bars[k];
      const auto = k !== 1 && k < frames.length - 1;
      requestAnimationFrame(() => { cur.style.transition = auto ? 'width 4s linear' : 'width .4s'; cur.style.width = auto || k === frames.length - 1 ? '100%' : '0'; });
      if (auto) timer = setTimeout(() => go(k + 1), 4000);
      st.querySelectorAll('.ad-opts button').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.a === '1') { b.classList.add('right'); setTimeout(() => go(2), 700); } else { b.classList.add('wrong'); b.disabled = true; }
      }));
      // закрыть ролик можно только в конце
      if (k === frames.length - 1) m.el.querySelector('.ad-x').classList.remove('hidden');
      const more = st.querySelector('.ad-more');
      if (more) more.addEventListener('click', () => { m.close(); openPro(); });
    };
    st.addEventListener('click', (e) => { if (k !== 1 && k < frames.length - 1 && !e.target.closest('button')) go(k + 1); });
    go(0);
  };

  App.renderGames = (v) => {
    v.appendChild(h(`<div class="card"><div class="eyebrow">Мини-игры</div><h2>Закрепи темы в игре</h2><p class="muted small">Лабиринт, алхимия, сортировка и быстрые раунды. За каждую игру — опыт.</p></div>`));
    const list = h(`<div class="games">${GAMES.map((g) => {
      const rec = (C.S.game || {})[g.id] || {};
      return `<button class="game ${g.kind ? 'new' : ''}" data-g="${g.id}"><span class="ge">${g.e}</span><span class="sbody"><b>${g.name}</b><small>${g.topic}</small>${rec.best != null ? `<small class="sinc">Рекорд: ${rec.best}${rec.max ? '/' + rec.max : '/10'}</small>` : ''}</span><span class="sprice">▶</span></button>`;
    }).join('')}</div>`);
    list.querySelectorAll('.game').forEach((b) => b.addEventListener('click', () => startGame(b.dataset.g)));
    v.appendChild(list);
    v.appendChild(h(`<div class="card pro-games"><b>⭐ В версии ПРО</b><p class="muted small">Мини-игры по каждому заданию ЕГЭ — от 1 до 26.</p></div>`));
    v.lastChild.addEventListener('click', openPro);
    v.appendChild(App.proCard());
  };

  /* Общая оболочка игры */
  function shell(g) {
    const root = $('#lesson');
    root.innerHTML = `<div class="l-head"><button class="l-close" aria-label="Закрыть">✕</button><div class="l-progbox"><div class="l-prog"><i></i></div></div><span class="g-score">0</span></div>
      <div class="l-body"><div class="slide game-screen"></div></div>
      <div class="l-foot"><div class="l-feedback"></div><div class="l-btns"><button class="btn primary l-main" disabled>…</button></div></div>`;
    root.classList.remove('hidden');
    const o = { root, scr: $('.game-screen', root), prog: $('.l-prog i', root), sc: $('.g-score', root), fb: $('.l-feedback', root), main: $('.l-main', root), timers: [] };
    o.close = () => { o.timers.forEach(clearInterval); root.classList.add('hidden'); root.innerHTML = ''; App.$('.tabbar [data-tab="games"]').click(); };
    $('.l-close', root).onclick = o.close;
    o.feedback = (kind, html) => { o.fb.className = 'l-feedback ' + (kind || ''); o.fb.innerHTML = html || ''; root.classList.toggle('fb-open', !!kind); };
    o.foot = (label, onClick, enabled = true) => { o.main.textContent = label; o.main.disabled = !enabled; o.main.onclick = onClick; };
    o.end = (score, max) => {
      o.prog.style.width = '100%';
      const S = C.S; S.game = S.game || {};
      const rec = S.game[g.id] || {};
      const newBest = rec.best == null || score > rec.best;
      S.game[g.id] = { best: Math.max(score, rec.best || 0), max, plays: (rec.plays || 0) + 1 };
      C.save(); C.unlock('game');
      const xp = Math.round((score / max) * 30);
      C.reward(xp, 0, { quiet: true });
      const great = score >= max * 0.8;
      if (great) C.confetti(150);
      o.feedback(null);
      o.scr.innerHTML = `<div class="intro final"><div class="big-emoji">${great ? '🌟' : g.e}</div><h2>${great ? 'Блестяще!' : 'Хорошая тренировка!'}</h2>
        <div class="score-ring" style="--p:${Math.round((score / max) * 100)}"><b>${score}/${max}</b></div>${newBest && score > 0 ? '<p class="ok-text">🎉 Новый рекорд!</p>' : ''}<p class="lead">+${xp} XP</p></div>`;
      o.foot('Ещё раз', () => startGame(g.id));
    };
    return o;
  }

  function startGame(id) {
    const g = GAMES.find((x) => x.id === id);
    if (g.kind === 'maze') return mazeGame(g);
    if (g.kind === 'alchemy') return alchemyGame(g);
    if (g.kind === 'sort') return sortGame(g);
    return quizGame(g);
  }

  function mazeGame(g) {
    const o = shell(g);
    const rooms = shuffle(MAZE).slice(0, 8).map((r) => ({ ok: r[0], doors: shuffle(r) }));
    let i = 0, lives = 3, score = 0;
    const draw = () => {
      o.prog.style.width = (i / rooms.length) * 100 + '%';
      const r = rooms[i];
      o.scr.innerHTML = `<div class="g-title">${g.e} ${g.name}</div>
        <div class="maze-top"><span>Комната ${i + 1} из ${rooms.length}</span><span class="lives">${'❤️'.repeat(lives)}${'🤍'.repeat(3 - lives)}</span></div>
        <div class="maze">${rooms.map((_, k) => `<span class="mz ${k < i ? 'done' : k === i ? 'cur' : ''}">${k === i ? '🧭' : k < i ? '✓' : ''}</span>`).join('<i></i>')}<i></i><span class="mz goal">💎</span></div>
        <p class="maze-q">Перед тобой ${r.doors.length} двери. Открой ту, где слово написано <b>верно</b>:</p>
        <div class="doors">${r.doors.map((d, k) => `<button class="door" data-k="${k}"><span class="door-arch">🚪</span><b>${d}</b></button>`).join('')}</div>`;
      o.foot('Выбери дверь', null, false);
      o.scr.querySelectorAll('.door').forEach((b) => b.addEventListener('click', () => {
        const ok = r.doors[+b.dataset.k] === r.ok;
        if (!ok) {
          lives--; b.classList.add('wall'); b.disabled = true; b.querySelector('.door-arch').textContent = '🧱'; C.buzz([20, 40, 20]);
          o.feedback('bad', `<b>Тупик! 🧱</b><div>«${r.doors[+b.dataset.k]}» — так не пишется.</div>`);
          o.scr.querySelector('.lives').textContent = '❤️'.repeat(lives) + '🤍'.repeat(3 - lives);
          if (lives <= 0) { o.scr.querySelectorAll('.door').forEach((x) => (x.disabled = true)); o.foot('Итоги', () => o.end(score, rooms.length)); }
          return;
        }
        score++; o.sc.textContent = score;
        b.classList.add('open'); o.scr.querySelectorAll('.door').forEach((x) => (x.disabled = true));
        o.feedback('ok', `<b>${C.pick(C.GOOD)}</b><div>Верно: <b>${r.ok}</b></div>`);
        const last = i === rooms.length - 1;
        o.foot(last ? 'К сокровищу 💎' : 'В следующую комнату ▸', () => { o.feedback(null); if (last) o.end(score, rooms.length); else { i++; draw(); } });
      }));
    };
    draw();
  }

  function alchemyGame(g) {
    const o = shell(g);
    const recipes = shuffle(POTIONS).slice(0, 3);
    let ri = 0, score = 0, mistakes = 0;
    const draw = () => {
      const r = recipes[ri];
      const ings = shuffle([...r.ok.map((w) => [w, 1]), ...r.no.map((w) => [w, 0])]);
      let added = 0;
      o.prog.style.width = (ri / recipes.length) * 100 + '%';
      o.scr.innerHTML = `<div class="g-title">${g.e} ${g.name} · зелье ${ri + 1} из ${recipes.length}</div>
        <div class="recipe"><b>📜 ${r.name}</b><span>${r.d}. Нужно 4 ингредиента.</span></div>
        <div class="cauldron"><div class="cd-liquid" style="--c:${r.c}"><i style="height:8%"></i></div><div class="cd-pot">🫕</div><div class="cd-fx"></div></div>
        <div class="ings">${ings.map(([w, ok], k) => `<button class="ing" data-k="${k}"><span>🧪</span>${w}</button>`).join('')}</div>`;
      o.foot('Добавляй ингредиенты', null, false);
      const liq = o.scr.querySelector('.cd-liquid i'), fx = o.scr.querySelector('.cd-fx');
      o.scr.querySelectorAll('.ing').forEach((b) => b.addEventListener('click', () => {
        const [w, ok] = ings[+b.dataset.k];
        b.disabled = true;
        if (!ok) {
          mistakes++; b.classList.add('bad'); C.buzz([20, 40, 20]);
          fx.textContent = '💨'; fx.className = 'cd-fx puff'; void fx.offsetWidth; fx.classList.add('go');
          o.feedback('bad', `<b>Пш-ш-ш! 💨</b><div>«${w}» не подходит: ${r.d.toLowerCase()}.</div>`);
          return;
        }
        added++; score++; o.sc.textContent = score; b.classList.add('in');
        liq.style.height = 8 + added * 23 + '%';
        fx.textContent = '✨'; fx.className = 'cd-fx'; void fx.offsetWidth; fx.classList.add('go');
        o.feedback('ok', `<b>Бульк! ✨</b><div>«${w}» — подходит.</div>`);
        if (added === 4) {
          o.scr.querySelectorAll('.ing').forEach((x) => (x.disabled = true));
          o.scr.querySelector('.cauldron').classList.add('ready');
          o.feedback('ok', `<b>${r.name} готово! 🎉</b>`);
          const last = ri === recipes.length - 1;
          o.foot(last ? 'Итоги' : 'Следующее зелье ▸', () => { o.feedback(null); if (last) o.end(Math.max(0, score - mistakes), recipes.length * 4); else { ri++; draw(); } });
        }
      }));
    };
    draw();
  }

  function sortGame(g) {
    const o = shell(g);
    const rounds = shuffle(SORTS).slice(0, 3);
    const total = rounds.reduce((a, r) => a + Math.min(6, r.items.length), 0);
    let ri = 0, score = 0, done = 0;
    const round = () => {
      const r = rounds[ri];
      const items = shuffle(r.items).slice(0, 6);
      let k = 0;
      const one = () => {
        o.prog.style.width = (done / total) * 100 + '%';
        const [w, c] = items[k];
        o.scr.innerHTML = `<div class="g-title">${g.e} ${r.name}</div>
          <div class="sort-left">Раунд ${ri + 1} из ${rounds.length} · слово ${k + 1} из ${items.length}</div>
          <div class="sort-card">${w.replace('_', '<i>_</i>')}</div>
          <div class="sort-bins b${r.bins.length}">${r.bins.map((b, j) => `<button class="sbin" data-j="${j}"><span>📥</span>${b}</button>`).join('')}</div>`;
        o.foot('Выбери корзину', null, false);
        o.scr.querySelectorAll('.sbin').forEach((b) => b.addEventListener('click', () => {
          const j = +b.dataset.j, ok = j === c;
          o.scr.querySelectorAll('.sbin').forEach((x) => { x.disabled = true; });
          const card = o.scr.querySelector('.sort-card');
          const br = b.getBoundingClientRect(), cr = card.getBoundingClientRect();
          card.style.setProperty('--dx', br.left + br.width / 2 - (cr.left + cr.width / 2) + 'px');
          card.style.setProperty('--dy', br.top - cr.top + 'px');
          card.classList.add(ok ? 'fly' : 'nope');
          if (ok) { score++; o.sc.textContent = score; b.classList.add('right'); }
          else { b.classList.add('wrong'); o.scr.querySelectorAll('.sbin')[c].classList.add('right'); C.buzz([20, 40, 20]); }
          const ans = r.bins[c];
          o.feedback(ok ? 'ok' : 'bad', ok ? `<b>${C.pick(C.GOOD)}</b>` : `<b>Не та корзина</b><div>Правильно: <b>${ans}</b></div>`);
          done++;
          const lastW = k === items.length - 1, lastR = ri === rounds.length - 1;
          o.foot(lastW && lastR ? 'Итоги' : lastW ? 'Следующий раунд ▸' : 'Дальше', () => { o.feedback(null); if (!lastW) { k++; one(); } else if (!lastR) { ri++; round(); } else o.end(score, total); });
        }));
      };
      one();
    };
    round();
  }

  function quizGame(g) {
    const id = g.id;
    const qs = shuffle(g.pool()).slice(0, 10);
    const root = $('#lesson');
    root.innerHTML = `<div class="l-head"><button class="l-close" aria-label="Закрыть">✕</button><div class="l-progbox"><div class="l-prog"><i></i></div></div><span class="g-score">0</span></div>
      <div class="l-body"><div class="slide game-screen"></div></div>
      <div class="l-foot"><div class="l-feedback"></div><div class="l-btns"><button class="btn primary l-main" disabled>Выбери ответ</button></div></div>`;
    root.classList.remove('hidden');
    const scr = $('.game-screen', root), prog = $('.l-prog i', root), sc = $('.g-score', root), fb = $('.l-feedback', root), main = $('.l-main', root);
    let i = 0, score = 0, timerId = null;
    const close = () => { clearInterval(timerId); root.classList.add('hidden'); root.innerHTML = ''; App.$('.tabbar [data-tab="games"]').click(); };
    $('.l-close', root).onclick = close;
    const feedback = (kind, html) => { fb.className = 'l-feedback ' + (kind || ''); fb.innerHTML = html || ''; root.classList.toggle('fb-open', !!kind); };
    const ask = () => {
      const q = qs[i];
      feedback(null);
      prog.style.width = (i / qs.length) * 100 + '%';
      main.disabled = true; main.textContent = 'Выбери ответ';
      scr.innerHTML = `<div class="g-title">${g.e} ${g.name}</div>${g.timer ? '<div class="g-timer"><i></i></div>' : ''}<div class="g-card">${q.q}</div>
        <div class="g-opts ${q.big ? 'big' : ''}">${q.options.map((o, j) => `<button class="opt" data-j="${j}">${o}</button>`).join('')}</div>`;
      let answered = false;
      const finishQ = (j) => {
        if (answered) return;
        answered = true; clearInterval(timerId);
        const ok = j === q.correct;
        scr.querySelectorAll('.opt').forEach((b, k) => { b.disabled = true; if (k === q.correct) b.classList.add('right'); else if (k === j) b.classList.add('wrong'); });
        if (q.fill) scr.querySelector('.g-card').innerHTML = `<span class="gw">${q.fill(q.correct)}</span>`;
        if (ok) { score++; sc.textContent = score; C.sound('ok'); C.buzz(12); feedback('ok', `<b>${C.pick(C.GOOD)}</b><div>${q.why}</div>`); }
        else { C.sound('err'); C.buzz([20, 40, 20]); feedback('bad', `<b>${j < 0 ? 'Время вышло! ⏰' : C.pick(C.BAD)}</b><div>${q.why}</div>`); }
        main.disabled = false; main.textContent = i < qs.length - 1 ? 'Дальше' : 'Итоги';
        main.onclick = () => { i++; i < qs.length ? ask() : end(); };
      };
      scr.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => finishQ(+b.dataset.j)));
      if (g.timer) {
        const bar = scr.querySelector('.g-timer i'), t0 = Date.now();
        timerId = setInterval(() => { const left = 1 - (Date.now() - t0) / (g.timer * 1000); bar.style.width = Math.max(0, left) * 100 + '%'; if (left <= 0) finishQ(-1); }, 100);
      }
    };
    const end = () => {
      prog.style.width = '100%';
      const S = C.S; S.game = S.game || {};
      const rec = S.game[id] || {};
      const newBest = rec.best == null || score > rec.best;
      S.game[id] = { best: Math.max(score, rec.best || 0), plays: (rec.plays || 0) + 1 };
      C.save(); C.unlock('game');
      const xp = score * 3;
      C.reward(xp, 0, { quiet: true });
      if (score >= 8) { C.confetti(150); C.sound('level'); }
      feedback(null);
      scr.innerHTML = `<div class="intro final"><div class="big-emoji">${score >= 8 ? '🌟' : g.e}</div><h2>${score >= 8 ? 'Блестяще!' : 'Хорошая тренировка!'}</h2>
        <div class="score-ring" style="--p:${score * 10}"><b>${score}/10</b></div>${newBest && score > 0 ? '<p class="ok-text">🎉 Новый рекорд!</p>' : ''}<p class="lead">+${xp} XP</p></div>`;
      main.textContent = 'Ещё раз'; main.onclick = () => startGame(id);
    };
    ask();
  }
})();

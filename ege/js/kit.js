/* Общий набор для уроков: разметка примеров, фазы слайда, карточки, вопросы, сортировка */
(() => {
  const { h } = App;
  const M = Markup;

  /* ===== Помощники для предложений ===== */
  const norm = (w) => w.toLowerCase().replace(/ё/g, 'е');
  const P = (t) => M.parse(t);
  // n-е вхождение слова
  const W = (S, w, n = 0) => { let c = 0; for (let i = 0; i < S.words.length; i++) if (norm(S.words[i]) === norm(w) && c++ === n) return i; throw new Error('нет слова ' + w); };
  // фраза, начиная поиск с позиции after
  const R = (S, ph, after) => M.find(S, ph, after == null ? 0 : after);

  /* Готовая разметка по краткому описанию: s/p — [индекс, цвет основы] */
  function marks(spec) {
    const m = Object.assign(M.emptyMarks(), M.clone(spec));
    m.mem = {};
    (spec.s || []).forEach(([i, b = 1]) => (m.mem[i] = { t: 's', b }));
    (spec.p || []).forEach(([i, b = 1]) => (m.mem[i] = { t: 'p', b }));
    delete m.s; delete m.p;
    return m;
  }
  const merge = (a, b) => {
    const r = M.clone(a);
    for (const k of ['def', 'circ', 'obj', 'cross', 'bars', 'rings', 'boxes']) r[k] = [...new Set([...(r[k] || []), ...(b[k] || [])])];
    r.arrows = [...(r.arrows || []), ...(b.arrows || [])];
    r.mem = Object.assign({}, r.mem, b.mem);
    r.labels = Object.assign({}, r.labels, b.labels);
    r.gm = Object.assign({}, r.gm, b.gm);
    for (const [k, v] of Object.entries(b.labels || {})) if (v === null) delete r.labels[k];
    return r;
  };

  /* ===== Компоненты слайдов ===== */
  function shell(body, { chip, title, lead }) {
    const el = h(`<div class="slide">${chip ? `<div class="step-chip">${chip}</div>` : ''}${title ? `<h2>${title}</h2>` : ''}${lead ? `<p class="lead">${lead}</p>` : ''}<div class="phases"></div></div>`);
    body.appendChild(el);
    return el.querySelector('.phases');
  }

  // Фазы внутри одного слайда: следующая открывается, когда закончилась предыдущая
  function phases(host, api, list, endLabel = 'Дальше') {
    let i = 0;
    const run = () => {
      if (i >= list.length) { api.foot({ label: endLabel }); return; }
      const box = h('<div class="phase"></div>');
      host.appendChild(box);
      list[i++](box, api, run);
      requestAnimationFrame(() => box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    };
    run();
  }

  // Карточки появляются по одной
  const revealPh = (items, { btn = 'Дальше ▸' } = {}) => (box, api, done) => {
    let k = 0;
    const add = () => { const el = h(`<div class="rv">${items[k++]}</div>`); box.appendChild(el); return el; };
    const one = () => {
      add().scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (k >= items.length) { done(); return; }
      api.foot({ label: btn, onClick: one, extraLabel: items.length - k > 1 ? 'Показать всё' : null, onExtra: () => { while (k < items.length - 1) add(); one(); } });
    };
    one();
  };
  const htmlPh = (html) => (box, api, done) => { box.innerHTML = html; done(); };

  // Пошаговый разбор предложения: каждое нажатие добавляет разметку и пояснение
  const demoPh = (text, steps, { title } = {}) => (box, api, done) => {
    const S = P(text);
    if (title) box.appendChild(h(`<div class="demo-title">${title}</div>`));
    let cur = M.emptyMarks();
    const board = new M.Board(box, S, { readOnly: true, marks: cur });
    board.el.classList.add('demo-board');
    const notes = h('<ol class="demo-notes"></ol>');
    box.appendChild(notes);
    let k = 0;
    const one = () => {
      const st = steps[k++](S);
      cur = merge(cur, st.m || {});
      board.setMarks(cur);
      if (st.commas) board.showCommas(st.commas);
      if (st.flash) board.flash(st.flash);
      if (st.note) notes.appendChild(h(`<li class="rv">${st.note}</li>`)).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (k >= steps.length) { done(); return; }
      api.foot({ label: 'Следующий шаг ▸', onClick: one });
    };
    api.foot({ label: 'Разобрать ▸', onClick: one });
  };

  // Карточки-перевёртыши для самопроверки (глагол → причастие/деепричастие)
  const flipPh = (title, cards) => (box, api, done) => {
    box.appendChild(h(`<div class="demo-title">${title}</div>`));
    const grid = h(`<div class="flips">${cards.map(([suf, verb, res], i) => `<button class="flip" data-i="${i}"><span class="f-suf">${suf}</span><span class="f-front">${verb} → <b>?</b></span><span class="f-back">${verb} → <b>${res}</b></span></button>`).join('')}</div>`);
    box.appendChild(grid);
    let opened = 0;
    const left = () => cards.length - opened;
    const upd = () => api.foot({ label: `Переверни карточки (${left()})`, enabled: false, extraLabel: 'Открыть все', onExtra: () => grid.querySelectorAll('.flip:not(.on)').forEach((b) => b.click()) });
    grid.querySelectorAll('.flip').forEach((b) => b.addEventListener('click', () => {
      if (b.classList.contains('on')) return;
      b.classList.add('on'); opened++; api.sound('tap');
      if (!left()) { api.fly(b, 8, 2); done(); } else upd();
    }));
    upd();
  };

  const slide = (block, fn) => { fn.block = block; return fn; };

  /* ===== Разметка по словам =====
     ann(S, spec): s/p — подлежащие/сказуемые ('слово@2' — основа №2), def/circ/obj — слова и фразы,
     rings/boxes/x — слова, o — {слово: 'def'|'obj'|'s'|'p'|'circ'} кружок над однородным членом,
     lab — {слово: подпись}, arr — [[от, к, вопрос]], br — ['[слово', 'слово]', '(слово', 'слово)', '{слово', 'слово}'],
     bars — ['|слово', 'слово|']. Повтор слова: 'и#2'. */
  function idxs(S, w) {
    w = w.trim();
    const m = w.match(/^(.*)#(\d+)$/);
    if (m) return [W(S, m[1], +m[2] - 1)];
    if (w.includes(' ')) return M.find(S, w);
    return [W(S, w)];
  }
  function ann(S, spec = {}) {
    const m = M.emptyMarks();
    const base = (w) => { const mm = w.match(/^(.*)@(\d)$/); return mm ? [mm[1], +mm[2]] : [w, 1]; };
    (spec.s || []).forEach((x) => { const [w, b] = base(x); idxs(S, w).forEach((i) => (m.mem[i] = { t: 's', b })); });
    (spec.p || []).forEach((x) => { const [w, b] = base(x); idxs(S, w).forEach((i) => (m.mem[i] = { t: 'p', b })); });
    for (const k of ['def', 'circ', 'obj', 'rings', 'boxes']) (spec[k] || []).forEach((w) => m[k].push(...idxs(S, w)));
    (spec.x || []).forEach((w) => m.cross.push(...idxs(S, w)));
    Object.entries(spec.o || {}).forEach(([w, t]) => idxs(S, w).forEach((i) => (m.labels[i] = 'o:' + t)));
    Object.entries(spec.lab || {}).forEach(([w, t]) => { const ii = idxs(S, w); m.labels[ii[0]] = t; });
    (spec.arr || []).forEach(([a, b, q]) => m.arrows.push([idxs(S, a)[0], idxs(S, b)[0], q]));
    (spec.br || []).forEach((x) => {
      const mm = x.match(/^([\[\(\{]*)(.*?)([\]\)\}]*)$/);
      const ii = idxs(S, mm[2]);
      // в одном промежутке могут стоять несколько скобок: сначала закрывающие, потом открывающие
      const rank = { ')': 0, ']': 1, '}': 2, '{': 3, '[': 4, '(': 5 };
      const put = (k, c) => { m.gm[k] = [...((m.gm[k] || '') + c)].sort((p, q) => rank[p] - rank[q]).join(''); };
      [...mm[1]].forEach((c) => put(ii[0], c));
      [...mm[3]].forEach((c) => put(ii[ii.length - 1] + 1, c));
    });
    (spec.bars || []).forEach((x) => {
      const open = x[0] === '|';
      const ii = idxs(S, open ? x.slice(1) : x.slice(0, -1));
      m.bars.push(open ? ii[0] : ii[ii.length - 1] + 1);
    });
    return m;
  }
  /* Шаг пошагового разбора: разметка + пояснение */
  const st = (spec, note, extra = {}) => (S) => Object.assign({ m: ann(S, spec), note }, extra);
  /* Готовая разметка целиком (без пошагового показа) */
  const markedPh = (text, spec, { title, note, commas } = {}) => (box, api, done) => {
    if (title) box.appendChild(h(`<div class="demo-title">${title}</div>`));
    const S = P(text);
    const b = new M.Board(box, S, { readOnly: true, marks: ann(S, spec) });
    if (commas) b.showCommas(commas);
    if (note) box.appendChild(h(`<div class="rv demo-note">${note}</div>`));
    done();
  };
  /* Несколько готовых разметок, открываются по одной */
  const examplesPh = (list, { btn = 'Следующий пример ▸' } = {}) => (box, api, done) => {
    let k = 0;
    const one = () => {
      const [text, spec, note, title] = list[k++];
      const w = h('<div class="rv ex-card"></div>');
      box.appendChild(w);
      if (title) w.appendChild(h(`<div class="demo-title">${title}</div>`));
      const S = P(text);
      new M.Board(w, S, { readOnly: true, marks: ann(S, spec) });
      if (note) w.appendChild(h(`<div class="demo-note">${note}</div>`));
      w.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (k >= list.length) { done(); return; }
      api.foot({ label: btn, onClick: one, extraLabel: list.length - k > 1 ? 'Показать всё' : null, onExtra: () => { while (k < list.length - 1) one(); one(); } });
    };
    one();
  };

  /* Вопросы с вариантами: [{q, options, correct, why}] */
  const choicePh = (items, { title, grid } = {}) => (box, api, done) => {
    if (title) box.appendChild(h(`<div class="demo-title">${title}</div>`));
    const area = h('<div class="qa"></div>');
    box.appendChild(area);
    let i = 0;
    const ask = () => {
      const it = items[i];
      area.innerHTML = `<div class="q-count">${i + 1} из ${items.length}</div><div class="q">${it.q}</div><div class="opts ${grid || (it.options.length === 2 ? 'grid2' : '')}">${it.options.map((o, j) => `<button class="opt" data-j="${j}">${o}</button>`).join('')}</div>`;
      api.foot({ label: 'Выбери ответ', enabled: false });
      let miss = false;
      area.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
        if (+b.dataset.j !== it.correct) { miss = true; b.classList.add('wrong'); b.disabled = true; api.bad([it.why || 'Подумай ещё — правило выше поможет.']); return; }
        b.classList.add('right'); area.querySelectorAll('.opt').forEach((x) => (x.disabled = true));
        api.good(miss ? 2 : 5, miss ? 0 : 2, b, it.why);
        const last = i === items.length - 1;
        api.foot({ label: last ? 'Дальше' : 'Следующий ▸', onClick: () => { api.feedback(null); if (last) { area.innerHTML = `<div class="conclusion">Готово! ${items.length} из ${items.length} ✅</div>`; done(); } else { i++; ask(); } } });
      }));
    };
    ask();
  };

  /* Распредели по группам: нажми карточку, потом корзину. groups: [названия], items: [[текст, номер группы]] */
  const sortPh = (title, groups, items) => (box, api, done) => {
    box.appendChild(h(`<div class="demo-title">${title}</div>`));
    const pool = h('<div class="word-pool sort-pool"></div>');
    const bins = h(`<div class="bins">${groups.map((g, gi) => `<button class="bin" data-g="${gi}"><b>${g}</b><span class="bin-in"></span></button>`).join('')}</div>`);
    box.append(pool, bins);
    const left = items.map((x, i) => i);
    let sel = null;
    const draw = () => {
      pool.innerHTML = left.map((i) => `<button class="wchip ${sel === i ? 'on' : ''}" data-i="${i}">${items[i][0]}</button>`).join('') || '<div class="conclusion">Всё распределено! 🎉</div>';
      pool.querySelectorAll('.wchip').forEach((b) => b.addEventListener('click', () => { sel = +b.dataset.i; api.sound('tap'); draw(); }));
    };
    bins.querySelectorAll('.bin').forEach((bin) => bin.addEventListener('click', () => {
      if (sel == null) { api.toast('Сначала выбери карточку'); return; }
      const [txt, g] = items[sel];
      if (+bin.dataset.g !== g) { api.bad([`«${txt}» — это не «${groups[+bin.dataset.g]}». Попробуй другую группу.`]); return; }
      api.feedback(null);
      api.fly(bin, 2);
      bin.querySelector('.bin-in').insertAdjacentHTML('beforeend', `<i>${txt}</i>`);
      left.splice(left.indexOf(sel), 1); sel = null; draw();
      if (!left.length) done(); else api.foot({ label: `Осталось: ${left.length}`, enabled: false });
    }));
    draw();
    api.foot({ label: `Осталось: ${left.length}`, enabled: false });
  };

  /* Ввод ответа-цифр с разбором после */
  const answerPh = (answer, explainHtml) => (box, api, done) => {
    box.appendChild(h('<div class="answer-box"><label>Ответ:</label><input class="ans" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="цифры"></div>'));
    const inp = box.querySelector('input');
    let tries = 0;
    const show = () => { box.appendChild(h(`<div class="explain card rv"><div class="ans-big">Ответ: <b>${answer}</b></div>${explainHtml}</div>`)); done(); };
    const check = () => {
      const v = [...new Set(inp.value.replace(/\D/g, ''))].sort().join('');
      if (!v) return inp.focus();
      if (v === answer) { inp.disabled = true; api.good(tries ? 8 : 15, tries ? 3 : 6, inp, `Ответ <b>${answer}</b> — верно!`); App.confetti(80); show(); return; }
      tries++; api.bad(['Посмотри ещё раз на разбор выше.']);
      if (tries >= 2) api.foot({ label: 'Проверить', onClick: check, extraLabel: '👀 Ответ', onExtra: () => { inp.disabled = true; api.feedback('info', 'Разбор ниже 👇'); show(); } });
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    api.foot({ label: 'Проверить', onClick: check });
  };

  /* Схема предложения: '[ ], и [ ].' и т. п. */
  const scheme = (s, cap = '') => `<div class="scheme"><code>${s}</code>${cap ? `<span>${cap}</span>` : ''}</div>`;

  App.Kit = { norm, P, W, R, marks, merge, shell, phases, revealPh, htmlPh, demoPh, flipPh, slide, ann, st, markedPh, examplesPh, choicePh, sortPh, answerPh, scheme };
})();

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
    m.links = autoLinks(m);
    return m;
  }
  // линии соединяются между соседними словами одной фразы
  function autoLinks(m) {
    const L = new Set(m.links || []);
    for (const k of ['def', 'circ', 'obj']) { const st = new Set(m[k]); m[k].forEach((i) => { if (st.has(i + 1)) L.add(i + 1); }); }
    Object.keys(m.mem).forEach((i) => { i = +i; const a = m.mem[i], b = m.mem[i + 1]; if (b && a.t === b.t && a.b === b.b) L.add(i + 1); });
    return [...L];
  }
  const merge = (a, b) => {
    const r = M.clone(a);
    for (const k of ['def', 'circ', 'obj', 'cross', 'bars', 'rings', 'boxes', 'links']) r[k] = [...new Set([...(r[k] || []), ...(b[k] || [])])];
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

  // Фазы внутри одного слайда: следующая открывается только по кнопке «Дальше» (заголовки htmlPh — сразу)
  function phases(host, api, list, endLabel = 'Дальше') {
    let i = 0;
    const run = () => {
      if (i >= list.length) { api.foot({ label: endLabel }); return; }
      const ph = list[i++];
      const box = h('<div class="phase"></div>');
      host.appendChild(box);
      ph(box, api, () => {
        if (ph.instant) { run(); return; }
        if (i >= list.length) { api.foot({ label: endLabel }); return; }
        api.feedback(null);
        api.foot({ label: 'Дальше ▸', onClick: run });
      });
      requestAnimationFrame(() => box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    };
    run();
  }

  // Карточки правила: все сразу; step: true — по одной
  const revealPh = (items, { btn = 'Дальше ▸', step = false } = {}) => (box, api, done) => {
    let k = 0;
    const add = () => { const el = h(`<div class="rv">${items[k++]}</div>`); box.appendChild(el); return el; };
    if (!step) { while (k < items.length) add(); done(); return; }
    const one = () => {
      add().scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (k >= items.length) { done(); return; }
      api.foot({ label: btn, onClick: one });
    };
    one();
  };
  const htmlPh = (html) => { const f = (box, api, done) => { box.innerHTML = html; done(); }; f.instant = true; return f; };

  // Пошаговый разбор предложения: каждое нажатие добавляет разметку и пояснение
  const demoPh = (text, steps, { title } = {}) => (box, api, done) => {
    const S = P(text);
    if (title) box.appendChild(h(`<div class="demo-title">${title}</div>`));
    let cur = M.emptyMarks();
    const board = new M.Board(box, S, { readOnly: true, marks: cur, useLinks: true });
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
    const link = (ii) => ii.slice(1).forEach((i) => m.links.push(i));
    (spec.s || []).forEach((x) => { const [w, b] = base(x); const ii = idxs(S, w); ii.forEach((i) => (m.mem[i] = { t: 's', b })); link(ii); });
    (spec.p || []).forEach((x) => { const [w, b] = base(x); const ii = idxs(S, w); ii.forEach((i) => (m.mem[i] = { t: 'p', b })); link(ii); });
    for (const k of ['def', 'circ', 'obj']) (spec[k] || []).forEach((w) => { const ii = idxs(S, w); m[k].push(...ii); link(ii); });
    for (const k of ['rings', 'boxes']) (spec[k] || []).forEach((w) => m[k].push(...idxs(S, w)));
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
    const b = new M.Board(box, S, { readOnly: true, marks: ann(S, spec), useLinks: true });
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
      new M.Board(w, S, { readOnly: true, marks: ann(S, spec), useLinks: true });
      if (note) w.appendChild(h(`<div class="demo-note">${note}</div>`));
    };
    // все примеры сразу
    while (k < list.length) one();
    done();
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

  /* Ответ с объяснением: по каждой цифре ученик решает, нужна ли запятая, и выбирает причину.
     opts: { nums: [1,2…], answer: '145', yes: {label, reasons}, no: {label, reasons}, onDone(ok) } */
  function reasonAnswer(host, api, o) {
    const yes = o.yes || { label: 'запятая', reasons: [] }, no = o.no || { label: 'нет', reasons: [] };
    const st = {};
    const box = h(`<div class="reasons"><div class="rs-h">${o.title || 'Объясни каждую цифру — ответ соберётся сам'}</div>${o.nums.map((n) => `<div class="rs-row" data-n="${n}"><b class="rs-n">${n}</b>
      <div class="rs-seg"><button data-v="1">${yes.label}</button><button data-v="0">${no.label}</button></div>
      <select class="rs-sel" disabled><option value="">почему?</option></select></div>`).join('')}<div class="rs-ans">Твой ответ: <b>—</b></div></div>`);
    host.appendChild(box);
    const ansEl = box.querySelector('.rs-ans b');
    const answer = () => o.nums.filter((n) => st[n] && st[n].v === 1).join('');
    const ready = () => o.nums.every((n) => st[n] && st[n].r);
    const upd = () => { ansEl.textContent = answer() || '—'; api.foot({ label: 'Проверить', enabled: ready(), onClick: check }); };
    box.querySelectorAll('.rs-row').forEach((row) => {
      const n = +row.dataset.n, sel = row.querySelector('select');
      row.querySelectorAll('.rs-seg button').forEach((b) => b.addEventListener('click', () => {
        const v = +b.dataset.v;
        st[n] = { v, r: '' };
        row.querySelectorAll('.rs-seg button').forEach((x) => x.classList.toggle('on', x === b));
        const list = v ? yes.reasons : no.reasons;
        sel.innerHTML = '<option value="">почему?</option>' + list.map((r) => `<option>${r}</option>`).join('');
        sel.disabled = false;
        if (list.length === 0) st[n].r = '—';
        upd();
      }));
      sel.addEventListener('change', () => { if (st[n]) { st[n].r = sel.value; upd(); } });
    });
    let tries = 0;
    function check() {
      const v = answer();
      if (v === o.answer) { box.querySelectorAll('button, select').forEach((x) => (x.disabled = true)); api.good(tries ? 8 : 15, 0, ansEl, `Ответ <b>${o.answer}</b> — верно! Сверь свои объяснения с разбором.`); App.confetti(80); o.onDone(true); return; }
      tries++;
      api.bad(['Где-то запятая лишняя или пропущена. Проверь причины ещё раз.']);
      if (tries >= 2) api.foot({ label: 'Проверить', enabled: ready(), onClick: check, extraLabel: '👀 Ответ', onExtra: () => { box.querySelectorAll('button, select').forEach((x) => (x.disabled = true)); api.feedback('info', `Верный ответ: <b>${o.answer}</b>. Разбор ниже 👇`); o.onDone(false); } });
    }
    upd();
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* Схема предложения: '[ ], и [ ].' и т. п. */
  const scheme = (s, cap = '') => `<div class="scheme"><code>${s}</code>${cap ? `<span>${cap}</span>` : ''}</div>`;

  App.Kit = { reasonAnswer, norm, P, W, R, marks, merge, shell, phases, revealPh, htmlPh, demoPh, flipPh, slide, ann, st, markedPh, examplesPh, choicePh, sortPh, answerPh, scheme };
})();

/* Движок разметки предложения: основы, обороты, главные слова, стрелки, границы */
const Markup = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const BASE_COLORS = { 1: '#7c3aed', 2: '#f59e0b', 3: '#ec4899', 4: '#14b8a6' };
  // Подписи над словами: чем выражен член предложения
  const LABELS = ['ПО', 'ДО', 'прил.', 'прич.', 'деепр.', 'прил.+з.с.'];
  let uid = 0;

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (w) => w.toLowerCase().replace(/ё/g, 'е');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const emptyMarks = () => ({ mem: {}, def: [], circ: [], obj: [], cross: [], bars: [], arrows: [], labels: {}, rings: [] });
  const normMarks = (m) => Object.assign(emptyMarks(), m ? clone(m) : {});
  const toggle = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
  const without = (arr, v) => arr.filter((x) => x !== v);

  /* Разбор предложения: слова, знаки препинания и цифры (1), (2)... */
  function parse(text) {
    const items = [], words = [];
    const re = /\((\d+)\)|[^\s()]+/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[1]) { items.push({ k: 'd', n: +m[1] }); continue; }
      const mm = m[0].match(/^([«"]?)(.*?)([.,;:!?»"]*)$/);
      const wi = words.length;
      words.push(mm[2]);
      items.push({ k: 'w', pre: mm[1], text: mm[2], punct: mm[3], wi });
    }
    return { text, items, words };
  }

  /* Индексы слов фразы в предложении */
  function find(sent, phrase, from = 0) {
    const ph = phrase.split(/\s+/).map(norm);
    const ws = sent.words.map(norm);
    for (let i = from; i <= ws.length - ph.length; i++) {
      if (ph.every((p, j) => ws[i + j] === p)) return ph.map((_, j) => i + j);
    }
    throw new Error('Фраза не найдена: ' + phrase);
  }

  const TOOL_TIPS = {
    subj: 'Нажми на подлежащее (или проведи пальцем по словам)',
    pred: 'Нажми на сказуемое — оно подчеркнётся двумя чертами',
    def: 'Проведи пальцем по всем словам определения (оборота)',
    circ: 'Проведи пальцем по всем словам обстоятельства (оборота)',
    cross: 'Нажми на главное слово — над ним появится ×',
    arrow: 'Нажми на главное слово, а затем на слово из оборота',
    bar: 'Нажми у края слова — там встанет граница |',
    erase: 'Нажми на слово или границу, чтобы стереть разметку',
    label: 'Нажми на первое слово оборота и выбери подпись: ПО, ДО, прил.…',
    ring: 'Нажми на союз, который соединяет однородные обороты',
  };

  class Board {
    constructor(host, sent, opts = {}) {
      this.sent = sent;
      this.readOnly = !!opts.readOnly;
      this.marks = normMarks(opts.marks);
      this.labelSet = opts.labels || LABELS;
      this.tool = null;
      this.base = 1;
      this.pending = null;
      this.hist = [];
      this.onChange = opts.onChange || (() => {});
      this.onTap = opts.onTap || (() => {});
      this.id = ++uid;
      this.el = document.createElement('div');
      this.el.className = 'board' + (this.readOnly ? ' ro' : '');
      this.sentEl = document.createElement('div');
      this.sentEl.className = 'sent';
      this.svg = document.createElementNS(NS, 'svg');
      this.svg.setAttribute('class', 'arrows');
      this.el.append(this.sentEl, this.svg);
      host.appendChild(this.el);
      this.build();
      if (opts.commas) this.showCommas(opts.commas);
      this.render();
      if (!this.readOnly) this.bind();
      if (window.ResizeObserver) {
        this.ro = new ResizeObserver(() => this.drawArrows());
        this.ro.observe(this.el);
      }
      requestAnimationFrame(() => this.drawArrows());
    }

    build() {
      const s = this.sentEl;
      s.innerHTML = '';
      this.wordEls = [];
      this.gapEls = [];
      this.digEls = [];
      const mkGap = (k) => {
        const g = document.createElement('span');
        g.className = 'gap';
        g.dataset.g = k;
        g.innerHTML = '<b class="bar"></b><span class="w">​<span class="lines"></span></span>';
        s.appendChild(g);
        this.gapEls[k] = g;
      };
      for (const it of this.sent.items) {
        if (it.k === 'd') {
          const d = document.createElement('span');
          d.className = 'dig';
          d.textContent = '(' + it.n + ')';
          d.dataset.n = it.n;
          s.appendChild(d);
          this.digEls.push(d);
        } else {
          mkGap(it.wi);
          const t = document.createElement('span');
          t.className = 'tok';
          t.dataset.w = it.wi;
          t.innerHTML = '<span class="lbl"></span>' +
            (it.pre ? `<span class="p">${esc(it.pre)}</span>` : '') +
            `<span class="w">${esc(it.text)}<span class="lines"></span></span>` +
            (it.punct ? `<span class="p">${esc(it.punct)}</span>` : '');
          s.appendChild(t);
          this.wordEls[it.wi] = t;
        }
      }
      mkGap(this.sent.words.length);
    }

    /* Заменить цифры запятыми (для показа верного ответа) */
    showCommas(list) {
      for (const d of this.digEls) {
        if (list.includes(+d.dataset.n)) { d.textContent = ','; d.classList.add('comma'); }
        else d.classList.add('gone');
      }
    }

    layers(wi) {
      const m = this.marks, out = [];
      const mem = m.mem[wi];
      if (mem) out.push({ k: 'mem', t: mem.t, b: mem.b });
      if (m.obj.includes(wi)) out.push({ k: 'obj' });
      if (m.def.includes(wi)) out.push({ k: 'def' });
      if (m.circ.includes(wi)) out.push({ k: 'circ' });
      return out;
    }

    linesHtml(ls) {
      return ls.map((l) => {
        if (l.k === 'mem') return `<i class="ln l-mem ${l.t === 's' ? 'single' : 'double'}" style="--c:${BASE_COLORS[l.b]}"></i>`;
        return `<i class="ln l-${l.k}"></i>`;
      }).join('');
    }

    render() {
      const m = this.marks;
      const n = this.sent.words.length;
      for (let wi = 0; wi < n; wi++) {
        const t = this.wordEls[wi];
        t.querySelector('.lines').innerHTML = this.linesHtml(this.layers(wi));
        t.classList.toggle('x', m.cross.includes(wi));
        t.classList.toggle('ring', m.rings.includes(wi));
        const lb = m.labels[wi] || '';
        t.querySelector('.lbl').textContent = lb;
        t.classList.toggle('has-lbl', !!lb);
        t.classList.toggle('pending', this.pending === wi);
      }
      for (let k = 0; k <= n; k++) {
        const g = this.gapEls[k];
        g.classList.toggle('on', m.bars.includes(k));
        let joined = [];
        if (k > 0 && k < n) {
          const a = this.layers(k - 1), b = this.layers(k);
          joined = a.filter((la) => b.some((lb) => lb.k === la.k && lb.t === la.t && lb.b === la.b));
        }
        g.querySelector('.lines').innerHTML = this.linesHtml(joined);
      }
      this.drawArrows();
    }

    drawArrows() {
      const br = this.el.getBoundingClientRect();
      if (!br.width) return;
      const aid = 'ah' + this.id;
      let h = `<defs><marker id="${aid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#7c3aed"/></marker></defs>`;
      for (const [a, b, label] of this.marks.arrows) {
        const ea = this.wordEls[a], eb = this.wordEls[b];
        if (!ea || !eb) continue;
        const ra = ea.querySelector('.w').getBoundingClientRect();
        const rb = eb.querySelector('.w').getBoundingClientRect();
        const x1 = ra.left + ra.width / 2 - br.left;
        let y1 = ra.top - br.top - 2;
        if (this.marks.cross.includes(a)) y1 -= 16;
        if (this.marks.labels[a]) y1 -= 14;
        const x2 = rb.left + rb.width / 2 - br.left;
        const y2 = rb.top - br.top - 3 - (this.marks.labels[b] ? 14 : 0);
        let mx, my;
        const f = (n) => n.toFixed(1);
        if (Math.abs(y1 - y2) < 24) {
          // одна строка — дуга над словами
          const lift = 22 + Math.min(34, Math.abs(x2 - x1) * 0.12);
          const cy = Math.max(2, Math.min(y1, y2) - lift);
          h += `<path d="M${f(x1)},${f(y1)} Q${f((x1 + x2) / 2)},${f(cy)} ${f(x2)},${f(y2)}" marker-end="url(#${aid})"/>`;
          mx = (x1 + (x1 + x2) + x2) / 4; my = (y1 + 2 * cy + y2) / 4;
        } else {
          // разные строки — S-образная кривая, входящая в слово сверху
          h += `<path d="M${f(x1)},${f(y1)} C${f(x1)},${f(y1 - 26)} ${f(x2)},${f(y2 - 34)} ${f(x2)},${f(y2)}" marker-end="url(#${aid})"/>`;
          mx = (x1 + 3 * x1 + 3 * x2 + x2) / 8; my = (y1 + 3 * (y1 - 26) + 3 * (y2 - 34) + y2) / 8;
        }
        if (label) h += `<text x="${f(mx)}" y="${f(my - 4)}" text-anchor="middle" class="arr-q">${esc(label)}</text>`;
      }
      this.svg.innerHTML = h;
    }

    setTool(t) { this.tool = t; this.pending = null; this.closeMenu(); this.render(); }
    setBase(b) { this.base = b; }
    getMarks() { return clone(this.marks); }
    setMarks(m) { this.marks = normMarks(m); this.pending = null; this.closeMenu(); this.render(); this.onChange(this.getMarks()); }
    snap() { this.hist.push(JSON.stringify(this.marks)); if (this.hist.length > 60) this.hist.shift(); }
    undo() { if (!this.hist.length) return false; this.marks = JSON.parse(this.hist.pop()); this.pending = null; this.changed(); return true; }
    clear() { this.snap(); this.marks = emptyMarks(); this.pending = null; this.closeMenu(); this.changed(); }
    changed() { this.clearWrong(); this.render(); this.onChange(this.getMarks()); }

    has(wi) {
      const m = this.marks;
      switch (this.tool) {
        case 'subj': return m.mem[wi] && m.mem[wi].t === 's' && m.mem[wi].b === this.base;
        case 'pred': return m.mem[wi] && m.mem[wi].t === 'p' && m.mem[wi].b === this.base;
        case 'def': return m.def.includes(wi);
        case 'circ': return m.circ.includes(wi);
        case 'cross': return m.cross.includes(wi);
        case 'ring': return m.rings.includes(wi);
        default: return false;
      }
    }

    apply(wi, on) {
      const m = this.marks;
      switch (this.tool) {
        case 'subj': case 'pred':
          if (on) m.mem[wi] = { t: this.tool === 'subj' ? 's' : 'p', b: this.base };
          else delete m.mem[wi];
          break;
        case 'def': m.def = without(m.def, wi); if (on) m.def.push(wi); break;
        case 'circ': m.circ = without(m.circ, wi); if (on) m.circ.push(wi); break;
        case 'cross': m.cross = without(m.cross, wi); if (on) m.cross.push(wi); break;
        case 'ring': m.rings = without(m.rings, wi); if (on) m.rings.push(wi); break;
        case 'erase':
          delete m.mem[wi];
          m.def = without(m.def, wi); m.circ = without(m.circ, wi); m.cross = without(m.cross, wi);
          m.rings = without(m.rings, wi); m.obj = without(m.obj, wi); delete m.labels[wi];
          m.arrows = m.arrows.filter((a) => a[0] !== wi && a[1] !== wi);
          break;
      }
    }

    bind() {
      const s = this.sentEl;
      s.addEventListener('pointerdown', (e) => {
        if (!this.tool) { this.onTap('notool'); return; }
        const tok = e.target.closest('.tok');
        const gap = e.target.closest('.gap');
        if (this.tool === 'bar') {
          let k = null;
          if (gap) k = +gap.dataset.g;
          else if (tok) {
            const r = tok.getBoundingClientRect();
            const wi = +tok.dataset.w;
            k = e.clientX < r.left + r.width / 2 ? wi : wi + 1;
          }
          if (k != null) { this.snap(); toggle(this.marks.bars, k); this.changed(); this.onTap('mark'); }
          return;
        }
        if (this.tool === 'label') {
          if (tok) this.openMenu(+tok.dataset.w);
          return;
        }
        if (this.tool === 'arrow') {
          if (!tok) return;
          const wi = +tok.dataset.w;
          if (this.pending == null) this.pending = wi;
          else if (this.pending === wi) this.pending = null;
          else {
            this.snap();
            const a = [this.pending, wi];
            if (!this.marks.arrows.some((x) => x[0] === a[0] && x[1] === a[1])) this.marks.arrows.push(a);
            this.pending = null;
            this.changed();
            this.onTap('mark');
            return;
          }
          this.render();
          this.onTap('pending');
          return;
        }
        if (this.tool === 'erase' && gap && !tok) {
          const k = +gap.dataset.g;
          if (this.marks.bars.includes(k)) { this.snap(); this.marks.bars = without(this.marks.bars, k); this.changed(); }
          return;
        }
        if (!tok) return;
        e.preventDefault();
        this.snap();
        const wi = +tok.dataset.w;
        this.dragOn = this.tool === 'erase' ? true : !this.has(wi);
        this.visited = new Set([wi]);
        this.apply(wi, this.dragOn);
        this.dragging = true;
        this.render();
        this.onTap('mark');
        try { s.setPointerCapture(e.pointerId); } catch (_) {}
      });
      s.addEventListener('pointermove', (e) => {
        if (!this.dragging) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const tok = el && el.closest && el.closest('.tok');
        if (!tok || !s.contains(tok)) return;
        const wi = +tok.dataset.w;
        if (this.visited.has(wi)) return;
        this.visited.add(wi);
        this.apply(wi, this.dragOn);
        this.render();
      });
      const up = () => { if (this.dragging) { this.dragging = false; this.changed(); } };
      s.addEventListener('pointerup', up);
      s.addEventListener('pointercancel', up);
    }

    /* Меню подписей над словом */
    openMenu(wi) {
      this.closeMenu();
      const t = this.wordEls[wi], br = this.el.getBoundingClientRect(), r = t.getBoundingClientRect();
      const menu = document.createElement('div');
      menu.className = 'lbl-menu';
      menu.innerHTML = this.labelSet.map((l) => `<button data-l="${esc(l)}">${esc(l)}</button>`).join('') + (this.marks.labels[wi] ? '<button data-l="" class="del">✕ убрать</button>' : '');
      menu.style.top = r.bottom - br.top + 4 + 'px';
      menu.style.left = Math.max(0, Math.min(br.width - 230, r.left - br.left - 20)) + 'px';
      menu.addEventListener('pointerdown', (e) => e.stopPropagation());
      menu.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.snap();
        if (b.dataset.l) this.marks.labels[wi] = b.dataset.l; else delete this.marks.labels[wi];
        this.closeMenu();
        this.changed();
        this.onTap('mark');
      });
      this.el.appendChild(menu);
      this.menu = menu;
      t.classList.add('pending');
    }
    closeMenu() {
      if (this.menu) { this.menu.remove(); this.menu = null; }
      this.el.querySelectorAll('.tok.pending').forEach((e) => e.classList.remove('pending'));
    }

    markWrong(list) {
      this.clearWrong();
      for (const wi of list) this.wordEls[wi] && this.wordEls[wi].classList.add('wrong');
    }
    markWrongGaps(list) {
      for (const k of list) this.gapEls[k] && this.gapEls[k].classList.add('wrong');
    }
    clearWrong() {
      this.sentEl.querySelectorAll('.wrong').forEach((e) => e.classList.remove('wrong'));
    }
    flash(list, cls = 'good') {
      for (const wi of list) {
        const e = this.wordEls[wi];
        if (!e) continue;
        e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls);
        setTimeout(() => e.classList.remove(cls), 1600);
      }
    }
  }

  /* Панель инструментов */
  const TOOL_DEFS = {
    subj: { label: 'Подлежащее', glyph: '<i class="g g-single"></i>' },
    pred: { label: 'Сказуемое', glyph: '<i class="g g-double"></i>' },
    def: { label: 'Определение', glyph: '<i class="g g-wavy"></i>' },
    circ: { label: 'Обстоятельство', glyph: '<i class="g g-dashdot"></i>' },
    cross: { label: 'Главное слово', glyph: '<b class="g-x">×</b>' },
    arrow: { label: 'Стрелка', glyph: '<b class="g-arr">↷</b>' },
    label: { label: 'Подпись', glyph: '<b class="g-lbl">ПО</b>' },
    ring: { label: 'Союз в кружок', glyph: '<b class="g-ring">и</b>' },
    bar: { label: 'Граница', glyph: '<b class="g-bar">|</b>' },
    erase: { label: 'Ластик', glyph: '<b class="g-er">⌫</b>' },
  };

  function toolbar(host, board, tools, onTool) {
    const wrap = document.createElement('div');
    wrap.className = 'toolbar';
    const hasBase = tools.includes('subj') || tools.includes('pred');
    const drawTools = tools.filter((t) => TOOL_DEFS[t]);
    wrap.innerHTML = `
      ${hasBase ? `<div class="bases"><span>Основа:</span>${[1, 2, 3, 4].map((b) => `<button class="bdot${b === 1 ? ' on' : ''}" data-b="${b}" style="--c:${BASE_COLORS[b]}">${b}</button>`).join('')}</div>` : ''}
      <div class="tools">${drawTools.map((t) => `<button class="tool" data-t="${t}" style="--c:${BASE_COLORS[1]}">${TOOL_DEFS[t].glyph}<span>${TOOL_DEFS[t].label}</span></button>`).join('')}
        <button class="tool util" data-u="undo"><b class="g-er">↶</b><span>Отменить</span></button>
        <button class="tool util" data-u="clear"><b class="g-er">⟲</b><span>Сбросить</span></button>
      </div>
      <div class="tooltip"></div>`;
    host.appendChild(wrap);
    const tip = wrap.querySelector('.tooltip');
    const select = (t) => {
      board.setTool(t);
      wrap.querySelectorAll('.tool[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
      tip.textContent = TOOL_TIPS[t] || '';
      onTool && onTool(t);
    };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.t) select(b.dataset.t);
      if (b.dataset.b) {
        board.setBase(+b.dataset.b);
        wrap.querySelectorAll('.bdot').forEach((x) => x.classList.toggle('on', x === b));
        wrap.querySelectorAll('.tool[data-t="subj"],.tool[data-t="pred"]').forEach((x) => x.style.setProperty('--c', BASE_COLORS[b.dataset.b]));
      }
      if (b.dataset.u === 'undo') board.undo();
      if (b.dataset.u === 'clear') board.clear();
    });
    select(drawTools[0]);
    return { select, el: wrap };
  }

  /* ===== Проверки ===== */
  function diff(student, expected, optional = []) {
    const S = new Set(student), E = new Set(expected), O = new Set(optional);
    const missing = [...E].filter((x) => !S.has(x));
    const extra = [...S].filter((x) => !E.has(x) && !O.has(x));
    return { missing, extra, ok: !missing.length && !extra.length };
  }

  function checkBases(m, spec) {
    const msgs = new Set(), wrong = new Set();
    const all = new Map();
    spec.groups.forEach((g, gi) => {
      g.s.forEach((i) => all.set(i, { t: 's', g: gi }));
      g.p.forEach((i) => all.set(i, { t: 'p', g: gi }));
    });
    for (const [i, e] of all) {
      const x = m.mem[i];
      if (!x) { wrong.add(i); msgs.add(e.t === 's' ? 'Найдены не все подлежащие (подлежащее — одной чертой, отвечает на вопрос кто? что?).' : 'Найдены не все сказуемые (сказуемое — двумя чертами). Подсказка: у одного подлежащего может быть несколько сказуемых!'); }
      else if (x.t !== e.t) { wrong.add(i); msgs.add('Где-то перепутаны подлежащее и сказуемое.'); }
    }
    const opt = new Set(spec.optional || []);
    for (const k of Object.keys(m.mem)) {
      const i = +k;
      if (!all.has(i) && !opt.has(i)) { wrong.add(i); msgs.add('Есть лишние подчёркивания: эти слова не входят в грамматическую основу.'); }
    }
    let colorErr = false;
    // free: основа без подлежащего — её цвет не обязан отличаться от других
    const used = spec.groups.map((g) => {
      const bs = new Set([...g.s, ...g.p].map((i) => m.mem[i] && m.mem[i].b).filter(Boolean));
      if (bs.size > 1) { colorErr = true; msgs.add('Слова одной основы подчеркни одним цветом.'); }
      return [...bs][0];
    });
    for (let a = 0; a < used.length; a++)
      for (let b = a + 1; b < used.length; b++)
        if (used[a] && used[a] === used[b] && !spec.groups[a].free && !spec.groups[b].free) { colorErr = true; msgs.add('Разные основы подчеркни разными цветами 🎨 (переключи «Основа: 1 / 2»).'); }
    return { ok: !wrong.size && !colorErr, wrong: [...wrong], msgs: [...msgs] };
  }

  function checkSet(student, expected, optional, names) {
    const d = diff(student, expected, optional);
    const msgs = [];
    if (d.missing.length) msgs.push(names.missing);
    if (d.extra.length) msgs.push(names.extra);
    return { ok: d.ok, wrong: [...d.missing, ...d.extra], msgs };
  }

  function checkArrows(m, expected, also = []) {
    const msgs = new Set(), wrong = new Set();
    for (const e of expected) {
      const from = [].concat(e.from);
      const ok = m.arrows.some((a) => from.includes(a[0]) && e.to.includes(a[1]));
      if (!ok) {
        const rev = m.arrows.some((a) => from.includes(a[1]) && e.to.includes(a[0]));
        msgs.add(rev ? 'Стрелка идёт ОТ главного слова К обороту — разверни её.' : 'Не хватает стрелки от главного слова к обороту.');
        wrong.add(from[0]);
      }
    }
    for (const a of m.arrows) {
      const fits = [...expected, ...also].some((e) => { const from = [].concat(e.from); return (from.includes(a[0]) && e.to.includes(a[1])) || (from.includes(a[1]) && e.to.includes(a[0])); });
      if (!fits) { msgs.add('Есть лишняя стрелка — она соединяет не те слова.'); wrong.add(a[0]); wrong.add(a[1]); }
    }
    return { ok: !msgs.size, wrong: [...wrong], msgs: [...msgs] };
  }

  /* bars: массив групп — в каждой группе допустимые позиции одной границы */
  function checkBars(m, groups, also = []) {
    const msgs = [];
    const missing = groups.filter((g) => !g.some((k) => m.bars.includes(k)));
    const allowed = new Set([...groups.flat(), ...also.flat()]);
    const extra = m.bars.filter((k) => !allowed.has(k));
    if (missing.length) msgs.push('Отмечены не все границы оборотов (вертикальная черта | в начале и в конце оборота).');
    if (extra.length) msgs.push('Есть лишние границы — они стоят не на краю оборота.');
    return { ok: !missing.length && !extra.length, wrongGaps: [...extra, ...missing.map((g) => g[0])], wrong: [], msgs };
  }

  /* Главные слова: в каждой группе — допустимые варианты одного главного слова */
  function checkCrossGroups(m, groups, optional = []) {
    const msgs = [], wrong = [];
    const missing = groups.filter((g) => !g.some((k) => m.cross.includes(k)));
    const allowed = new Set([...groups.flat(), ...optional]);
    const extra = m.cross.filter((k) => !allowed.has(k));
    if (missing.length) { msgs.push('Отмечены не все главные слова (×). У каждого оборота — своё главное слово.'); wrong.push(...missing.map((g) => g[0])); }
    if (extra.length) { msgs.push('Крестик стоит не над главным словом. Главное слово — то, от которого задаём вопрос к обороту.'); wrong.push(...extra); }
    return { ok: !missing.length && !extra.length, wrong, msgs };
  }

  /* Подписи: у каждого оборота хотя бы одна верная подпись, лишних неверных нет */
  function checkLabels(m, obs) {
    const msgs = new Set(), wrong = new Set();
    for (const ob of obs) {
      const ws = [...ob.words, ...(ob.opt || [])];
      if (!ws.some((w) => ob.lab.includes(m.labels[w]))) { msgs.add('Подпиши над каждым оборотом, чем он выражен (ПО, ДО, прил.…).'); wrong.add(ob.words[0]); }
    }
    for (const k of Object.keys(m.labels)) {
      const wi = +k;
      const fits = obs.some((ob) => [...ob.words, ...(ob.opt || [])].includes(wi) && ob.lab.includes(m.labels[wi]));
      if (!fits) { msgs.add(`Подпись «${m.labels[wi]}» стоит не там или не та. ПО — причастный оборот, ДО — деепричастный.`); wrong.add(wi); }
    }
    return { ok: !msgs.size, wrong: [...wrong], msgs: [...msgs] };
  }

  function checkRings(m, need, optional = []) {
    return checkSet(m.rings, need, optional, {
      missing: 'Возьми в кружок союз, который соединяет однородные обороты.',
      extra: 'В кружок берём только союз между однородными оборотами.',
    });
  }

  return { parse, find, Board, toolbar, emptyMarks, BASE_COLORS, LABELS, checkBases, checkSet, checkArrows, checkBars, checkCrossGroups, checkLabels, checkRings, clone };
})();

/* Движок разметки предложения: основы, обороты, главные слова, стрелки, границы */
const Markup = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  // цвет основы: 1-я — фиолетовая, остальные — свои цвета (второстепенные члены всегда фиолетовые)
  const BASE_COLORS = { 1: '#7c3aed', 2: '#f59e0b', 3: '#ec4899', 4: '#14b8a6', 5: '#0ea5e9', 6: '#84cc16' };
  // Подписи над словами: чем выражен член предложения
  const LABELS = ['ПО', 'ДО', 'прил.', 'прич.', 'деепр.', 'прил.+з.с.', 'несмотря на + з.с.', 'невзирая на + з.с.'];
  let uid = 0;

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (w) => w.toLowerCase().replace(/ё/g, 'е');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const emptyMarks = () => ({ mem: {}, def: [], circ: [], obj: [], cross: [], bars: [], arrows: [], labels: {}, lspan: {}, rings: [], rl: [], commas: [], gm: {}, boxes: [], links: [] });
  // Вопросы для подписи над стрелкой
  const QUESTIONS = ['какой?', 'какая?', 'какое?', 'какие?', 'что делая?', 'что сделав?', 'как?', 'где?', 'когда?', 'куда?', 'почему?', 'вопреки чему?', 'что?', 'чего?'];
  const normMarks = (m) => Object.assign(emptyMarks(), m ? clone(m) : {});
  const toggle = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
  const without = (arr, v) => arr.filter((x) => x !== v);

  /* Разбор предложения: слова, знаки препинания и цифры (1), (2)... */
  function parse(text) {
    const items = [], words = [];
    const re = /\((\d+)\)|(\n)|[^\s()]+/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[1]) { items.push({ k: 'd', n: +m[1] }); continue; }
      if (m[2]) { items.push({ k: 'br' }); continue; }
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
      this.autoCross = !!opts.autoCross;
      this.spanRings = !!opts.spanRings;
      this.romanBases = !!opts.romanBases;
      this.marks = normMarks(opts.marks);
      this.labelSet = opts.labels || LABELS;
      // у готовых примеров линии соединяются только внутри одной фразы (links), у ученика — всегда
      this.useLinks = !!opts.useLinks;
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
        this.ro = new ResizeObserver(() => { this.alignPatterns(); this.drawArrows(); });
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
        g.classList.toggle('comma-slot', k > 0 && k < this.sent.words.length);
        g.innerHTML = '<b class="gch"></b><span class="w">​<b class="bar"></b><span class="lines"></span></span>';
        s.appendChild(g);
        this.gapEls[k] = g;
      };
      for (const it of this.sent.items) {
        if (it.k === 'br') { s.appendChild(document.createElement('br')); continue; }
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
          t.innerHTML = (it.pre ? `<span class="p">${esc(it.pre)}</span>` : '') +
            `<span class="w"><span class="lbl"></span>${esc(it.text)}<span class="lines"></span></span>` +
            (it.punct ? `<b class="bar-in"></b><span class="p">${esc(it.punct)}</span>` : '');
          if (it.punct) t.classList.add('has-p');
          s.appendChild(t);
          this.wordEls[it.wi] = t;
        }
      }
      mkGap(this.sent.words.length);
    }

    /* Заменить цифры запятыми (для показа верного ответа) */
    // цифры остаются на месте (иначе непонятно, какой ответ писать); где нужна запятая — она появляется перед цифрой
    showCommas(list) {
      for (const d of this.digEls) {
        d.classList.remove('comma', 'gone', 'nocomma');
        const n = d.dataset.n;
        if (list.includes(+n)) { d.innerHTML = `<b class="cm">,</b>(${n})`; d.classList.add('comma'); }
        else { d.textContent = '(' + n + ')'; d.classList.add('nocomma'); }
      }
    }

    lineAt(wi) {
      const m = this.marks;
      const mem = m.mem[wi];
      if (mem) return { k: 'mem', t: mem.t, b: mem.b };
      const k = ['def', 'circ', 'obj'].find((type) => m[type].includes(wi));
      return k ? { k } : null;
    }

    lineHtml(line) {
      if (!line) return '';
      if (line.k === 'mem') return `<i class="ln l-mem ${line.t === 's' ? 'single' : 'double'}" style="top:1px;--c:${BASE_COLORS[line.b]}"></i>`;
      return `<i class="ln l-${line.k}" style="top:1px"></i>`;
    }

    render() {
      const m = this.marks;
      const n = this.sent.words.length;
      const baseLabels = {};
      if (this.romanBases) {
        const seen = new Set();
        for (const [i, base] of Object.entries(m.mem)) {
          if (seen.has(base.b)) continue;
          seen.add(base.b);
          baseLabels[i] = ['I', 'II', 'III', 'IV'][seen.size - 1];
        }
        if (seen.size < 2) delete baseLabels[Object.keys(baseLabels)[0]];
      }
      for (let wi = 0; wi < n; wi++) {
        const t = this.wordEls[wi];
        t.querySelector('.lines').innerHTML = this.lineHtml(this.lineAt(wi));
        t.classList.toggle('x', m.cross.includes(wi));
        t.classList.toggle('ring', m.rings.includes(wi));
        t.classList.toggle('box', m.boxes.includes(wi));
        const lb = m.labels[wi] || '';
        t.querySelector('.lbl').innerHTML = lb.startsWith('o:') ? `<span class="oc oc-${esc(lb.slice(2))}"></span>` : esc(lb);
        t.classList.toggle('has-lbl', !!lb);
        t.dataset.base = baseLabels[wi] || '';
        t.classList.toggle('pending', this.pending === wi);
      }
      const marked = new Set([...m.def, ...m.circ]);
      this.digEls.forEach((d) => d.classList.remove('bar-before'));
      for (let wi = 0; wi < n; wi++) this.wordEls[wi].classList.remove('bar-end');
      for (let k = 0; k <= n; k++) {
        const g = this.gapEls[k];
        // закрывающая палочка встаёт до запятой (цифры), а не после неё
        let inGap = m.bars.includes(k);
        if (inGap && k > 0 && marked.has(k - 1) && !marked.has(k)) {
          const prevEl = g.previousElementSibling;
          if (prevEl && prevEl.classList.contains('dig')) { prevEl.classList.add('bar-before'); inGap = false; }
          else if (this.wordEls[k - 1].classList.contains('has-p')) { this.wordEls[k - 1].classList.add('bar-end'); inGap = false; }
        }
        g.classList.toggle('on', inGap);
        const ch = m.gm[k] || '';
        g.classList.toggle('has-comma', m.commas.includes(k));
        g.querySelector('.gch').textContent = ch;
        g.classList.toggle('brk', !!ch);
        g.style.width = ch ? (0.5 * ch.length + 0.4) + 'em' : '';
        let joined = null;
        if (k > 0 && k < n && (!this.useLinks || (m.links || []).includes(k))) {
          const a = this.lineAt(k - 1), b = this.lineAt(k);
          if (a && b && a.k === b.k && a.t === b.t && a.b === b.b) joined = a;
        }
        g.querySelector('.lines').innerHTML = this.lineHtml(joined);
      }
      // кружок вокруг нескольких слов («не только», «но и») рисуется одним овалом
      const rg = this.ringGroups();
      for (let wi = 0; wi < n; wi++) this.wordEls[wi].classList.toggle('ringg', rg.some((g) => g.length > 1 && g.includes(wi)));
      this.el.classList.toggle('has-arrows', m.arrows.length > 0);
      this.alignPatterns();
      this.drawArrows();
    }

    /* Волнистая и точка-тире продолжаются без «склеек» между словами */
    ringGroups() {
      const m = this.marks, rl = m.rl || [], gs = [];
      [...m.rings].sort((a, b) => a - b).forEach((i) => { const g = gs[gs.length - 1]; if (g && g[g.length - 1] === i - 1 && rl.includes(i)) g.push(i); else gs.push([i]); });
      return gs;
    }

    alignPatterns() {
      const sr = this.sentEl.getBoundingClientRect();
      if (!sr.width) return;
      this.sentEl.querySelectorAll('.ln.l-def, .ln.l-circ').forEach((el) => {
        el.style.backgroundPositionX = `${-(el.getBoundingClientRect().left - sr.left)}px`;
      });
    }

    drawArrows() {
      const br = this.el.getBoundingClientRect();
      if (!br.width) return;
      const aid = 'ah' + this.id;
      // от главного (определяемого) слова — фиолетовые стрелки, к зависимым словам — оранжевые
      const mk = (id, c) => `<marker id="${id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5.5" markerHeight="5.5" markerUnits="strokeWidth" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah" style="fill:${c};stroke:none"/></marker>`;
      let h = `<defs>${mk(aid, '#7c3aed')}${mk(aid + 'd', '#ea580c')}</defs>`;
      for (const [a, b, label] of this.marks.arrows) {
        const ea = this.wordEls[a], eb = this.wordEls[b];
        if (!ea || !eb) continue;
        const dep = !this.marks.cross.includes(a);
        const mid = dep ? aid + 'd' : aid, cls = dep ? ' class="dep"' : '';
        const ra = ea.querySelector('.w').getBoundingClientRect();
        const rb = eb.querySelector('.w').getBoundingClientRect();
        // стрелки идут выше строки подписей, чтобы не перекрывать их
        const fs = parseFloat(getComputedStyle(this.sentEl).fontSize) || 18;
        const x1 = ra.left + ra.width / 2 - br.left;
        const y1 = ra.top - br.top - fs * 1.15;
        const x2 = rb.left + rb.width / 2 - br.left;
        const y2 = rb.top - br.top - fs * 1.15;
        let mx, my;
        const f = (n) => n.toFixed(1);
        if (Math.abs(y1 - y2) < 24) {
          // одна строка — дуга над словами
          const lift = 10 + Math.min(8, Math.abs(x2 - x1) * 0.05);
          const cy = Math.max(2, Math.min(y1, y2) - lift);
          h += `<path d="M${f(x1)},${f(y1)} Q${f((x1 + x2) / 2)},${f(cy)} ${f(x2)},${f(y2)}" marker-end="url(#${mid})"${cls}/>`;
          mx = (x1 + (x1 + x2) + x2) / 4; my = (y1 + 2 * cy + y2) / 4;
        } else {
          // разные строки — S-образная кривая, входящая в слово сверху
          // разные строки — заходим в слово сверху, вопрос пишем над концом стрелки
          const top = Math.min(y1, y2) - 16;
          h += `<path d="M${f(x1)},${f(y1)} C${f(x1)},${f(top)} ${f(x2)},${f(top)} ${f(x2)},${f(y2)}" marker-end="url(#${mid})"${cls}/>`;
          mx = x2; my = y2 - 12;
        }
        if (label) h += `<text x="${f(mx)}" y="${f(my - 4)}" text-anchor="middle" class="arr-q${dep ? ' dep' : ''}">${esc(label)}</text>`;
      }
      // овалы вокруг союзов из нескольких слов
      for (const g of this.ringGroups()) {
        if (g.length < 2) continue;
        const a = this.wordEls[g[0]].querySelector('.w').getBoundingClientRect(), b = this.wordEls[g[g.length - 1]].querySelector('.w').getBoundingClientRect();
        if (Math.abs(a.top - b.top) > 10) continue;
        const x = a.left - br.left - 2, y = a.top - br.top - 2, w = b.right - a.left + 4, hh = a.height + 4;
        h += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" rx="${(hh / 2).toFixed(1)}" class="ring-oval"/>`;
      }
      this.svg.innerHTML = h;
      // подпись над оборотом из нескольких слов — по центру оборота
      this.wordEls.forEach((t) => { const l = t.querySelector('.lbl'); l.style.left = ''; });
      for (const [k, n] of Object.entries(this.marks.lspan || {})) {
        const i = +k, j = i + n - 1, ea = this.wordEls[i], eb = this.wordEls[j];
        if (!ea || !eb) continue;
        const a = ea.querySelector('.w').getBoundingClientRect(), b = eb.querySelector('.w').getBoundingClientRect();
        if (Math.abs(a.top - b.top) > 10) continue;
        ea.querySelector('.lbl').style.left = ((a.left + b.right) / 2 - a.left) + 'px';
      }
    }

    setTool(t) { this.el.classList.toggle('comma-mode', t === 'comma'); this.tool = t; this.pending = null; this.closeMenu(); this.render(); }
    setBase(b) { this.base = b; }
    getMarks() { return clone(this.marks); }
    setMarks(m) { this.marks = normMarks(m); this.pending = null; this.closeMenu(); this.render(); this.onChange(this.getMarks()); }
    startStage() { this.hist.length = 0; this.setTool(null); }
    snap() { this.hist.push(JSON.stringify(this.marks)); if (this.hist.length > 60) this.hist.shift(); }
    undo() { this.closeMenu(); if (!this.hist.length) return false; this.marks = JSON.parse(this.hist.pop()); this.pending = null; this.changed(); return true; }
    clear() { this.snap(); this.marks = emptyMarks(); this.pending = null; this.closeMenu(); this.changed(); }
    changed() { this.render(); this.onChange(this.getMarks()); }

    has(wi) {
      const m = this.marks;
      switch (this.tool) {
        case 'subj': return m.mem[wi] && m.mem[wi].t === 's' && m.mem[wi].b === this.base;
        case 'pred': return m.mem[wi] && m.mem[wi].t === 'p' && m.mem[wi].b === this.base;
        case 'def': return m.def.includes(wi);
        case 'circ': return m.circ.includes(wi);
        case 'cross': return m.cross.includes(wi);
        case 'ring': return m.rings.includes(wi);
        case 'box': return m.boxes.includes(wi);
        case 'obj': return m.obj.includes(wi);
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
        case 'def': m.def = without(m.def, wi); if (on) { m.def.push(wi); m.circ = without(m.circ, wi); } break;
        case 'circ': m.circ = without(m.circ, wi); if (on) { m.circ.push(wi); m.def = without(m.def, wi); } break;
        case 'cross': m.cross = without(m.cross, wi); if (on) m.cross.push(wi); break;
        case 'ring': m.rings = without(m.rings, wi); if (on) m.rings.push(wi); break;
        case 'box': m.boxes = without(m.boxes, wi); if (on) m.boxes.push(wi); break;
        case 'obj': m.obj = without(m.obj, wi); if (on) m.obj.push(wi); break;
        case 'erase':
          if (!this.keepBases) delete m.mem[wi];
          m.def = without(m.def, wi); m.circ = without(m.circ, wi); m.cross = without(m.cross, wi);
          m.rings = without(m.rings, wi); m.obj = without(m.obj, wi); m.boxes = without(m.boxes, wi); delete m.labels[wi];
          m.arrows = m.arrows.filter((a) => a[0] !== wi && a[1] !== wi);
          if (this.autoCross) m.cross = [...new Set(m.arrows.map(([from]) => from))];
          break;
      }
    }

    bind() {
      const s = this.sentEl;
      s.addEventListener('pointerdown', (e) => {
        if (this.readOnly) return;
        if (!this.tool) { this.onTap('notool'); return; }
        const tok = e.target.closest('.tok');
        const gap = e.target.closest('.gap');
        if (this.tool === 'comma') {
          if (gap && +gap.dataset.g > 0 && +gap.dataset.g < this.sent.words.length) {
            this.snap();
            toggle(this.marks.commas, +gap.dataset.g);
            this.changed();
          }
          return;
        }
        if (this.tool === 'hom') {
          if (tok) this.openMenu(+tok.dataset.w, ['o:s', 'o:p', 'o:def', 'o:obj', 'o:circ']);
          return;
        }
        if (this.tool === 'brk') {
          let k = null;
          if (gap) k = +gap.dataset.g;
          else if (tok) { const r = tok.getBoundingClientRect(); const wi = +tok.dataset.w; k = e.clientX < r.left + r.width / 2 ? wi : wi + 1; }
          if (k != null) this.openGapMenu(k);
          return;
        }
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
            if (this.autoCross && !this.marks.cross.includes(a[0])) this.marks.cross.push(a[0]);
            let ai = this.marks.arrows.findIndex((x) => x[0] === a[0] && x[1] === a[1]);
            if (ai < 0) { this.marks.arrows.push(a); ai = this.marks.arrows.length - 1; }
            this.pending = null;
            this.changed();
            this.onTap('mark');
            this.openQMenu(ai, wi);
            return;
          }
          this.render();
          this.onTap('pending');
          return;
        }
        if (this.tool === 'erase' && gap && !tok) {
          const k = +gap.dataset.g;
          if (this.marks.bars.includes(k) || this.marks.gm[k]) { this.snap(); this.marks.bars = without(this.marks.bars, k); delete this.marks.gm[k]; this.changed(); }
          return;
        }
        if (!tok) return;
        e.preventDefault();
        this.snap();
        const wi = +tok.dataset.w;
        this.dragOn = this.tool === 'erase' ? true : !this.has(wi);
        this.visited = new Set([wi]);
        this.ringFrom = wi;
        if (this.tool === 'ring' && this.spanRings && !this.dragOn) {
          const group = this.ringGroups().find((g) => g.includes(wi));
          group.forEach((w) => this.apply(w, false));
          this.marks.rl = this.marks.rl.filter((w) => !group.includes(w));
        }
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
        if (this.tool === 'ring' && this.spanRings && this.dragOn) {
          const first = Math.min(this.ringFrom, wi), last = Math.max(this.ringFrom, wi);
          for (let i = first; i <= last; i++) {
            this.apply(i, true);
            if (i > first && !this.marks.rl.includes(i)) this.marks.rl.push(i);
          }
        } else this.apply(wi, this.dragOn);
        this.render();
      });
      const up = () => { if (this.dragging) { this.dragging = false; this.changed(); } };
      s.addEventListener('pointerup', up);
      s.addEventListener('pointercancel', up);
    }

    /* Меню подписей над словом */
    openMenu(wi, labels = this.labelSet) {
      this.closeMenu();
      const t = this.wordEls[wi], br = this.el.getBoundingClientRect(), r = t.getBoundingClientRect();
      const menu = document.createElement('div');
      menu.className = 'lbl-menu';
      menu.innerHTML = labels.map((l) => `<button data-l="${esc(l)}">${l.startsWith('o:') ? `<span class="oc oc-${esc(l.slice(2))}"></span>` : esc(l)}</button>`).join('');
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
    /* Подпись вопроса над только что проведённой стрелкой */
    openQMenu(ai, wi) {
      // вопрос к стрелке ученик вписывает сам — без готовых вариантов
      this.closeMenu();
      const t = this.wordEls[wi], br = this.el.getBoundingClientRect(), r = t.getBoundingClientRect();
      const menu = document.createElement('div');
      menu.className = 'lbl-menu q-menu';
      const cur = (this.marks.arrows[ai] || [])[2] || '';
      menu.innerHTML = `<div class="qm-h">Впиши вопрос к стрелке</div><input class="qm-in" maxlength="24" autocomplete="off" placeholder="вопрос" value="${esc(cur)}"><button class="qm-ok">Готово</button>`;
      menu.style.top = r.bottom - br.top + 4 + 'px';
      menu.style.left = Math.max(0, Math.min(br.width - 250, r.left - br.left - 20)) + 'px';
      menu.addEventListener('pointerdown', (e) => e.stopPropagation());
      const inp = menu.querySelector('input');
      const done = () => {
        const a = this.marks.arrows[ai];
        let q = inp.value.trim().replace(/\s+/g, ' ');
        if (q && !q.endsWith('?')) q += '?';
        if (a) { if (q) a[2] = q; else a.length = 2; }
        this.closeMenu(); this.changed();
      };
      menu.querySelector('.qm-ok').addEventListener('click', done);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
      this.el.appendChild(menu);
      this.menu = menu;
      setTimeout(() => inp.focus(), 30);
    }

    /* Меню скобок в промежутке между словами */
    openGapMenu(k) {
      this.closeMenu();
      const g = this.gapEls[k], br = this.el.getBoundingClientRect(), r = g.getBoundingClientRect();
      const menu = document.createElement('div');
      menu.className = 'lbl-menu gap-menu';
      menu.innerHTML = ['[', ']', '(', ')', '{', '}'].map((c) => `<button data-c="${c}">${c}</button>`).join('') + (this.marks.gm[k] ? '<button data-c="" class="del">✕</button>' : '');
      menu.style.top = r.bottom - br.top + 4 + 'px';
      menu.style.left = Math.max(0, Math.min(br.width - 230, r.left - br.left - 40)) + 'px';
      menu.addEventListener('pointerdown', (e) => e.stopPropagation());
      menu.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.snap();
        if (b.dataset.c) this.marks.gm[k] = b.dataset.c; else delete this.marks.gm[k];
        this.closeMenu(); this.changed(); this.onTap('mark');
      });
      this.el.appendChild(menu);
      this.menu = menu;
      g.classList.add('pending-gap');
    }
    closeMenu() {
      this.el.querySelectorAll('.pending-gap').forEach((e) => e.classList.remove('pending-gap'));
      if (this.menu) { this.menu.remove(); this.menu = null; }
      this.el.querySelectorAll('.tok.pending').forEach((e) => e.classList.remove('pending'));
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
    ring: { label: 'В кружок', glyph: '<b class="g-ring">и</b>' },
    obj: { label: 'Дополнение', glyph: '<i class="g g-dashed"></i>' },
    brk: { label: 'Скобки', glyph: '<b class="g-brk">[ ]</b>' },
    box: { label: 'В квадрат', glyph: '<b class="g-box">то</b>' },
    bar: { label: 'Граница', glyph: '<b class="g-bar">|</b>' },
    comma: { label: 'Запятая', glyph: '<b class="g-lbl">,</b>' },
    hom: { label: 'Однородный член', glyph: '<b class="g-lbl">○</b>' },
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
      if (!x) { wrong.add(i); msgs.add(e.t === 's' ? 'Найдены не все подлежащие (подлежащее — одной чертой, отвечает на вопрос кто? что?).' : 'Найдены не все сказуемые (сказуемое — двумя чертами). Подсказка: в составе одного сказуемого может быть несколько слов.'); }
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
      const hit = m.arrows.find((a) => from.includes(a[0]) && e.to.includes(a[1]));
      const ok = !!hit;
      if (hit && e.questions) {
        const q = norm(hit[2] || '').replace(/\?/g, '').trim();
        if (!q) { msgs.add('Над стрелкой не хватает вопроса — впиши его (нажми ещё раз на главное слово, потом на слово оборота).'); wrong.add(hit[1]); }
        else if (!e.questions.includes(q.replace(/\s+/g, ' '))) {
          msgs.add(e.k === 'def' ? 'Согласуй вопрос к определению с определяемым словом.' : 'Проверь вопрос к деепричастию.');
          wrong.add(hit[1]);
        }
      }
      if (!ok) {
        const rev = m.arrows.some((a) => from.includes(a[1]) && e.to.includes(a[0]));
        msgs.add(rev ? 'Стрелка идёт ОТ главного слова К обороту — разверни её.' : 'Не хватает стрелки от главного слова к обороту.');
        wrong.add(from[0]);
      }
    }
    for (const a of m.arrows) {
      const fits = [...expected, ...also].some((e) => { const from = [].concat(e.from); return from.includes(a[0]) && e.to.includes(a[1]); });
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
  function checkLabels(m, obs, also = []) {
    const msgs = new Set(), wrong = new Set();
    for (const ob of obs) {
      const ws = [...ob.words, ...(ob.opt || [])];
      if (!ws.some((w) => ob.lab.includes(m.labels[w]))) { msgs.add('Подпиши над каждым оборотом, чем он выражен (ПО, ДО, прил.…).'); wrong.add(ob.words[0]); }
    }
    for (const k of Object.keys(m.labels)) {
      const wi = +k;
      const fits = [...obs, ...also].some((ob) => [...ob.words, ...(ob.opt || [])].includes(wi) && ob.lab.includes(m.labels[wi]));
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

  /* Несколько предложений под одной панелью инструментов */
  class BoardGroup {
    constructor(boards) {
      this.boards = boards; this.last = boards[0];
      boards.forEach((b) => { const prev = b.onTap; b.onTap = (k) => { this.last = b; prev(k); }; });
    }
    setTool(t) { this.boards.forEach((b) => b.setTool(t)); }
    setBase(x) { this.boards.forEach((b) => b.setBase(x)); }
    undo() { return this.last.undo(); }
    clear() { this.boards.forEach((b) => b.clear()); }
  }

  return { parse, find, Board, BoardGroup, toolbar, emptyMarks, BASE_COLORS, LABELS, checkBases, checkSet, checkArrows, checkBars, checkCrossGroups, checkLabels, checkRings, clone };
})();

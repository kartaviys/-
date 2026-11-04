/* Задание 17. Знаки препинания при обособленных членах предложения */
(() => {
  const { h, coin } = App;
  const M = Markup;
  const ALGO = 'assets/algorithm17.png';
  const IMG_W = 1224, IMG_H = 2000;

  /* Узлы интеллект-карты (координаты на картинке) */
  const NODES = {
    all: [0, 0, IMG_W, IMG_H],
    top: [430, 30, 280, 115],
    bases: [447, 92, 239, 43],
    branches: [238, 186, 720, 56],
    defFind: [243, 192, 238, 45],
    defMain: [243, 257, 238, 44],
    nounQ: [94, 327, 238, 45],
    pronQ: [352, 327, 238, 45],
    beforeQ: [94, 461, 238, 47],
    meaningQ: [39, 585, 238, 87],
    betweenQ: [175, 796, 196, 65],
    noCommas: [274, 953, 98, 46],
    circFind: [714, 192, 238, 45],
    circWord: [622, 277, 512, 66],
    circMain: [764, 364, 238, 46],
    circDeps: [764, 430, 238, 66],
    final: [298, 1893, 238, 67],
    moreQ: [759, 1119, 237, 64],
    sameQ: [713, 1285, 169, 65],
    sameNo: [838, 1368, 79, 64],
  };

  class Zoom {
    constructor(host) {
      this.el = h(`<div class="zoom" title="Нажми, чтобы открыть схему целиком"><div class="zl"><img src="${ALGO}" alt="" draggable="false"><div class="zhl"></div></div><span class="zoom-tag">🔍 схема</span></div>`);
      host.appendChild(this.el);
      this.layer = this.el.querySelector('.zl');
      this.hl = this.el.querySelector('.zhl');
      this.el.addEventListener('click', () => App.openAlgo(ALGO));
    }
    go(key, instant) {
      const [x, y, w, hh] = NODES[key];
      const W = this.el.clientWidth || 340, H = this.el.clientHeight || 190;
      const pad = key === 'all' ? 1 : 0.78;
      const s = Math.min((W / w) * pad, (H / hh) * pad, 2.2);
      const tx = W / 2 - (x + w / 2) * s, ty = H / 2 - (y + hh / 2) * s;
      this.layer.style.transition = instant ? 'none' : '';
      this.layer.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
      Object.assign(this.hl.style, { left: x - 8 + 'px', top: y - 8 + 'px', width: w + 16 + 'px', height: hh + 16 + 'px', opacity: key === 'all' ? 0 : 1 });
    }
    /* Эффект «приближения»: сначала вся схема, затем нужный шаг */
    zoomTo(key) {
      requestAnimationFrame(() => {
        this.go('all', true);
        setTimeout(() => this.go(key), 350);
      });
    }
  }

  /* ===== Предложения и эталонная разметка ===== */
  const S1 = M.parse('Утром метель улеглась, было тихо, только изредка набегал прохладный ветер (1) приподнимая (2) покрытые инеем (3) гривы лошадей (4) да шевелил ветви деревьев.');
  const S2 = M.parse('Внезапно осины зашептались (1) с коротким шумом вздрагивая листьями (2) и заволновались; облако белых пушинок сорвалось с их серёжек и (3) словно сговорившись с ветром (4) весело понеслось в темнеющую чащу.');
  const f1 = (p) => M.find(S1, p), f2 = (p) => M.find(S2, p);
  const w1 = (p) => f1(p)[0], w2 = (p) => f2(p)[0];

  const SPEC1 = {
    bases: { groups: [{ s: f1('метель'), p: f1('улеглась') }, { s: f1('ветер'), p: [w1('набегал'), w1('шевелил')] }], optional: f1('было тихо') },
    def: f1('покрытые инеем'),
    defOpt: [w1('прохладный'), w1('лошадей'), w1('деревьев')],
    circ: f1('приподнимая покрытые инеем гривы лошадей'),
    circOpt: [w1('утром'), w1('изредка')],
    defCross: [w1('гривы')],
    circCross: [w1('набегал')],
    defArrow: [{ from: w1('гривы'), to: f1('покрытые инеем') }],
    circArrow: [{ from: w1('набегал'), to: f1('приподнимая покрытые инеем гривы лошадей') }],
    defBars: [[w1('покрытые')], [w1('гривы')]],
    circBars: [[w1('приподнимая')], [w1('да')]],
    answer: '14',
  };
  const SPEC2 = {
    bases: { groups: [{ s: f2('осины'), p: [w2('зашептались'), w2('заволновались')] }, { s: f2('облако'), p: [w2('сорвалось'), w2('понеслось')] }] },
    def: [],
    defOpt: [w2('белых'), w2('коротким'), w2('темнеющую'), w2('их'), w2('пушинок')],
    circ: [...f2('с коротким шумом вздрагивая листьями'), ...f2('сговорившись с ветром')],
    circOpt: [w2('словно'), w2('внезапно'), w2('весело'), ...f2('с их серёжек'), ...f2('в темнеющую чащу')],
    cross: [w2('зашептались'), w2('понеслось')],
    arrows: [
      { from: w2('зашептались'), to: f2('с коротким шумом вздрагивая листьями') },
      { from: w2('понеслось'), to: f2('словно сговорившись с ветром'), head: w2('сговорившись') },
    ],
    bars: [[w2('с')], [w2('листьями') + 1], [w2('словно'), w2('сговорившись')], [w2('весело')]],
    answer: '1234',
  };

  function solution(spec) {
    const m = M.emptyMarks();
    spec.bases.groups.forEach((g, gi) => {
      g.s.forEach((i) => (m.mem[i] = { t: 's', b: gi + 1 }));
      g.p.forEach((i) => (m.mem[i] = { t: 'p', b: gi + 1 }));
    });
    m.def = [...spec.def];
    m.circ = [...spec.circ, ...(spec.circExtraSol || [])];
    m.cross = [...spec.cross];
    m.bars = spec.bars.map((g) => g[0]);
    m.arrows = spec.arrows.map((a) => [a.from, a.head ?? a.to[0]]);
    return m;
  }
  const SOL1 = solution({ ...SPEC1, cross: [...SPEC1.defCross, ...SPEC1.circCross], bars: [...SPEC1.defBars, ...SPEC1.circBars], arrows: [...SPEC1.defArrow, ...SPEC1.circArrow] });
  const SOL2 = solution({ ...SPEC2, circExtraSol: [w2('словно')] });

  const normAns = (s) => [...new Set(s.replace(/\D/g, '').split(''))].sort().join('');

  /* ===== Проверки по шагам ===== */
  const chk = {
    bases: (spec) => (m) => M.checkBases(m, spec.bases),
    def: (spec) => (m) => M.checkSet(m.def, spec.def, spec.defOpt, {
      missing: 'Волнистой линией подчеркни все слова причастного оборота (причастие + зависимые слова).',
      extra: 'Волнистой линией подчёркнуто лишнее. Определение отвечает на вопрос какой?',
    }),
    circ: (spec) => (m) => M.checkSet(m.circ, spec.circ, spec.circOpt, {
      missing: 'Точкой-тире подчеркни все слова деепричастного оборота — до самого конца, вместе с зависимыми словами.',
      extra: 'Точкой-тире подчёркнуто лишнее — эти слова не входят в оборот.',
    }),
    cross: (need, also) => (m) => M.checkSet(m.cross, need, also, {
      missing: 'Поставь × над главным словом — тем, от которого задаётся вопрос к обороту.',
      extra: 'Крестик стоит не над тем словом.',
    }),
    arrows: (need, also) => (m) => M.checkArrows(m, need, also),
    bars: (need, also) => (m) => M.checkBars(m, need, also),
  };

  /* ===== Общие кусочки слайдов ===== */
  const legend = () => `<div class="legend">
      <div><i class="g g-single" style="--c:#7c3aed"></i>подлежащее</div>
      <div><i class="g g-double" style="--c:#7c3aed"></i>сказуемое</div>
      <div><i class="g g-wavy"></i>определение</div>
      <div><i class="g g-dashdot"></i>обстоятельство</div>
      <div><b class="g-x">×</b>главное слово</div>
      <div><b class="g-bar">|</b>границы оборота</div>
    </div>`;

  function slideShell(body, { chip, title, text }) {
    const el = h(`<div class="slide">
      ${chip ? `<div class="step-chip">${chip}</div>` : ''}
      ${title ? `<h2>${title}</h2>` : ''}
      <div class="zoom-host"></div>
      ${text ? `<p class="lead">${text}</p>` : ''}
      <div class="board-host"></div>
      <div class="tool-host"></div>
      <div class="extra-host"></div>
    </div>`);
    body.appendChild(el);
    return {
      el,
      zoomHost: el.querySelector('.zoom-host'),
      boardHost: el.querySelector('.board-host'),
      toolHost: el.querySelector('.tool-host'),
      extraHost: el.querySelector('.extra-host'),
    };
  }

  /* Слайд с разметкой и пошаговой проверкой */
  function markSlide({ zoom, chip, title, text, tools, checks, hint, reveal, xp = 20, coins = 10, done, unlockOnPass }) {
    return (body, api) => {
      const sh = slideShell(body, { chip, title, text });
      if (zoom) new Zoom(sh.zoomHost).zoomTo(zoom);
      const d = api.ctx.data;
      const board = new M.Board(sh.boardHost, S1, { marks: d.m1, onChange: (m) => { d.m1 = m; } });
      M.toolbar(sh.toolHost, board, tools);
      let tries = 0;
      const hintBtn = { extraLabel: `💡 Подсказка · 5`, onExtra: () => api.spendHint(5, hint) };
      const check = () => {
        const m = board.getMarks();
        const res = checks.map((c) => c(m));
        if (res.every((r) => r.ok)) {
          board.flash(Object.keys(m.mem).map(Number).concat(m.def, m.circ, m.cross));
          api.good(tries ? Math.round(xp / 2) : xp, tries ? Math.round(coins / 2) : coins, null, done);
          if (unlockOnPass) api.unlock(unlockOnPass);
          api.foot({ label: 'Дальше' });
          return;
        }
        tries++;
        board.markWrong(res.flatMap((r) => r.wrong));
        board.markWrongGaps(res.flatMap((r) => r.wrongGaps || []));
        api.bad([...new Set(res.flatMap((r) => r.msgs))]);
        if (tries >= 2) {
          api.foot({
            label: 'Проверить', onClick: check, extraLabel: '👀 Показать ответ',
            onExtra: () => {
              board.setMarks(reveal(board.getMarks()));
              api.feedback('info', `<b>Вот верная разметка.</b> Посмотри внимательно и жми «Дальше».${done ? `<div>${done}</div>` : ''}`);
              api.foot({ label: 'Дальше' });
            },
          });
        } else api.foot({ label: 'Проверить', onClick: check, ...hintBtn });
      };
      api.foot({ label: 'Проверить', onClick: check, ...hintBtn });
    };
  }

  /* Слайд-«развилка» по алгоритму: вопросы да/нет с приближением схемы */
  function quizSlide({ chip, title, text, steps, outro, showBoard = true }) {
    return (body, api) => {
      const sh = slideShell(body, { chip, title, text });
      const zoom = new Zoom(sh.zoomHost);
      zoom.zoomTo(steps[0].node);
      if (showBoard) new M.Board(sh.boardHost, S1, { readOnly: true, marks: api.ctx.data.m1 });
      const qa = h('<div class="qa"></div>');
      sh.extraHost.appendChild(qa);
      let i = 0;
      const ask = () => {
        const s = steps[i];
        if (i > 0) zoom.go(s.node);
        api.feedback(null);
        api.foot({ label: 'Ответь на вопрос', enabled: false });
        qa.innerHTML = `<div class="q-count">Вопрос ${i + 1} из ${steps.length}</div><div class="q">${s.q}</div>
          <div class="opts">${s.options.map((o, j) => `<button class="opt" data-j="${j}">${o}</button>`).join('')}</div>`;
        let wrongOnce = false;
        qa.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
          const j = +b.dataset.j;
          if (j === s.correct) {
            b.classList.add('right');
            qa.querySelectorAll('.opt').forEach((x) => (x.disabled = true));
            api.good(wrongOnce ? 3 : 6, wrongOnce ? 0 : 2, b, s.ok);
            if (s.then) zoom.go(s.then);
            const last = i === steps.length - 1;
            api.foot({ label: last ? 'Дальше' : 'Следующий вопрос', onClick: () => { if (last) finish(); else { i++; ask(); } } });
          } else {
            wrongOnce = true;
            b.classList.add('wrong');
            b.disabled = true;
            api.bad([s.bad]);
          }
        }));
      };
      const finish = () => {
        if (!outro) return api.next();
        qa.innerHTML = `<div class="conclusion">${outro.html}</div>`;
        if (outro.node) zoom.go(outro.node);
        api.feedback(null);
        api.foot({ label: 'Дальше' });
      };
      ask();
    };
  }

  /* ===== Слайды ===== */
  const slides = [];

  // 0. Вступление
  slides.push((body, api) => {
    body.appendChild(h(`<div class="slide intro">
      <div class="hero"><div class="hero-num">17</div><div class="hero-castle">🏰</div></div>
      <div class="step-chip">Задание 17 · пунктуация</div>
      <h2>Обособленные определения и обстоятельства</h2>
      <p class="lead">В задании нужно найти цифры, на месте которых стоят запятые. Чаще всего это <b>причастные</b> и <b>деепричастные обороты</b>.</p>
      <div class="mission card">
        <div class="mission-row"><span>🧭</span><div><b>Миссия</b><br>Освой алгоритм, разметь 2 предложения как профи и получи ключ 🗝️ от ворот замка</div></div>
        <div class="mission-row"><span>🎁</span><div><b>Награда</b><br>до 300 XP и эссенция ${coin} для твоей башни</div></div>
        <div class="mission-row"><span>🔥</span><div><b>Комбо</b><br>3 верных ответа подряд — опыт удваивается</div></div>
      </div>
    </div>`));
    api.foot({ label: 'Погнали! 🚀' });
  });

  // 1. Алгоритм целиком
  slides.push((body, api) => {
    body.appendChild(h(`<div class="slide">
      <div class="step-chip">Карта сокровищ</div>
      <h2>Алгоритм выполнения</h2>
      <p class="lead">Это твоя карта. Нажми на неё, чтобы рассмотреть. Дальше мы пройдём её по шагам — каждый шаг будем «приближать».</p>
      <button class="algo-thumb"><img src="${ALGO}" alt="Алгоритм задания 17"><span>🔍 Открыть схему</span></button>
      <ol class="algo-steps">
        <li><b>Выдели грамматические основы.</b></li>
        <li>Найди <b>определение</b> (какой?) или <b>обстоятельство</b> (что делая? что сделав? / предлог <i>несмотря на, невзирая на</i>).</li>
        <li>Найди <b>главное слово</b> и зависимые слова — так получится оборот.</li>
        <li>Определение после главного слова-существительного или при местоимении — обособляем. Перед существительным — только если есть обстоятельственное значение или оборот оторван от главного слова.</li>
        <li>Деепричастный оборот и <i>несмотря на</i> — обособляем всегда.</li>
        <li>Проверь, нет ли ещё оборотов. Однородные обороты при одном слове, соединённые <b>И</b>, — запятую у союза не ставим.</li>
      </ol>
      <h3>Как размечаем</h3>
      ${legend()}
    </div>`));
    body.querySelector('.algo-thumb').addEventListener('click', () => api.openAlgo(ALGO));
    api.foot({ label: 'Понятно, к шагу 1' });
  });

  // 2. Шаг 1 — основы
  slides.push(markSlide({
    zoom: 'bases', chip: 'Шаг 1 из 5', title: 'Выдели грамматические основы',
    text: 'Подлежащее — <b>одной чертой</b>, сказуемое — <b>двумя</b>. Каждую основу — <b>своим цветом</b>: переключай «Основа 1 / 2». Можно водить пальцем по словам.',
    tools: ['subj', 'pred', 'erase'],
    checks: [chk.bases(SPEC1)],
    unlockOnPass: 'bases',
    hint: 'Ищи, <b>что</b> совершает действие: метель (что сделала?) — улеглась. Кто ещё действует в предложении? Ветер! И у него два сказуемых: <i>набегал</i> … да <i>шевелил</i>.',
    reveal: (m) => {
      const s = solution({ ...SPEC1, cross: [], bars: [], arrows: [] });
      return { ...m, mem: s.mem };
    },
    done: 'Основа 1: <b>метель улеглась</b>. Основа 2: <b>ветер набегал, шевелил</b> (однородные сказуемые, «да» = «и»). <span class="muted">«Было тихо» — тоже основа (безличное предложение), но для задания 17 она не важна.</span>',
  }));

  // 3. Шаг 2 — развилка: определение или обстоятельство
  slides.push(quizSlide({
    chip: 'Шаг 2 из 5', title: 'Найди определение или обстоятельство',
    text: 'Схема делится на две ветки. <b>Определение</b> отвечает на вопрос <i>какой?</i> (часто это причастие). <b>Обстоятельство</b> — на вопрос <i>что делая? что сделав?</i> (деепричастие) или начинается с <i>несмотря на</i>.',
    steps: [
      { node: 'branches', q: 'Слово «<b>покрытые</b>» (гривы какие?) — это…', options: ['определение (причастие)', 'обстоятельство (деепричастие)'], correct: 0, ok: 'Да! Гривы <i>какие?</i> — покрытые. Причастие → определение, левая ветка схемы.', bad: 'Задай вопрос: гривы <i>какие?</i> — покрытые. На «какой?» отвечает определение.' },
      { node: 'circWord', q: 'Слово «<b>приподнимая</b>» (набегал что делая?) — это…', options: ['определение (причастие)', 'обстоятельство (деепричастие)'], correct: 1, ok: 'Точно! <i>Что делая?</i> — приподнимая. Образовано от глагола «приподнимать» → деепричастие, обстоятельство.', bad: 'Задай вопрос от глагола: набегал <i>что делая?</i> — приподнимая. Это деепричастие.' },
    ],
    outro: { node: 'branches', html: 'Итак, в предложении <b>два оборота</b>: причастный (определение) и деепричастный (обстоятельство). Разберём каждый по своей ветке! 🌿' },
  }));

  // 4. Определение — подчеркнуть
  slides.push(markSlide({
    zoom: 'defFind', chip: 'Шаг 3 · ветка «Определение»', title: 'Подчеркни определение',
    text: 'Найди причастие с зависимыми словами и подчеркни весь оборот <b>волнистой линией</b>. Затем инструментом «Граница» отметь его начало и конец <b>|</b>.',
    tools: ['def', 'bar', 'erase'],
    checks: [chk.def(SPEC1), chk.bars(SPEC1.defBars, SPEC1.circBars)],
    hint: 'Причастие — <i>покрытые</i>. Покрытые чем? — <i>инеем</i>. Значит, оборот: «покрытые инеем». Границы: перед «покрытые» и после «инеем».',
    reveal: (m) => ({ ...m, def: [...new Set([...m.def, ...SPEC1.def])], bars: [...new Set([...m.bars, ...SPEC1.defBars.flat()])] }),
    done: 'Причастный оборот: <b>|покрытые инеем|</b>.',
  }));

  // 5. Главное слово для определения
  slides.push(markSlide({
    zoom: 'defMain', chip: 'Шаг 3 · ветка «Определение»', title: 'Найди главное слово',
    text: 'От какого слова задаём вопрос <i>какие?</i> к обороту? Поставь над ним <b>×</b>, затем инструментом «Стрелка» проведи стрелку от главного слова к обороту.',
    tools: ['cross', 'arrow', 'erase'],
    checks: [chk.cross(SPEC1.defCross, SPEC1.circCross), chk.arrows(SPEC1.defArrow, SPEC1.circArrow)],
    hint: '<i>Гривы</i> (какие?) покрытые инеем. Главное слово — «гривы». Нажми «Стрелка», затем на «гривы», затем на «инеем».',
    reveal: (m) => ({ ...m, cross: [...new Set([...m.cross, ...SPEC1.defCross])], arrows: [...m.arrows.filter((a) => a[0] !== SPEC1.defArrow[0].from), [SPEC1.defArrow[0].from, w1('покрытые')]] }),
    done: 'Главное слово — <b>гривы</b> (какие? покрытые инеем).',
  }));

  // 6. Развилки ветки «Определение»
  slides.push(quizSlide({
    chip: 'Шаг 4 · решаем по схеме', title: 'Нужны ли запятые у определения?',
    text: 'Идём по схеме вниз и отвечаем на её вопросы.',
    steps: [
      { node: 'nounQ', q: 'Главное слово «гривы» — существительное?', options: ['Да', 'Нет, местоимение'], correct: 0, ok: 'Да, «гривы» — существительное. Идём дальше по левой ветке.', bad: '«Гривы» — это предмет (что?), значит, существительное.' },
      { node: 'beforeQ', q: 'Оборот «покрытые инеем» стоит <b>перед</b> главным словом «гривы»?', options: ['Да', 'Нет'], correct: 0, ok: 'Верно: «покрытые инеем <b>гривы</b>» — оборот перед главным словом.', bad: 'Посмотри на порядок слов: «покрытые инеем гривы» — оборот впереди.' },
      { node: 'meaningQ', q: 'Есть ли у оборота обстоятельственное значение (причина, уступка, условие, цель)? Можно ли заменить его на «так как покрыты инеем», «хотя покрыты инеем»?', options: ['Да', 'Нет'], correct: 1, ok: 'Правильно, такого значения нет — оборот просто описывает гривы.', bad: 'Попробуй: «приподнимая гривы, так как они покрыты инеем» — смысл ломается. Значения причины нет.' },
      { node: 'betweenQ', q: 'Есть ли между оборотом и главным словом другие члены предложения?', options: ['Да', 'Нет'], correct: 1, ok: 'Нет: «покрытые инеем» стоят вплотную к «гривы».', bad: 'Между «инеем» и «гривы» ничего нет — они рядом.', then: 'noCommas' },
    ],
    outro: { node: 'noCommas', html: '🚫 <b>Запятые не ставятся!</b><br>Определение стоит перед главным словом, поэтому на месте цифр <b>2</b> и <b>3</b> запятых нет.' },
  }));

  // 7. Обстоятельство — подчеркнуть
  slides.push(markSlide({
    zoom: 'circWord', chip: 'Шаг 3 · ветка «Обстоятельство»', title: 'Подчеркни обстоятельство',
    text: 'Подчеркни весь деепричастный оборот <b>точкой-тире</b> (вместе со всеми зависимыми словами!), поставь <b>×</b> над главным словом-глаголом, проведи <b>стрелку</b> и отметь <b>границы |</b>.',
    tools: ['circ', 'cross', 'arrow', 'bar', 'erase'],
    checks: [chk.circ(SPEC1), chk.cross([...SPEC1.defCross, ...SPEC1.circCross], []), chk.arrows([...SPEC1.defArrow, ...SPEC1.circArrow]), chk.bars([...SPEC1.defBars, ...SPEC1.circBars])],
    hint: 'Ветер <i>набегал</i> (что делая?) приподнимая (что?) гривы (какие?) покрытые инеем, гривы (чьи?) лошадей. Оборот: «приподнимая покрытые инеем гривы лошадей». Главное слово — «набегал».',
    reveal: () => SOL1,
    done: 'Деепричастный оборот: <b>|приподнимая покрытые инеем гривы лошадей|</b>, главное слово — <b>набегал</b>.',
    xp: 30, coins: 15,
  }));

  // 8. Развилки ветки «Обстоятельство» и проверка «есть ли ещё»
  slides.push(quizSlide({
    chip: 'Шаг 5 · финальная проверка', title: 'Нужны ли запятые у обстоятельства?',
    steps: [
      { node: 'circWord', q: '«Приподнимая» отвечает на вопрос <i>что делая?</i> и образовано от глагола?', options: ['Да', 'Нет'], correct: 0, ok: 'Да, это деепричастие.', bad: 'Набегал <i>что делая?</i> — приподнимая. От глагола «приподнимать». Это деепричастие.' },
      { node: 'circMain', q: 'Какое слово главное для деепричастного оборота?', options: ['ветер', 'набегал', 'гривы'], correct: 1, ok: 'Да! Деепричастие всегда зависит от глагола: набегал (что делая?) приподнимая.', bad: 'Главное слово для деепричастия — всегда глагол (сказуемое).' },
      { node: 'final', q: 'Деепричастный оборот выделяется запятыми…', options: ['всегда, с двух сторон', 'только если стоит после глагола'], correct: 0, ok: 'Именно! Обстоятельство (деепричастный оборот) обособляется всегда → запятые на месте <b>1</b> и <b>4</b>.', bad: 'Деепричастный оборот обособляется всегда, где бы он ни стоял.' },
      { node: 'moreQ', q: 'Обороты «покрытые инеем» и «приподнимая…» относятся к одному главному слову?', options: ['Да', 'Нет'], correct: 1, ok: 'Нет: у одного главное слово «гривы», у другого — «набегал». Это разные обороты, каждый разбираем отдельно — что мы и сделали ✅', bad: 'Посмотри на крестики: «гривы» и «набегал» — разные главные слова.', then: 'sameNo' },
    ],
    outro: { node: 'final', html: '🧠 Все обороты разобраны! Осталось записать ответ.' },
  }));

  // 9. Ответ к первому предложению
  slides.push((body, api) => {
    const sh = slideShell(body, { chip: 'Ответ', title: 'Запиши ответ', text: 'Укажи все цифры, на месте которых должны стоять запятые (как в бланке ЕГЭ — без пробелов).' });
    new M.Board(sh.boardHost, S1, { readOnly: true, marks: api.ctx.data.m1 });
    const box = h(`<div class="answer-box"><label>Ответ:</label><input class="ans" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="например, 12"></div>`);
    sh.extraHost.appendChild(box);
    const inp = box.querySelector('input');
    let tries = 0;
    const explain = () => {
      sh.extraHost.innerHTML = '';
      sh.boardHost.innerHTML = '';
      sh.extraHost.appendChild(h(`<div class="explain card">
        <div class="ans-big">Ответ: <b>14</b></div>
        <h3>Верная разметка</h3><div class="sol-a"></div>
        <h3>Как правильно</h3><div class="sol-b"></div>
        <p><b>Определение</b> — «покрытые инеем», главное слово — «гривы». На месте цифр <b>2 и 3</b> запятые <b>не ставятся</b>, потому что определение стоит <b>перед</b> главным словом.</p>
        <p><b>Обстоятельство</b> — деепричастный оборот «приподнимая покрытые инеем гривы лошадей», главное слово — «набегал». Обстоятельство <b>всегда обособляется</b> → запятые на месте <b>1 и 4</b>.</p>
        <p class="star-note">* Иногда один оборот входит в состав другого, как здесь: причастный оборот вошёл в состав деепричастного.</p>
      </div>`));
      new M.Board(sh.extraHost.querySelector('.sol-a'), S1, { readOnly: true, marks: SOL1 });
      new M.Board(sh.extraHost.querySelector('.sol-b'), S1, { readOnly: true, commas: [1, 4] });
      api.foot({ label: 'Дальше' });
    };
    const check = () => {
      const v = normAns(inp.value);
      if (!v) { inp.focus(); return App.$('.ans').classList.add('need'); }
      if (v === SPEC1.answer) {
        api.good(tries ? 15 : 30, tries ? 8 : 15, inp, 'Ответ <b>14</b> — абсолютно верно!');
        App.confetti(100);
        explain();
      } else {
        tries++;
        api.bad([tries === 1 ? 'Вспомни: какой оборот обособляется всегда, а какой стоит перед главным словом?' : 'Деепричастный оборот — с двух сторон (1 и 4). Причастный перед существительным — без запятых.']);
        if (tries >= 2) api.foot({ label: 'Проверить', onClick: check, extraLabel: '👀 Показать ответ', onExtra: () => { api.feedback('info', '<b>Разбор ниже.</b> В следующем предложении точно получится! 💪'); explain(); } });
      }
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    api.foot({ label: 'Проверить', onClick: check });
  });

  // 10. Подготовка к самостоятельному
  slides.push((body, api) => {
    body.appendChild(h(`<div class="slide intro">
      <div class="hero"><div class="hero-num boss">⚔️</div></div>
      <div class="step-chip gold">Испытание</div>
      <h2>Теперь сам!</h2>
      <p class="lead">Новое предложение. Разметь <b>всё</b> по алгоритму: основы → обороты → главные слова × и стрелки → границы |. Проверка будет только в самом конце, вместе с ответом.</p>
      <div class="mission card">
        <div class="mission-row"><span>🎯</span><div>За каждый верно размеченный элемент — опыт и эссенция</div></div>
        <div class="mission-row"><span>📜</span><div>Схема всегда под рукой — кнопка 📜 вверху</div></div>
      </div>
    </div>`));
    api.foot({ label: 'Принять вызов' });
  });

  // 11. Самостоятельная разметка второго предложения
  slides.push((body, api) => {
    const sh = slideShell(body, { chip: 'Испытание', title: 'Разметь предложение', text: 'Все инструменты доступны. Когда закончишь — нажми «Ввести ответ».' });
    const d = api.ctx.data;
    const board = new M.Board(sh.boardHost, S2, { marks: d.m2, onChange: (m) => { d.m2 = m; } });
    M.toolbar(sh.toolHost, board, ['subj', 'pred', 'def', 'circ', 'cross', 'arrow', 'bar', 'erase']);
    const toAnswer = () => {
      const m = board.getMarks();
      const count = Object.keys(m.mem).length + m.def.length + m.circ.length + m.cross.length + m.bars.length + m.arrows.length;
      if (count < 4) { api.toast('Сначала разметь предложение по алгоритму ✍️', 'bad'); return; }
      sh.toolHost.classList.add('hidden');
      board.readOnly = true; board.el.classList.add('ro'); board.setTool(null);
      const box = h(`<div class="answer-box"><label>Ответ:</label><input class="ans" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="цифры"></div>`);
      sh.extraHost.appendChild(box);
      const inp = box.querySelector('input');
      inp.focus();
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const submit = () => {
        const v = normAns(inp.value);
        if (!v) return inp.focus();
        d.ans2 = v;
        api.next();
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      api.foot({ label: 'Проверить всё', onClick: submit, extraLabel: '✏️ Вернуться к разметке', onExtra: () => { box.remove(); sh.toolHost.classList.remove('hidden'); board.readOnly = false; board.el.classList.remove('ro'); board.setTool('subj'); sh.toolHost.querySelector('.tool[data-t="subj"]').click(); api.foot({ label: 'Ввести ответ', onClick: toAnswer }); } });
    };
    api.foot({ label: 'Ввести ответ', onClick: toAnswer });
  });

  // 12. Результаты испытания
  slides.push((body, api) => {
    const d = api.ctx.data;
    const m = d.m2 || M.emptyMarks();
    const rows = [
      ['Грамматические основы', M.checkBases(m, SPEC2.bases)],
      ['Обстоятельства (точка-тире)', M.checkSet(m.circ, SPEC2.circ, SPEC2.circOpt, { missing: 'Подчёркнуты не все слова оборотов.', extra: 'Подчёркнуто лишнее.' })],
      ['Определения', M.checkSet(m.def, SPEC2.def, SPEC2.defOpt, { missing: '', extra: 'Причастных оборотов здесь нет.' })],
      ['Главные слова ×', M.checkSet(m.cross, SPEC2.cross, [], { missing: 'Не все главные слова отмечены.', extra: 'Лишний крестик.' })],
      ['Стрелки', M.checkArrows(m, SPEC2.arrows)],
      ['Границы оборотов |', M.checkBars(m, SPEC2.bars)],
    ];
    const ansOk = d.ans2 === SPEC2.answer;
    let xp = 0, coins = 0;
    rows.forEach(([, r]) => { if (r.ok) { xp += 10; coins += 5; } });
    if (ansOk) { xp += 40; coins += 20; }
    const okCount = rows.filter(([, r]) => r.ok).length + (ansOk ? 1 : 0);
    d.trialScore = okCount;
    if (!ansOk) api.ctx.errors += 2;
    api.ctx.errors += rows.filter(([, r]) => !r.ok).length > 2 ? 1 : 0;
    body.appendChild(h(`<div class="slide">
      <div class="step-chip ${ansOk ? 'gold' : ''}">Результат испытания</div>
      <h2>${ansOk ? 'Испытание пройдено! 🏆' : 'Почти! Разберём ошибки'}</h2>
      <div class="score-ring" style="--p:${(okCount / 7) * 100}"><b>${okCount}/7</b></div>
      <div class="results">
        ${rows.map(([n, r]) => `<div class="res ${r.ok ? 'ok' : 'no'}"><span>${r.ok ? '✅' : '❌'}</span><div><b>${n}</b>${!r.ok && r.msgs.filter(Boolean).length ? `<small>${r.msgs.filter(Boolean).join(' ')}</small>` : ''}</div></div>`).join('')}
        <div class="res ${ansOk ? 'ok' : 'no'}"><span>${ansOk ? '✅' : '❌'}</span><div><b>Ответ: ${d.ans2 || '—'}</b>${ansOk ? '' : '<small>Верный ответ: 1234</small>'}</div></div>
      </div>
      <h3>Твоя разметка</h3><div class="mine"></div>
      <h3>Верная разметка</h3><div class="sol-a"></div>
      <h3>Как правильно</h3><div class="sol-b"></div>
      <div class="explain card">
        <div class="ans-big">Ответ: <b>1234</b></div>
        <p>«<b>С коротким шумом вздрагивая листьями</b>» — деепричастный оборот, зависящий от глагола «<b>зашептались</b>»; выделяется запятыми с обеих сторон → на месте цифр <b>1 и 2</b> ставятся запятые.</p>
        <p>«<b>Словно сговорившись с ветром</b>» — деепричастный оборот со значением сравнения (главное слово «<b>понеслось</b>»); выделяется запятыми с обеих сторон → на месте цифр <b>3 и 4</b> ставятся запятые.</p>
        <p class="muted small">Обрати внимание: запятая на месте 3 стоит сразу после союза «и» — союз соединяет сказуемые «сорвалось и понеслось», а оборот всё равно выделяется.</p>
      </div>
    </div>`));
    new M.Board(body.querySelector('.mine'), S2, { readOnly: true, marks: m });
    new M.Board(body.querySelector('.sol-a'), S2, { readOnly: true, marks: SOL2 });
    new M.Board(body.querySelector('.sol-b'), S2, { readOnly: true, commas: [1, 2, 3, 4] });
    setTimeout(() => {
      const gx = api.reward(xp, coins, { anchor: body.querySelector('.score-ring'), phrase: ansOk });
      api.ctx.xp += gx; api.ctx.coins += coins;
      if (ansOk) api.confetti(140);
      if (M.checkBases(m, SPEC2.bases).ok) api.unlock('bases');
    }, 500);
    api.foot({ label: 'Забрать награду' });
  });

  // 13. Финал
  slides.push((body, api) => {
    const e = api.ctx.errors;
    const stars = e <= 2 ? 3 : e <= 6 ? 2 : 1;
    const r = api.finish(stars);
    body.appendChild(h(`<div class="slide intro final">
      <div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= stars ? 'on' : ''}" style="animation-delay:${i * 0.25}s">★</span>`).join('')}</div>
      <h2>${r.first ? 'Задание 17 пройдено!' : 'Отличная тренировка!'}</h2>
      <p class="lead">${r.first ? 'Ты получаешь <b>ключ 🗝️</b> от ворот Замка Слова. Следующая станция уже ждёт на пути!' : 'Повторение — мать учения. Навык закреплён 💪'}</p>
      <div class="loot">
        <div><b>+${api.ctx.xp}</b><span>XP</span></div>
        <div><b>+${api.ctx.coins}</b><span>${coin}</span></div>
        <div><b>${e}</b><span>ошибок</span></div>
      </div>
      <div class="card tip-card">🏰 Загляни в <b>башню</b> — эссенции уже может хватить на новый предмет!</div>
    </div>`));
    api.confetti(180);
    api.sound('level');
    api.foot({ label: 'На карту пути', onClick: () => api.close(), extraLabel: '🏰 В башню', onExtra: () => { api.close(); document.querySelector('.tabbar [data-tab="tower"]').click(); } });
  });

  App.LESSONS[17] = { slides, algoImg: ALGO };
})();

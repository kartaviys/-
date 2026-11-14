/* Задания 16, 18, 19–20, 21: алгоритм → 10 упражнений с поэтапной работой по алгоритму, ответом и эталонной разметкой преподавателя */
(() => {
  const { h, coin } = App;
  const M = Markup;
  const DATA = window.PRACTICE_DATA;

  const CFG = {
    16: {
      title: 'Однородные члены и сложносочинённое предложение',
      task: 'Расставьте знаки препинания. Укажите номера предложений, в которых нужно поставить ОДНУ запятую.',
      about: 'В задании 16 даны пять предложений. Нужно найти те, где ставится <b>ровно одна запятая</b>: при однородных членах или между частями сложносочинённого предложения.',
      tools: ['subj', 'pred', 'ring', 'label', 'brk', 'obj', 'def', 'circ', 'erase'],
      labels: ['○', 'общ.', 'придат.', 'вводн.'],
      symbols: [
        ['<i class="g g-double" style="--c:#7c3aed"></i>', 'Грамматические основы — подлежащее одной чертой, сказуемое двумя'],
        ['<b class="g-ring">и</b>', 'Сочинительный союз — в кружок'],
        ['<b class="g-lbl">○</b>', 'Кружочки над однородными членами (подпись «○»)'],
        ['<b class="g-brk">[ ]</b>', 'Квадратные скобки — части сложносочинённого предложения'],
        ['<b class="g-lbl">общ.</b>', 'Общий второстепенный член, придаточное, вводное слово — подпиши'],
      ],
    },
    18: {
      title: 'Вводные слова и обращения',
      task: 'Расставьте все недостающие знаки препинания: укажите цифру(-ы), на месте которой(-ых) в предложении(-ях) должна(-ы) стоять запятая(-ые).',
      about: 'В задании 18 нужно найти <b>вводные слова, обращения и междометия</b> и выделить их запятыми — и не поставить лишних запятых там, где слово вводным не является.',
      tools: ['label', 'subj', 'pred', 'obj', 'def', 'circ', 'erase'],
      labels: ['вводн.', 'обращ.', 'межд.', 'неуверенность', 'уверенность', 'источник', 'порядок мыслей', 'связь мыслей', 'чувства', 'внимание', 'союз', 'частица', 'нареч.', 'не вводн.'],
      symbols: [
        ['<b class="g-lbl">вводн.</b>', 'Над конструкцией — её название: вводн., обращ., межд.'],
        ['<b class="g-lbl">источник</b>', 'Рядом с вводным словом — его значение: уверенность, источник сообщения, чувства…'],
        ['<b class="g-lbl">союз</b>', 'Если слово не вводное — подпиши, чем оно является (союз, частица, наречие)'],
        ['<i class="g g-single" style="--c:#7c3aed"></i>', 'Где запятая не нужна — подчеркни члены предложения слева и справа от цифры'],
      ],
    },
    19: {
      title: 'Сложноподчинённое предложение',
      task: 'Расставьте все знаки препинания: укажите цифру(-ы), на месте которой(-ых) в предложении должна(-ы) стоять запятая(-ые).',
      about: 'Задание 19 — про сложноподчинённые предложения: <b>придаточные части</b>, однородные придаточные, <b>стык союзов</b>.',
      tools: ['subj', 'pred', 'label', 'ring', 'brk', 'arrow', 'box', 'erase'],
      labels: ['I', 'II', 'III', 'IV', 'V', 'VI'],
      symbols: [
        ['<b class="g-lbl">I II</b>', 'Над каждой основой — римская цифра'],
        ['<b class="g-ring">что</b>', 'В кружок — только союзы, которые связывают основы'],
        ['<b class="g-brk">[ ] ( )</b>', 'Квадратные скобки — главная часть, круглые — придаточная'],
        ['<b class="g-arr">↷</b>', 'Стрелки с вопросами ко всем придаточным'],
        ['<b class="g-box">то</b>', 'Продолжение союза при стыке (то, так, но) — в квадрат'],
      ],
    },
    20: {
      title: 'Предложения с разными видами связи',
      task: 'Расставьте все знаки препинания: укажите цифру(-ы), на месте которой(-ых) в предложении должна(-ы) стоять запятая(-ые).',
      about: 'Задание 20 — сложные предложения, где одновременно есть сочинительная, подчинительная и бессоюзная связь. Выделяем <b>блоки</b> — главную часть вместе с её придаточными.',
      tools: ['subj', 'pred', 'label', 'ring', 'brk', 'arrow', 'box', 'erase'],
      labels: ['I', 'II', 'III', 'IV', 'V', 'VI'],
      symbols: [
        ['<b class="g-lbl">I II</b>', 'Над каждой основой — римская цифра'],
        ['<b class="g-ring">что</b>', 'В кружок — союзы, которые связывают основы'],
        ['<b class="g-brk">[ ] ( )</b>', 'Квадратные скобки — главная часть, круглые — придаточная'],
        ['<b class="g-brk">{ }</b>', 'Фигурные скобки — блок: главная часть с её придаточными'],
        ['<b class="g-box">то</b>', 'Продолжение союза при стыке (то, так, но) — в квадрат'],
      ],
    },
    21: {
      title: 'Пунктуационный анализ',
      task: null,
      about: 'В задании 21 нужно найти предложения, в которых знак (тире, запятая или двоеточие) ставится <b>по одному и тому же правилу</b>.',
      tools: ['subj', 'pred', 'ring', 'brk', 'def', 'circ', 'label', 'erase'],
      labels: ['приложение', 'подл.–сказ.', 'однородные', 'обобщ. слово', 'БСП', 'ССП', 'СПП', 'ДО', 'ПО', 'вводн.', 'прямая речь', 'вставка'],
      symbols: [
        ['<i class="g g-double" style="--c:#7c3aed"></i>', 'Грамматические основы в каждом предложении'],
        ['<b class="g-ring">и</b>', 'Все союзы — в кружок'],
        ['<b class="g-brk">[ ] ( )</b>', 'Скобки в сложных предложениях'],
        ['<b class="g-lbl">приложение</b>', 'Подпиши конструкцию, из-за которой ставится знак'],
      ],
    },
  };

  // причины для объяснения каждой цифры (номера предложения)
  const SPP = { yes: { label: ', запятая', reasons: ['начало или конец придаточной части', 'однородные придаточные без союза', 'граница частей / блоков сложного предложения', 'однородные члены без союза', 'стык союзов — дальше нет «то, но, так»'] },
    no: { label: 'нет', reasons: ['однородные придаточные соединены союзом И', 'стык союзов — дальше есть «то, но, так»', 'союз или союзное слово внутри придаточного', 'однородные члены с одиночным союзом И', 'нет условий для запятой'] } };
  const REASONS = {
    16: { title: 'Сколько запятых в каждом предложении? Объясни', yes: { label: 'одна', reasons: ['однородные члены без союза', 'противительный союз', 'двойной союз', 'повторяющийся союз', 'пары однородных членов', 'ССП без общей части'] },
      no: { label: 'нет / больше', reasons: ['одиночный союз И, ИЛИ — запятых нет', 'общий второстепенный член', 'неоднородные определения', 'две запятые и больше'] } },
    18: { yes: { label: ', запятая', reasons: ['вводное слово / конструкция', 'обращение', 'междометие', 'граница частей сложного предложения'] },
      no: { label: 'нет', reasons: ['член предложения, не вводное', 'союз, частица или наречие', 'слово не бывает вводным', 'нет условий для запятой'] } },
    17: { yes: { label: ', запятая', reasons: ['деепричастный оборот / одиночное деепричастие — обособляется всегда', 'определение после определяемого слова', 'определение относится к личному местоимению', 'определение с обстоятельственным значением', 'другое'] },
      no: { label: 'нет', reasons: ['определение перед определяемым словом', 'однородные обороты соединены одиночным союзом', 'союз И соединяет однородные сказуемые', 'нет условий для обособления'] } },
    19: SPP, 20: SPP,
    21: { title: 'Какое правило в каждом предложении?', yes: { label: 'то же правило', reasons: ['приложение', 'тире между подлежащим и сказуемым', 'однородные члены', 'обобщающее слово', 'БСП', 'ССП', 'СПП', 'обособленное определение', 'обособленное обстоятельство', 'вводное слово', 'обращение', 'прямая речь', 'вставная конструкция', 'неполное предложение'] },
      no: { label: 'другое', reasons: ['приложение', 'тире между подлежащим и сказуемым', 'однородные члены', 'обобщающее слово', 'БСП', 'ССП', 'СПП', 'обособленное определение', 'обособленное обстоятельство', 'вводное слово', 'обращение', 'прямая речь', 'вставная конструкция', 'неполное предложение', 'нужного знака нет'] } },
  };
  App.REASONS = REASONS;
  const normAns = (s) => [...new Set(s.replace(/\D/g, ''))].sort().join('');
  const slide = (block, fn) => { fn.block = block; return fn; };

  function build(n) {
    const cfg = CFG[n], data = DATA[n], algo = data.algo;
    const algoHtml = `<div class="algo-box"><h3>Алгоритм: задание ${n}</h3><ol class="algo-steps">${algo.map((a) => `<li>${a}</li>`).join('')}</ol></div>`;
    const slides = [];

    slides.push(slide('Задание', (body, api) => {
      body.appendChild(h(`<div class="slide intro">
        <div class="hero"><div class="hero-num">${n}</div><div class="hero-castle">🏰</div></div>
        <div class="step-chip">Задание ${n} · пунктуация</div>
        <h2>${cfg.title}</h2>
        <p class="lead">${cfg.about}</p>
        ${cfg.task && !(App.THEORY || {})[n] ? `<div class="etask"><span class="etask-n">${n}</span><div>${cfg.task}</div></div>` : ''}
        <div class="mission card">
          <div class="mission-row"><span>🧭</span><div><b>Твой путь</b><br>${(App.THEORY || {})[n] ? 'теория блоками и разбор примера → ' : ''}алгоритм → 10 упражнений. В каждом идёшь по шагам алгоритма, потом пишешь ответ</div></div>
          <div class="mission-row"><span>🖍️</span><div><b>Разметка</b><br>после ответа увидишь эталонную разметку преподавателя и разбор</div></div>
          <div class="mission-row"><span>🐷</span><div><b>Копилка опыта</b><br>за каждый шаг и верный ответ</div></div>
        </div>
      </div>`));
      api.foot({ label: 'Начинаем! 🚀' });
    }));

    ((App.THEORY || {})[n] || []).forEach((f) => slides.push(f));

    data.ex.forEach((ex, k) => slides.push(slide(`Упражнение ${k + 1}/10`, (body, api) => {
      const el = h(`<div class="slide train">
        <div class="algo-panel"></div>
        <div class="etask small"><span class="etask-n">${n}</span><div>${ex.task || cfg.task}</div></div>
        <div class="boards"></div>
        <div class="stage-extra"></div>
        <div class="tool-host"></div>
      </div>`);
      body.appendChild(el);
      const panel = el.querySelector('.algo-panel'), extra = el.querySelector('.stage-extra'), toolHost = el.querySelector('.tool-host'), host = el.querySelector('.boards');
      const texts = ex.sents || [ex.text];
      const boards = texts.map((t, i) => {
        const row = h(`<div class="sent-row">${ex.sents ? `<span class="sent-n">${i + 1})</span>` : ''}<div class="sent-b"></div></div>`);
        host.appendChild(row);
        return new M.Board(row.querySelector('.sent-b'), M.parse(t), { labels: cfg.labels });
      });
      const group = boards.length > 1 ? new M.BoardGroup(boards) : boards[0];
      M.toolbar(toolHost, group, cfg.tools);
      let si = 0, tries = 0;
      const drawPanel = () => {
        panel.innerHTML = `<div class="ap-row">${algo.map((a, i) => `<span class="ap ${i < si ? 'done' : i === si ? 'cur' : 'lock'}" title="${a}">${i < si ? '✓' : i + 1}</span>`).join('<i></i>')}</div>
          <div class="ap-cur">${si < algo.length ? `<b>Шаг ${si + 1} из ${algo.length}</b>${algo[si]}` : '<b>Все шаги алгоритма выполнены ✓</b>Теперь запиши ответ.'}</div>`;
      };
      const stepDone = () => {
        api.fly(api.mainEl || panel, 2);
        si++;
        drawPanel();
        if (si < algo.length) api.foot({ label: si === algo.length - 1 ? 'Последний шаг выполнен ✓' : 'Шаг выполнен ✓', onClick: stepDone, extraLabel: '📜', onExtra: () => App.openAlgo(algoHtml) });
        else answerStage();
      };
      const answerStage = () => {
        // перед проверкой ученик объясняет каждую цифру
        const nums = ex.sents ? ex.sents.map((_, i) => i + 1) : texts.join(' ').match(/\((\d+)\)/g).map((x) => +x.slice(1, -1));
        App.Kit.reasonAnswer(extra, api, Object.assign({ nums, answer: ex.answer, onDone: (ok) => { if (!ok) api.ctx.errors++; reveal(); } }, REASONS[n]));
      };
      const reveal = () => {
        toolHost.innerHTML = '';
        boards.forEach((b) => { b.readOnly = true; b.el.classList.add('ro'); b.setTool(null); });
        extra.insertAdjacentHTML('beforeend', `<div class="explain card"><div class="ans-big">Ответ: <b>${ex.answer}</b></div>
          ${ex.imgs.length ? `<h3>Разметка преподавателя</h3><div class="ref-imgs">${ex.imgs.map((src) => `<button class="ref-img"><img src="${src}" alt="Эталонная разметка" loading="lazy"><span>🔍 крупнее</span></button>`).join('')}</div>` : ''}
          <h3>Разбор</h3>${ex.explain.map((x) => `<p>${x}</p>`).join('')}</div>`);
        extra.querySelectorAll('.ref-img').forEach((b) => b.addEventListener('click', () => App.openAlgo(b.querySelector('img').getAttribute('src'))));
        extra.querySelector('.explain').scrollIntoView({ behavior: 'smooth', block: 'start' });
        api.foot({ label: k < data.ex.length - 1 ? 'Следующее упражнение ▸' : 'Итоги' });
      };
      drawPanel();
      api.foot({ label: 'Шаг выполнен ✓', onClick: stepDone, extraLabel: '📜', onExtra: () => App.openAlgo(algoHtml) });
    })));

    slides.push(slide('Финал', (body, api) => {
      const e = api.ctx.errors;
      const stars = e <= 2 ? 3 : e <= 6 ? 2 : 1;
      const r = api.finish(stars);
      body.appendChild(h(`<div class="slide intro final">
        <div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= stars ? 'on' : ''}" style="animation-delay:${i * 0.25}s">★</span>`).join('')}</div>
        <h2>${r.first ? `Задание ${n} пройдено!` : 'Отличная тренировка!'}</h2>
        <p class="lead">${r.first ? 'Ещё один ключ 🗝️ от ворот замка — твой! Дорога ведёт дальше.' : 'Повторение — мать учения. Навык закреплён 💪'}</p>
        <div class="loot"><div><b>+${api.ctx.xp}</b><span>XP</span></div><div><b>${e}</b><span>ошибок</span></div></div>
      </div>`));
      api.confetti(180); api.sound('level');
      api.foot({ label: 'На карту пути', onClick: () => api.close() });
    }));

    return { slides, algoImg: algoHtml };
  }

  [16, 18, 19, 20, 21].forEach((n) => (App.LESSONS[n] = build(n)));
})();

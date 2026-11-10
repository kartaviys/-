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
      title: 'Сложноподчинённое предложение и разные виды связи',
      task: 'Расставьте все знаки препинания: укажите цифру(-ы), на месте которой(-ых) в предложении должна(-ы) стоять запятая(-ые).',
      about: 'Задания 19 и 20 — про сложные предложения: <b>придаточные части</b>, однородные придаточные, <b>стык союзов</b> и предложения с разными видами связи. Это общий урок для станций 19 и 20.',
      tools: ['subj', 'pred', 'label', 'ring', 'brk', 'arrow', 'box', 'erase'],
      labels: ['I', 'II', 'III', 'IV', 'V', 'VI'],
      alsoDone: [20],
      symbols: [
        ['<b class="g-lbl">I II</b>', 'Над каждой основой — римская цифра'],
        ['<b class="g-ring">что</b>', 'В кружок — только союзы, которые связывают основы'],
        ['<b class="g-brk">[ ] ( )</b>', 'Квадратные скобки — главная часть, круглые — придаточная'],
        ['<b class="g-arr">↷</b>', 'Стрелки с вопросами ко всем придаточным'],
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

  const normAns = (s) => [...new Set(s.replace(/\D/g, ''))].sort().join('');
  const slide = (block, fn) => { fn.block = block; return fn; };

  function build(n) {
    const cfg = CFG[n], data = DATA[n], algo = data.algo;
    const algoHtml = `<div class="algo-box"><h3>Алгоритм: задание ${n === 19 ? '19–20' : n}</h3><ol class="algo-steps">${algo.map((a) => `<li>${a}</li>`).join('')}</ol></div>`;
    const slides = [];

    slides.push(slide('Задание', (body, api) => {
      body.appendChild(h(`<div class="slide intro">
        <div class="hero"><div class="hero-num">${n === 19 ? '19<small>–20</small>' : n}</div><div class="hero-castle">🏰</div></div>
        <div class="step-chip">Задание ${n === 19 ? '19–20' : n} · пунктуация</div>
        <h2>${cfg.title}</h2>
        <p class="lead">${cfg.about}</p>
        ${cfg.task ? `<div class="etask"><span class="etask-n">${n}</span><div>${cfg.task}</div></div>` : ''}
        <div class="mission card">
          <div class="mission-row"><span>🧭</span><div><b>Твой путь</b><br>алгоритм → 10 упражнений. В каждом идёшь по шагам алгоритма, потом пишешь ответ</div></div>
          <div class="mission-row"><span>🖍️</span><div><b>Разметка</b><br>после ответа увидишь эталонную разметку преподавателя и разбор</div></div>
          <div class="mission-row"><span>🐷</span><div><b>Копилка опыта</b><br>за каждый шаг и верный ответ</div></div>
        </div>
      </div>`));
      api.foot({ label: 'Начинаем! 🚀' });
    }));

    slides.push(slide('Алгоритм', (body, api) => {
      body.appendChild(h(`<div class="slide"><div class="step-chip">Алгоритм</div><h2>Как выполнять задание</h2><p class="lead">Он будет рядом в каждом упражнении. Следующий шаг откроется, когда отметишь предыдущий.</p><div class="phase al"></div><div class="phase sym"></div></div>`));
      const box = body.querySelector('.al'), sym = body.querySelector('.sym');
      let k = 0;
      const one = () => {
        box.appendChild(h(`<div class="rv algo-li"><b>${k + 1}</b><span>${algo[k]}</span></div>`)).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        k++;
        if (k < algo.length) { api.foot({ label: 'Дальше ▸', onClick: one, extraLabel: 'Показать всё', onExtra: () => { while (k < algo.length - 1) { box.appendChild(h(`<div class="rv algo-li"><b>${k + 1}</b><span>${algo[k]}</span></div>`)); k++; } one(); } }); return; }
        sym.innerHTML = `<div class="sec-h yellow">Условные обозначения в приложении</div>${cfg.symbols.map(([g, t]) => `<div class="rv mem-row">${g}<span>${t}</span></div>`).join('')}`;
        sym.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        api.foot({ label: 'К упражнениям' });
      };
      one();
    }));

    data.ex.forEach((ex, k) => slides.push(slide(`Упражнение ${k + 1}/10`, (body, api) => {
      const el = h(`<div class="slide train">
        <div class="step-chip">Упражнение ${k + 1} из 10</div>
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
        extra.innerHTML = '<div class="answer-box"><label>Ответ:</label><input class="ans" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="цифры"></div>';
        const inp = extra.querySelector('input');
        inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const go = () => {
          const v = normAns(inp.value);
          if (!v) return inp.focus();
          if (v === ex.answer) { api.good(tries ? 10 : 20, tries ? 4 : 8, inp, `Ответ <b>${ex.answer}</b> — верно!`); App.confetti(80); reveal(); return; }
          tries++; api.ctx.errors++;
          api.bad([tries === 1 ? 'Сверься с алгоритмом и своей разметкой — где-то знак лишний или пропущен.' : 'Ещё раз пройди по каждой цифре: есть ли условие для запятой?']);
          if (tries >= 2) api.foot({ label: 'Проверить', onClick: go, extraLabel: '👀 Ответ', onExtra: () => { api.feedback('info', `Верный ответ: <b>${ex.answer}</b>. Разбор ниже 👇`); reveal(); } });
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        api.foot({ label: 'Проверить', onClick: go, extraLabel: '📜', onExtra: () => App.openAlgo(algoHtml) });
      };
      const reveal = () => {
        toolHost.innerHTML = '';
        boards.forEach((b) => { b.readOnly = true; b.el.classList.add('ro'); b.setTool(null); });
        extra.innerHTML = `<div class="explain card"><div class="ans-big">Ответ: <b>${ex.answer}</b></div>
          ${ex.imgs.length ? `<h3>Разметка преподавателя</h3><div class="ref-imgs">${ex.imgs.map((src) => `<button class="ref-img"><img src="${src}" alt="Эталонная разметка" loading="lazy"><span>🔍 крупнее</span></button>`).join('')}</div>` : ''}
          <h3>Разбор</h3>${ex.explain.map((x) => `<p>${x}</p>`).join('')}</div>`;
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
        <h2>${r.first ? `Задание ${n === 19 ? '19–20' : n} пройдено!` : 'Отличная тренировка!'}</h2>
        <p class="lead">${r.first ? 'Ещё один ключ 🗝️ от ворот замка — твой! Дорога ведёт дальше.' : 'Повторение — мать учения. Навык закреплён 💪'}</p>
        <div class="loot"><div><b>+${api.ctx.xp}</b><span>XP</span></div><div><b>+${api.ctx.coins}</b><span>${coin}</span></div><div><b>${e}</b><span>ошибок</span></div></div>
        <div class="card tip-card">🏙️ Загляни в <b>город</b> — монет уже может хватить на новое здание!</div>
      </div>`));
      api.confetti(180); api.sound('level');
      api.foot({ label: 'На карту пути', onClick: () => api.close(), extraLabel: '🏙️ В город', onExtra: () => { api.close(); document.querySelector('.tabbar [data-tab="city"]').click(); } });
    }));

    return { slides, algoImg: algoHtml, alsoDone: cfg.alsoDone || [] };
  }

  [16, 18, 19, 21].forEach((n) => (App.LESSONS[n] = build(n)));
  App.LESSONS[20] = App.LESSONS[19];
})();

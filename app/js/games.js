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

  const GAMES = [
    { id: 'letters', name: 'Пропущенная буква', e: '🔤', topic: 'Орфография · корни и приставки', pool: () => LETTERS },
    { id: 'comma', name: 'Запятая-молния', e: '⚡', topic: 'Пунктуация · задания 16–19', timer: 8, pool: () => COMMAS },
    { id: 'stress', name: 'Эхо ударений', e: '🔊', topic: 'Задание 4 · ударения', pool: () => STRESS },
    { id: 'intro', name: 'Вводное или нет?', e: '🧩', topic: 'Задание 18 · вводные слова', pool: () => INTRO },
  ];
  const PRO_LIST = ['Проверка сочинений экспертом ЕГЭ', 'Индивидуальный учёт ошибок и их отработка', 'Полноценные пробники раз в месяц', 'Мини-игры по каждому заданию', 'Отсутствие рекламы', 'Продуманная система повторения'];

  function openPro() {
    C.modal(`<div class="pro">
      <div class="pro-hero"><div class="pro-crown">⭐</div><h2>ЕГЭ Квест ПРО</h2><p>Платная версия приложения</p></div>
      <ul class="pro-list">${PRO_LIST.map((x) => `<li>✓ ${x}</li>`).join('')}</ul>
      <p class="muted small">Вся основная подготовка — теория, задания и тренировки — остаётся бесплатной.</p>
      <button class="btn ghost" data-close>Понятно</button></div>`);
  }
  App.openPro = openPro;
  App.proCard = () => {
    const c = h(`<div class="card pro-card"><span>⭐</span><div><b>Версия ПРО</b><small>Проверка сочинений экспертом, пробники, учёт ошибок, все мини-игры</small></div><button class="btn gold">Подробнее</button></div>`);
    c.querySelector('button').addEventListener('click', openPro);
    return c;
  };

  App.renderGames = (v) => {
    v.appendChild(h(`<div class="card"><div class="eyebrow">Мини-игры</div><h2>Закрепи темы в игре</h2><p class="muted small">Быстрые раунды по 10 вопросов. За игру — опыт.</p></div>`));
    const list = h(`<div class="games">${GAMES.map((g) => {
      const best = ((C.S.game || {})[g.id] || {}).best;
      return `<button class="game" data-g="${g.id}"><span class="ge">${g.e}</span><span class="sbody"><b>${g.name}</b><small>${g.topic}</small>${best != null ? `<small class="sinc">Рекорд: ${best}/10</small>` : ''}</span><span class="sprice">▶</span></button>`;
    }).join('')}</div>`);
    list.querySelectorAll('.game').forEach((b) => b.addEventListener('click', () => startGame(b.dataset.g)));
    v.appendChild(list);
    v.appendChild(h(`<div class="card pro-games"><b>⭐ В версии ПРО</b><p class="muted small">Мини-игры по каждому заданию ЕГЭ — от 1 до 26.</p></div>`));
    v.lastChild.addEventListener('click', openPro);
    v.appendChild(App.proCard());
  };

  function startGame(id) {
    const g = GAMES.find((x) => x.id === id);
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

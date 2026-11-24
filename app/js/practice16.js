/* Ключи к пяти предложениям каждого варианта в practice-data.js.
   В строке: подлежащие / сказуемые (| разделяет основы), союзы, слова после запятых. */
(() => {
  const { P, R, norm } = App.Kit;
  const { h } = App;
  const M = Markup;
  const keys = [
    [
      ['небо/заставляет', 'и', 'заложенное'],
      ['райский/одет был;сидел', 'и', ''],
      ['картины;вазы;часы/несли', 'и;и#2', 'и;и#2'],
      ['/прочитать;необходимо', 'как;так и', 'так'],
      ['путешественники/взяли;сошли', 'и;и#2', ''],
    ], [
      ['жители;туристы/передвигаются', 'и;либо;и#2;либо#2', 'набережным;либо#2'],
      ['гондолы/используются', 'и', ''],
      ['/насчитывается|женщина/есть', 'и', 'и'],
      ['гондола/является;одним;главным средством;служит', 'не только;но и', 'но;служит'],
      ['туристы/плыли', '', 'оснащённой'],
    ], [
      ['дом/был;богат;знаменит;беднел;мельчал;потерялся', 'и;но;и#2', 'но;мельчал'],
      ['он/собирался;готовился начать;рисовал', 'и', 'всё#2'],
      ['тучи/опускаются', 'и', ''],
      ['он/махнул', 'или', 'обманувшие'],
      ['праздник/будет|гости/придут', 'и', ''],
    ], [
      ['деревеньки/попадались', '', 'часто'],
      ['всё/зеленело|всё#2/волновалось;лоснилось', 'и;и#2', 'всё#2'],
      ['павел петрович/вынул;подал', 'и', ''],
      ['лес;дол/полны', 'и', ''],
      ['природа/оживает|настроение/улучшается', 'и', ''],
    ], [
      ['она/называла', 'или;или#2', ''],
      ['/удавалось найти|/было очень много', 'и;зато', 'зато'],
      ['условия/пугали|необходимость/тревожила', 'и', ''],
      ['он/уселся;углубился', 'и;как;так и', 'так'],
      ['мы/сложили;были готовы выезжать', 'и;и#2;и#3', 'книги'],
    ], [
      ['кропин/сказал', 'ни;ни#2', ''],
      ['пункт/помещался|лёва/поднимался;всматривался', 'и;и#2;и#3', 'и'],
      ['/было;радостно;тревожно', 'не столько;сколько', 'сколько'],
      ['/желаю', 'и;и#2;и#3', 'с конопушками;с чубчиками'],
      ['брови;волоски/были покрыты', 'и;и#2', 'видимые'],
    ], [
      ['дочь/хотела;пить;есть;перестала спать;ходить могла', 'ни;ни#2;и', 'ни#2;перестала'],
      ['/было|роли/исполнялись', 'и', 'и'],
      ['он/мог бы обжиться;подружился', 'да', 'да'],
      ['квартира/предназначалась;занята была', 'и;и#2;и#3', ''],
      ['гул/затихал;начинал бушевать', 'то;то#2', 'то#2'],
    ], [
      ['родители/любили;играли;связывали', 'и;однако', 'однако'],
      ['пётр ильич чайковский/был;композитором;педагогом;дирижёром;критиком', 'не только;но и;и#2', 'но;дирижёром'],
      ['балет/имел|шедевр/обрёл', 'и', 'и'],
      ['чайковский/увлекался;был поклонником', '', 'был;глинки'],
      ['пьесы/являются;сценками', '', 'живо'],
    ], [
      ['девочки/переодевают|павел/собирал;разбирал', 'как;так и;и#2;и#3', 'так'],
      ['приступ/сковал|она/почувствовала;стала;молиться', 'и;и#2;и#3', 'и;почти'],
      ['яблоки;стволы/насыщали|запах/просачивается', 'и;и#2;и#3;и#4', 'и#3'],
      ['она/опустила;затрепетала|струны/заныли', 'и;и#2', 'раскалённые'],
      ['дым/расстилается|головка/поворачивается;спорит', 'и;и#2;и#3;и#4', ''],
    ], [
      ['она/давит', 'и;и#2;и#3', 'и#2;и#3'],
      ['/постарайся доказать|/уезжай', 'либо', ''],
      ['результат;накал;интерес/дорог', 'не столько;сколько;да', 'сколько'],
      ['дедушка/стремился воспитать|он/использовал', 'и;и#2', 'и#2'],
      ['/можно отнести', 'и;а также', 'а'],
    ],
  ];

  // Однородные члены: буква задаёт тип линии и кружочка.
  const homogeneous = [
    ['def:серое;заложенное тучами|obj:грустить;мечтать', 'p:одет был;сидел', 's:картины;вазы;часы', 'obj:учителям;родителям', 'p:взяли;сошли|obj:еду;лекарства'],
    ['s:жители;туристы|circ:пешком;при помощи водного транспорта|obj:улочкам;набережным;мостам', 'def:прогулок;экскурсий', '', 'p:одним из символов венеции;главным средством передвижения по каналам города;служит', 'def:старинной;оснащённой небольшой кабиной'],
    ['p:богат;знаменит;беднел;мельчал;потерялся', 'p:собирался;готовился начать;рисовал', 'circ:мрачней;ниже', 'def:юношеские;обманувшие его;обманутые им', ''],
    ['def:тёмными;часто до половины размётанными', 'p:волновалось;лоснилось|circ:широко;мягко', 'p:вынул;подал', 's:лес;дол', ''],
    ['circ:дома;в разговорах|obj:родственниками;друзьями', 'obj:землянику;грибы', '', 'p:уселся;углубился|def:пролетевших быстро предыдущих суток;нынешнего утра', 'p:сложили;были готовы выезжать|obj:продовольствие;тёплые вещи;книги;антиквариат'],
    ['', 'p:поднимался;всматривался|def:бородачей;носителей', 'p:радостно;тревожно', 'obj:русым;черноволосым;с конопушками;кудряшками;с чубчиками;косичками', 's:брови;волоски|def:мельчайшие;видимые только при ярком свете|circ:на висках;на переносице'],
    ['p:пить;есть;перестала спать;ходить могла', '', 'p:мог бы обжиться;подружился', 'p:предназначалась;занята была|obj:столом;прислугой;ганей;семейством', 'p:затихал;начинал бушевать'],
    ['p:любили;играли;связывали', 'p:композитором;педагогом;дирижёром;музыкальным критиком', '', 'p:увлекался;был поклонником|def:моцарта;глинки', 'def:неповторимыми по своему многообразию;живо воздействующими на чувства слушателей'],
    ['p:собирал;разбирал|def:человека;его отдельных органов', 'p:почувствовала;стала горячо и самозабвенно молиться|def:цепенеющие;почти полностью обессиленные|circ:горячо;самозабвенно', 's:яблоки;стволы|def:красные;душистые;рук;шеи', 'p:опустила;затрепетала|def:певучие;раскалённые князем-басурманом', 'p:поворачивается;спорит|circ:резко;энергично|def:сизом;красном от настольной лампы'],
    ['circ:сверху;снизу;с боков', '', 's:результат;накал;интерес', 'obj:гражданами;хорошими людьми', 'obj:отсутствие;строение|def:пузыря;мускулатуры'],
  ];
  const boundaries = [
    ['', '', '', '', ''],
    ['', '', '400|среди', '', ''],
    ['', '', '', '', 'праздник|и придут'],
    ['', 'зеленело|всё#2', '', '', 'оживает|и у'],
    ['', 'редко|зато', 'условия|и не', '', ''],
    ['', 'пункт|и лёва', '', '', ''],
    ['', 'актрис|и поэтому', '', '', ''],
    ['', '', 'успеха|и только', '', ''],
    ['кукол|так и', 'её|и тогда', 'плодородия|и запах', 'страха|и заныли', 'пластами|и тёмненькая'],
    ['', 'односельчанам|либо', '', 'людьми|и при', ''],
  ];

  const split = (s) => s ? s.split(';') : [];
  function words(sent, phrase) {
    const [term, ordinal = '1'] = norm(phrase).split('#');
    const count = Number(ordinal);
    let found = [];
    for (let i = 0; i < count; i++) found = R(sent, term, i ? found[0] + 1 : 0);
    if (!found.length) throw new Error('Нет фразы: ' + phrase + ' · ' + sent.text);
    return found;
  }
  function keyFor(text, [bases, unions, commas], hom, boundary) {
    const sent = P(text.normalize('NFC'));
    const groups = bases.split('|').map((base) => {
      const [s, p] = base.split('/');
      return { s: split(s).flatMap((w) => words(sent, w)), p: split(p).flatMap((w) => words(sent, w)) };
    });
    const rings = split(unions).map((w) => words(sent, w));
    const members = hom ? hom.split('|').flatMap((row) => {
      const [type, terms] = row.split(':');
      return split(terms).map((w) => ({ type, words: words(sent, w) }));
    }) : [];
    const division = boundary ? boundary.split('|').map((w, i) => {
      const found = words(sent, w);
      return i ? found[0] : found[found.length - 1] + 1;
    }) : [];
    return { sent, groups, rings, members, division, commas: split(commas).map((w) => words(sent, w)[0]) };
  }
  const exercises = window.PRACTICE_DATA[16].ex.map((ex, i) => ({
    ...ex, keys: ex.sents.map((text, j) => keyFor(text, keys[i][j], homogeneous[i][j], boundaries[i][j])),
  }));

  const stages = [
    ['Выдели грамматические основы', 'Подлежащее — одной чертой, сказуемое — двумя. Разные основы выделяй разными цветами.', ['subj', 'pred']],
    ['Обведи в кружок сочинительные союзы', 'Чтобы обвести составной союз, проведи от первого слова к последнему.', ['ring']],
    ['Обозначь однородные члены и части предложения', 'Подчеркни члены предложения и поставь над однородными кружочки нужного типа. Если основ несколько, отметь границы частей.', ['subj', 'pred', 'obj', 'def', 'circ', 'hom', 'brk']],
    ['Расставь запятые', 'Нажимай на промежутки между словами. Если запятых нет, сразу проверь этап.', ['comma']],
  ];
  const same = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
  function render(body, api, index) {
    const ex = exercises[index];
    const el = h('<div class="slide train"><h2>Тренировка</h2><div class="algo-panel"></div><div class="board-host"></div><div class="tool-host"></div><div class="stage-extra"></div></div>');
    const panel = el.querySelector('.algo-panel'), host = el.querySelector('.board-host');
    const tools = el.querySelector('.tool-host'), extra = el.querySelector('.stage-extra');
    body.appendChild(el);
    let sentence = 0, stage = 0, tries = 0, board;
    function show() {
      const key = ex.keys[sentence];
      if (board?.ro) board.ro.disconnect();
      host.replaceChildren();
      extra.replaceChildren();
      board = new M.Board(host, key.sent, { spanRings: true, romanBases: true });
      setStage();
    }
    function setStage() {
      tries = 0;
      const [title, help, stageTools] = stages[stage];
      board.startStage();
      tools.replaceChildren();
      M.toolbar(tools, board, stageTools);
      panel.innerHTML = `<p>Предложение ${sentence + 1} из ${ex.keys.length}</p><div class="ap-cur"><b>Шаг ${stage + 1}. ${title}</b><small>${help}</small></div>`;
      api.foot({ label: 'Проверить этап', onClick: check });
    }
    function reference(key, marks) {
      const m = M.clone(marks);
      if (stage === 0 || stage === 2) {
        m.mem = {};
        key.groups.forEach((g, i) => ['s', 'p'].forEach((type) => g[type].forEach((w) => { m.mem[w] = { t: type, b: i + 1 }; })));
      }
      if (stage === 1) {
        m.rings = key.rings.flat();
        m.rl = key.rings.flatMap((r) => r.slice(1));
      }
      if (stage === 2) {
        m.labels = {};
        m.obj = []; m.def = []; m.circ = [];
        key.members.forEach(({ type, words }) => {
          m.labels[words[0]] = 'o:' + type;
          if (m[type]) m[type].push(...words);
        });
        if (key.division.length) {
          const [end, start] = key.division;
          m.gm = { 0: '[', [end]: ']', [key.sent.words.length]: ']' };
          m.gm[start] = (m.gm[start] || '') + '[';
        }
      }
      if (stage === 3) m.commas = key.commas;
      return m;
    }

    function fail(messages) {
      api.bad(messages);
      if (++tries < 2) return;
      api.foot({ label: 'Проверить этап', onClick: check, extraLabel: 'Сверить ответ', onExtra: () => {
        const key = ex.keys[sentence], solution = reference(key, board.getMarks());
        tools.replaceChildren();
        board.startStage();
        board.readOnly = true;
        const card = h('<div class="stage-comparison"><h3>Верная разметка</h3><div></div></div>');
        extra.appendChild(card);
        new M.Board(card.lastElementChild, key.sent, { marks: solution, readOnly: true, romanBases: true });
        api.foot({ label: 'Дальше', onClick: () => {
          extra.replaceChildren();
          board.readOnly = false;
          board.setMarks(solution);
          advance();
        } });
      } });
    }

    function check() {
      const key = ex.keys[sentence], marks = board.getMarks();
      if (stage === 0) {
        const result = M.checkBases(marks, { groups: key.groups, optional: key.groups.flatMap((g) => g.p.map((n) => n - 1).filter((n) => /^н[еи]$/i.test(key.sent.words[n] || ''))) });
        if (!result.ok) { fail(result.msgs); return; }
      }
      if (stage === 1 && !same(board.ringGroups().map((a) => a.join(',')), key.rings.map((a) => a.join(',')))) {
        fail(['Проверь союзы. Слова одной части составного союза должны быть внутри общего овала.']);
        return;
      }
      if (stage === 2) {
        const result = M.checkBases(marks, { groups: key.groups, optional: Object.keys(marks.mem).map(Number) });
        if (!result.ok) { fail(result.msgs); return; }
        const missing = key.members.filter(({ type, words }) => {
          const line = (i) => ['s', 'p'].includes(type) ? marks.mem[i]?.t === type : marks[type].includes(i);
          return !words.some((i) => marks.labels[i] === 'o:' + type && line(i));
        });
        if (missing.length) {
          fail(['Отметь каждый однородный член: нужна линия и кружочек соответствующего типа.']);
          return;
        }
        if (key.division.length) {
          const [end, start] = key.division;
          const close = [end, start, start + 1, start + 2].some((i) => marks.gm[i]?.includes(']'));
          const open = [0, 1, 2].some((i) => marks.gm[i]?.includes('[')) &&
            [end, start, start + 1, start + 2].some((i) => marks.gm[i]?.includes('['));
          if (!(close && open && marks.gm[key.sent.words.length]?.includes(']'))) {
            fail(['Проверь квадратные скобки вокруг обеих частей предложения.']);
            return;
          }
        }
      }
      if (stage === 3 && !same(marks.commas, key.commas)) {
        fail(['Проверь места запятых.']);
        return;
      }
      api.good(5, 0, api.mainEl);
      advance();
    }
    function advance() {
      api.feedback(null);
      if (++stage < stages.length) { setStage(); return; }
      board.startStage();
      board.readOnly = true;
      tools.replaceChildren();
      extra.appendChild(h(`<div class="explain card"><h3>Разбор</h3><p>${ex.explain[sentence].replace(/^\d+\)\s*/, '')}</p></div>`));
      if (sentence === ex.keys.length - 1) {
        extra.appendChild(h(`<div class="ans-big">Ровно одна запятая в предложениях <b>${ex.answer.split('').join(', ')}</b></div>`));
        api.foot({ label: 'Дальше' });
      } else {
        api.foot({ label: 'Следующее предложение', onClick: () => { sentence++; stage = 0; show(); } });
      }
    }
    show();
  }

  App.Practice16 = render;
})();

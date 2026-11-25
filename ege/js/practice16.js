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
      ['свыше 400/насчитывается|женщина/есть', 'и', 'и'],
      ['гондола/является;одним из символов;средством;служит', 'не только;но и', 'но;служит'],
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
    ['s:жители;туристы|circ:пешком;при помощи~транспорта|obj/circ:по улочкам;набережным;мостам', 'obj:прогулок;экскурсий', '', 'p:одним из символов;средством;служит', 'def:старинной;оснащённой небольшой кабиной'],
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

  const requiredDefinitions = {
    '0:1': ['домашнее', 'серенькое'],
    '1:1': ['знаменитые', 'венецианские'],
  };
  const participles = {
    '0:0': ['заложенное тучами'], '1:4': ['оснащённой небольшой кабиной'],
    '2:3': ['обманувшие его', 'обманутые им'], '3:0': ['часто до половины размётанными'],
    '5:4': ['видимые только при ярком свете'], '7:4': ['живо воздействующими на чувства слушателей'],
    '8:1': ['почти полностью обессиленные'], '8:2': ['намазанные известью'],
    '8:3': ['раскалённые князем-басурманом'],
  };
  const unmarked = {
    '1:0': ['водного'],
    '1:3': ['главным'],
  };
  const rules = {
    D: 'Однородные определения',
    N: 'Однородные члены без союза',
    R: 'Повторяющийся союз',
    T: 'Вторая часть двойного союза',
    A: 'Противительный или присоединительный союз между однородными членами',
    P: 'Граница пар однородных членов',
    S: 'Граница частей сложного предложения',
    I: 'Одиночный союз между однородными членами',
    G: 'Общий элемент у частей сложного предложения',
    F: 'Фразеологизм',
    M: 'Побудительные части с одиночным союзом',
  };
  // Правила перечислены в порядке запятых. Для предложения без запятых — причина их отсутствия.
  const reasons = [
    ['D', 'I', 'RR', 'T', 'I'], ['NR', 'I', 'S', 'TN', 'D'],
    ['AN', 'N', 'I', 'D', 'G'], ['D', 'S', 'I', 'I', 'G'],
    ['I', 'S', 'G', 'T', 'P'], ['F', 'S', 'T', 'PP', 'D'],
    ['RN', 'S', 'A', 'I', 'R'], ['A', 'TN', 'S', 'NN', 'D'],
    ['T', 'SD', 'S', 'D', 'G'], ['RR', 'M', 'T', 'S', 'A'],
  ];

  const split = (s) => s ? s.split(';') : [];
  function words(sent, phrase) {
    if (phrase.includes('~')) return phrase.split('~').flatMap((part) => words(sent, part));
    const [term, ordinal = '1'] = norm(phrase).split('#');
    const count = Number(ordinal);
    let found = [];
    for (let i = 0; i < count; i++) found = R(sent, term, i ? found[0] + 1 : 0);
    if (!found.length) throw new Error('Нет фразы: ' + phrase + ' · ' + sent.text);
    return found;
  }
  function keyFor(text, [bases, unions, commas], hom, boundary, id, rule) {
    const sent = P(text.normalize('NFC'));
    const groups = bases.split('|').map((base) => {
      const [s, p] = base.split('/');
      return { s: split(s).flatMap((w) => words(sent, w)), p: split(p).flatMap((w) => words(sent, w)) };
    });
    const rings = split(unions).map((w) => words(sent, w));
    const members = hom ? hom.split('|').flatMap((row) => {
      const [types, terms] = row.split(':');
      return split(terms).map((w) => ({ types: types.split('/'), words: words(sent, w) }));
    }) : [];
    const division = boundary ? boundary.split('|').map((w, i) => {
      const found = words(sent, w);
      return i ? found[0] : found[found.length - 1] + 1;
    }) : [];
    return { sent, groups, rings, members, division, rules: [...rule],
      definitions: (requiredDefinitions[id] || []).flatMap((word) => words(sent, word)),
      participles: (participles[id] || []).map((phrase) => words(sent, phrase)),
      unmarked: (unmarked[id] || []).flatMap((word) => words(sent, word)),
      commas: split(commas).map((w) => words(sent, w)[0]) };
  }
  const exercises = window.PRACTICE_DATA[16].ex.map((ex, i) => ({
    ...ex, keys: ex.sents.map((text, j) => keyFor(text, keys[i][j], homogeneous[i][j], boundaries[i][j], `${i}:${j}`, reasons[i][j])),
  }));

  const stages = [
    ['Выдели грамматические основы', 'Подлежащее — одной чертой, сказуемое — двумя. Разные основы выделяй разными цветами.', ['subj', 'pred']],
    ['Обведи в кружок сочинительные союзы', 'Чтобы обвести составной союз, проведи от первого слова к последнему.', ['ring']],
    ['Обозначь однородные члены и части предложения', 'Подчеркни члены предложения. Кружок сам подстроится под линию. Чтобы соединить линию внутри оборота, проведи по всей фразе. Отметь границы частей или оборота.', ['subj', 'pred', 'obj', 'def', 'circ', 'hom', 'brk', 'bar', 'label']],
    ['Расставь запятые', 'Нажимай на промежутки между словами. Если запятых нет, сразу проверь этап.', ['comma']],
  ];
  const same = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
  function render(body, api, index) {
    const ex = exercises[index];
    const el = h('<div class="slide train"><h2>Тренировка</h2><div class="algo-panel"></div><div class="board-host"></div><div class="tool-host"></div><div class="stage-extra"></div></div>');
    const panel = el.querySelector('.algo-panel'), host = el.querySelector('.board-host');
    const tools = el.querySelector('.tool-host'), extra = el.querySelector('.stage-extra');
    body.appendChild(el);
    const draftKey = `variant${index}`;
    const state = api.draft(draftKey) || { sentence: 0, stage: 0, markings: [], rules: [], punctuationCorrect: false, response: '' };
    let tries = 0, board;
    const save = () => api.saveDraft(draftKey, state);
    const current = () => ex.keys[state.sentence];
    function show() {
      if (board?.ro) board.ro.disconnect();
      host.replaceChildren();
      extra.replaceChildren();
      tools.replaceChildren();
      if (state.stage >= 6) { finalAnswer(); return; }
      const key = current();
      board = new M.Board(host, key.sent, {
        spanRings: true, romanBases: true, useLinks: true, editLinks: true, labels: ['ПО'],
        marks: state.markings[state.sentence],
        onChange: (marks) => { state.markings[state.sentence] = marks; save(); },
      });
      if (state.stage === 4) explainPunctuation();
      else if (state.stage === 5) showAnalysis();
      else setStage();
    }
    function setStage() {
      tries = 0;
      const [title, help, stageTools] = stages[state.stage];
      board.startStage();
      tools.replaceChildren();
      M.toolbar(tools, board, stageTools);
      panel.innerHTML = `<p>Предложение ${state.sentence + 1} из ${ex.keys.length}</p><div class="ap-cur"><b>Шаг ${state.stage + 1}. ${title}</b><small>${help}</small></div>`;
      api.foot({ label: 'Проверить этап', onClick: check, extraLabel: '💡', onExtra: () => api.spendHint(0, help) });
    }
    function reference(key, marks) {
      const m = M.clone(marks);
      if (state.stage === 0 || state.stage === 2) {
        m.mem = {};
        key.groups.forEach((g, i) => ['s', 'p'].forEach((type) => g[type].forEach((w) => { m.mem[w] = { t: type, b: i + 1 }; })));
      }
      if (state.stage === 1) {
        m.rings = key.rings.flat();
        m.rl = key.rings.flatMap((r) => r.slice(1));
      }
      if (state.stage === 2) {
        m.labels = {};
        m.obj = []; m.def = [...key.definitions]; m.circ = []; m.links = [];
        key.members.forEach(({ types: [type], words }) => {
          m.labels[words[0]] = 'o:' + type;
          if (m[type]) m[type].push(...words);
          words.slice(1).forEach((w, i) => { if (w === words[i] + 1) m.links.push(w); });
        });
        key.participles.forEach((phrase) => {
          m.def.push(...phrase);
          m.links.push(...phrase.slice(1));
          m.bars.push(phrase[0], phrase.at(-1) + 1);
          if (!m.labels[phrase[0]]) m.labels[phrase[0]] = 'ПО';
          else m.phraseLabels[phrase[0]] = 'ПО';
        });
        if (key.division.length) {
          const [end, start] = key.division;
          m.gm = { 0: '[', [end]: ']', [key.sent.words.length]: ']' };
          m.gm[start] = (m.gm[start] || '') + '[';
        }
      }
      return m;
    }

    function fail(messages) {
      api.bad(messages);
      if (++tries < 2 || extra.querySelector('.compare-markup')) return;
      const compare = h('<button class="btn ghost compare-markup">Сверить ответ</button>');
      extra.appendChild(compare);
      compare.addEventListener('click', () => {
        const key = current(), solution = reference(key, board.getMarks());
        tools.replaceChildren();
        board.startStage();
        board.readOnly = true;
        const card = h('<div class="stage-comparison"><h3>Верная разметка</h3><div></div></div>');
        extra.replaceChildren(card);
        const example = new M.Board(card.lastElementChild, key.sent, { marks: solution, useLinks: true, readOnly: true, romanBases: true });
        api.foot({ label: 'Дальше', onClick: () => {
          example.ro?.disconnect();
          extra.replaceChildren();
          board.readOnly = false;
          board.setMarks(solution);
          advance();
        } });
      });
    }

    function checkMarkup(key, marks) {
      const missing = key.members.some(({ types, words }) => !words.some((i) => types.some((type) => {
        const line = ['s', 'p'].includes(type) ? marks.mem[i]?.t === type : marks[type].includes(i);
        return marks.labels[i] === 'o:' + type && line;
      })));
      if (missing) return 'Отметь каждый однородный член: нужна линия и кружок.';
      const extraCircle = Object.keys(marks.labels).some((i) => marks.labels[i].startsWith('o:') &&
        !key.members.some(({ words }) => words.includes(+i)));
      if (extraCircle) return 'Есть лишний кружок. Проверь, однородны ли отмеченные члены.';
      if (key.definitions.some((i) => !marks.def.includes(i))) return 'Отметь неоднородные определения волнистой линией.';
      if (key.unmarked.some((i) => ['def', 'circ', 'obj'].some((type) => marks[type].includes(i)) || marks.mem[i])) return 'Проверь, нет ли лишних подчёркиваний.';
      if (key.participles.some((phrase) => !phrase.every((i) => marks.def.includes(i)) ||
          !phrase.slice(1).every((i) => marks.links.includes(i)) ||
          marks.links.includes(phrase[0]) || marks.links.includes(phrase.at(-1) + 1) ||
          !marks.bars.includes(phrase[0]) || !marks.bars.includes(phrase.at(-1) + 1) ||
          !phrase.some((i) => marks.labels[i] === 'ПО' || marks.phraseLabels[i] === 'ПО'))) {
        return 'Отметь причастный оборот отдельной сплошной волнистой линией. Поставь две границы и подпиши «ПО».';
      }
      if (key.division.length) {
        const [end, start] = key.division;
        const close = [end, start, start + 1, start + 2].some((i) => marks.gm[i]?.includes(']'));
        const open = [0, 1, 2].some((i) => marks.gm[i]?.includes('[')) &&
          [end, start, start + 1, start + 2].some((i) => marks.gm[i]?.includes('['));
        if (!(close && open && marks.gm[key.sent.words.length]?.includes(']'))) return 'Проверь квадратные скобки вокруг обеих частей предложения.';
      }
      return '';
    }

    function check() {
      const key = current(), marks = board.getMarks();
      if (state.stage === 0 || state.stage === 2) {
        const optional = key.groups.flatMap((g) => g.p.map((n) => n - 1).filter((n) => /^н[еи]$/i.test(key.sent.words[n] || '')));
        const result = M.checkBases(marks, { groups: key.groups, optional });
        if (!result.ok) { fail(result.msgs); return; }
      }
      if (state.stage === 1 && !same(board.ringGroups().map((a) => a.join(',')), key.rings.map((a) => a.join(',')))) {
        fail(['Проверь союзы. Слова одной части составного союза должны быть внутри общего овала.']);
        return;
      }
      if (state.stage === 2) {
        const error = checkMarkup(key, marks);
        if (error) { fail([error]); return; }
      }
      if (state.stage === 3) {
        state.punctuationCorrect = same(marks.commas, key.commas);
        if (!state.punctuationCorrect) api.bad(['В расстановке запятых есть ошибка.'], { concise: true });
      } else api.good(5, 0, api.mainEl);
      advance();
    }

    function advance() {
      api.feedback(null);
      state.stage++;
      save();
      if (state.stage === 4) explainPunctuation(); else setStage();
    }

    function freezeBoard() {
      board.startStage();
      board.readOnly = true;
      tools.replaceChildren();
    }
    function result() {
      const correct = state.punctuationCorrect;
      return h(`<p class="punct-result ${correct ? 'correct' : 'incorrect'}">${correct ? 'Запятые расставлены верно.' : 'В расстановке запятых есть ошибка.'}</p>`);
    }

    function explainPunctuation() {
      freezeBoard();
      panel.innerHTML = '<div class="ap-cur"><b>Объясни пунктуацию</b></div>';
      extra.replaceChildren(result());
      const key = current();
      const choices = key.commas.length ? ['D','N','R','T','A','P','S'] : ['I','G','F','M'];
      const form = h(`<div class="reasons">${key.rules.map((_, i) => {
        const caption = key.commas.length ? `Запятая перед «${key.sent.words[key.commas[i]]}»` : 'Почему запятых нет?';
        return `<label>${caption}<select class="rs-sel" aria-label="${caption}"><option value="">Выбери причину</option>${choices.map((code) => `<option value="${code}">${rules[code]}</option>`).join('')}</select></label>`;
      }).join('')}</div>`);
      extra.appendChild(form);
      const selects = [...form.querySelectorAll('select')];
      selects.forEach((select, i) => {
        select.value = state.rules[i] || '';
        select.addEventListener('change', () => { state.rules[i] = select.value; save(); setCheck(); });
      });
      function setCheck() {
        api.foot({ label: 'Проверить', stable: true, enabled: selects.every((select) => select.value), onClick: () => {
          state.reasonsCorrect = selects.every((select, i) => select.value === key.rules[i]);
          if (!state.reasonsCorrect) api.bad(['Сверь объяснение с разбором.'], { concise: true });
          else if (state.punctuationCorrect) { api.good(5, 0, api.mainEl); api.feedback(null); }
          state.stage = 5;
          save();
          showAnalysis();
        } });
      }
      setCheck();
    }

    function showAnalysis() {
      freezeBoard();
      panel.innerHTML = '<div class="ap-cur"><b>Разбор предложения</b></div>';
      const key = current(), expected = M.clone(board.getMarks());
      expected.commas = key.commas;
      board.setMarks(expected);
      extra.replaceChildren(result());
      const ruleResult = state.reasonsCorrect ? 'Причины указаны верно.' : 'В причинах есть ошибка.';
      extra.appendChild(h(`<div class="explain card"><h3>Разбор</h3><p>${ruleResult}</p><p>${ex.explain[state.sentence].replace(/^\d+\)\s*/, '')}</p></div>`));
      api.foot({ label: state.sentence + 1 < ex.keys.length ? 'Следующее предложение' : 'Записать ответ', onClick: () => {
        state.sentence++;
        state.stage = state.sentence === ex.keys.length ? 6 : 0;
        state.rules = [];
        api.feedback(null);
        save();
        show();
      } });
    }

    function finalAnswer() {
      panel.innerHTML = '<div class="ap-cur"><b>В каких предложениях нужна ровно одна запятая?</b><small>Запиши номера без пробелов и запятых.</small></div>';
      const list = h('<ol class="ex-list"></ol>');
      host.appendChild(list);
      ex.keys.forEach((key, i) => {
        const li = h('<li></li>');
        list.appendChild(li);
        new M.Board(li, key.sent, { marks: state.markings[i], readOnly: true, romanBases: true, useLinks: true });
      });
      if (state.stage === 7) {
        extra.appendChild(h(`<div class="explain card">Ответ: <b>${ex.answer}</b></div>`));
        api.foot({ label: 'Дальше' });
        return;
      }
      const done = () => { state.stage = 7; save(); api.foot({ label: 'Дальше' }); };
      const answer = App.Kit.answerPh(ex.answer, '', { value: state.response, onInput: (value) => { state.response = value; save(); }, digitsOnly: true });
      answer(extra, api, done);
    }
    show();
  }

  App.Practice16 = render;
})();

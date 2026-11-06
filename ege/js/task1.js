/* Задание 1. Слово на месте пропуска (средства связи предложений) */
(() => {
  const { h, coin } = App;

  /* ===== Алгоритм ===== */
  const STEPS = [
    { t: 'Прочитай задание', d: 'Какое слово нужно (союз, частица, местоимение, наречие…) и в каком предложении пропуск.' },
    { t: 'Найди предложение с пропуском', d: 'Прочитай его вместе с предыдущим — пропущенное слово связывает их по смыслу.' },
    { t: 'Определи смысловую связь', d: 'Противопоставление? Причина? Следствие? Условие? Уступка? Указание на сказанное?' },
    { t: 'Вспомни слова нужной группы', d: 'Возьми из шпаргалки слова, которые подходят и по группе, и по смыслу.' },
    { t: 'Подставь и перечитай', d: 'Смысл и грамматика должны сойтись: род, число, падеж, порядок слов.' },
    { t: 'Запиши ответ', d: 'Одно слово, без пробелов и знаков препинания. Буквы ё/е не важны.' },
  ];
  const CHEAT = [
    ['Противопоставление', 'но, однако, а, зато', 'противительные союзы'],
    ['Причина', 'потому что, так как, ведь, поскольку', 'подчинительные союзы, частица «ведь»'],
    ['Следствие, вывод', 'поэтому, следовательно, значит, итак', 'наречие, вводные слова'],
    ['Условие', 'если, когда', 'подчинительные союзы'],
    ['Уступка', 'хотя', 'подчинительный союз'],
    ['Указание на сказанное', 'это, этот, такой, тот', 'указательные местоимения'],
    ['Обобщение', 'все, всё, весь, каждый', 'определительные местоимения'],
    ['Выделение, усиление', 'даже, именно, только, лишь', 'частицы'],
  ];

  const algoChart = (active = -1) => `<div class="af">
      <div class="af-start">Задание 1</div>
      ${STEPS.map((s, i) => `<div class="af-arrow"></div><div class="af-step${i === active ? ' focus' : ''}" data-i="${i}"><b>${i + 1}</b><div><strong>${s.t}</strong><small>${s.d}</small></div></div>`).join('')}
    </div>`;
  const cheatTable = () => `<div class="cheat">${CHEAT.map(([a, b, c]) => `<div class="cheat-row"><b>${a}</b><span>${b}</span><small>${c}</small></div>`).join('')}</div>`;
  const ALGO_HTML = `<h3 style="margin:6px 6px 10px">Алгоритм: задание 1</h3>${algoChart()}<h3 style="margin:16px 6px 8px">Шпаргалка: связь → слова</h3>${cheatTable()}`;

  /* Окно со схемой, «приближающее» текущий шаг */
  function algoZoom(host, active) {
    const el = h(`<div class="zoom af-zoom" title="Нажми, чтобы открыть схему целиком"><div class="af-layer">${algoChart(active)}</div><span class="zoom-tag">🔍 схема</span></div>`);
    host.appendChild(el);
    el.addEventListener('click', () => App.openAlgo(ALGO_HTML));
    const layer = el.querySelector('.af-layer');
    requestAnimationFrame(() => {
      const W = el.clientWidth, H = el.clientHeight;
      const fit = Math.min(1, H / layer.scrollHeight);
      layer.style.transition = 'none';
      layer.style.transform = `translate(${(W - layer.offsetWidth * fit) / 2}px,0) scale(${fit})`;
      const node = layer.querySelector('.af-step.focus');
      if (!node) return;
      setTimeout(() => {
        const s = 1.15;
        const tx = W / 2 - (node.offsetLeft + node.offsetWidth / 2) * s;
        const ty = H / 2 - (node.offsetTop + node.offsetHeight / 2) * s;
        layer.style.transition = '';
        layer.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
      }, 350);
    });
  }

  /* ===== Тексты ===== */
  const GAP = '<span class="gap-slot">&lt;…&gt;</span>';
  const T1 = {
    task: 'Самостоятельно подберите противительный союз, который должен стоять на месте пропуска в третьем (3) предложении текста. Запишите этот союз.',
    sents: [
      'Слово «библиотека» пришло в русский язык из греческого и буквально означает «хранилище книг».',
      'Долгое время библиотеки и были прежде всего хранилищами: книги берегли, переписывали и выдавали лишь немногим учёным людям.',
      `${GAP} со временем всё изменилось: библиотека превратилась в место, куда может прийти каждый.`,
      'Сегодня здесь не только читают, но и слушают лекции, спорят, готовятся к экзаменам.',
      'Поэтому неудивительно, что многие современные библиотеки больше похожи на уютные клубы, чем на строгие архивы.',
    ],
    gap: 2,
    accept: ['однако', 'но'],
    shown: 'однако',
  };
  const T2 = {
    task: 'Самостоятельно подберите подчинительный союз, который должен стоять на месте пропуска в четвёртом (4) предложении текста. Запишите этот союз.',
    sents: [
      'Сон нужен человеку не меньше, чем еда и вода.',
      'Во время сна мозг разбирает впечатления дня и переводит важные сведения в долговременную память.',
      'Учёные доказали: тот, кто высыпается перед экзаменом, запоминает и вспоминает материал заметно лучше.',
      `${GAP} подросток спит меньше семи часов, его внимание рассеивается, а настроение портится.`,
      'Вот почему бессонная ночь над учебниками часто приносит больше вреда, чем пользы.',
    ],
    gap: 3,
    accept: ['если', 'когда'],
    shown: 'если',
    explain: 'Между частями четвёртого предложения — отношения <b>условия</b>: <i>при каком условии</i> внимание рассеивается? — <i>если</i> подросток спит меньше семи часов. Подходит подчинительный союз <b>если</b> (допустимо и <b>когда</b> в значении «если»).',
  };
  const T3 = {
    task: 'Самостоятельно подберите указательное местоимение, которое должно стоять на месте пропуска во втором (2) предложении текста. Запишите это местоимение.',
    sents: [
      'В 1755 году по инициативе Михаила Ломоносова и Ивана Шувалова в Москве был основан первый в России университет.',
      `${GAP} событие стало началом нового этапа в развитии отечественной науки и образования.`,
      'Сегодня Московский университет носит имя Ломоносова.',
    ],
    gap: 1,
    accept: ['это'],
    shown: 'это',
    explain: 'Второе предложение <b>указывает на сказанное</b> в первом: основание университета — <i>это</i> событие. Нужно указательное местоимение в форме среднего рода (событие — оно): <b>это</b>.',
  };

  const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z]/g, '');
  const textHtml = (T, fill) => `<div class="etext">${T.sents.map((s, i) => `<p data-i="${i}"><b class="snum">(${i + 1})</b> ${fill && i === T.gap ? s.replace(GAP, `<span class="gap-slot filled">${fill}</span>`) : s}</p>`).join('')}</div>`;
  const taskHtml = (T) => `<div class="etask"><span class="etask-n">1</span><div>${T.task}</div></div>`;

  function shell(body, { chip, title, text, step }) {
    const el = h(`<div class="slide">
      ${chip ? `<div class="step-chip">${chip}</div>` : ''}
      ${title ? `<h2>${title}</h2>` : ''}
      <div class="zoom-host"></div>
      ${text ? `<p class="lead">${text}</p>` : ''}
      <div class="main-host"></div>
    </div>`);
    body.appendChild(el);
    if (step != null) algoZoom(el.querySelector('.zoom-host'), step);
    return el.querySelector('.main-host');
  }

  /* Ответ в поле ввода: проверка и попытки */
  function answerBox(host, api, T, { xp = 30, coins = 15, onDone, oneShot = false }) {
    const box = h(`<div class="answer-box"><label>Ответ:</label><input class="ans word" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="20" placeholder="слово"></div>`);
    host.appendChild(box);
    const inp = box.querySelector('input');
    let tries = 0;
    const check = () => {
      const v = norm(inp.value);
      if (!v) { inp.focus(); inp.classList.add('need'); return; }
      const ok = T.accept.includes(v);
      if (ok) {
        api.good(tries ? Math.round(xp / 2) : xp, tries ? Math.round(coins / 2) : coins, inp, `Ответ <b>${v}</b> — верно!`);
        App.confetti(90);
        inp.disabled = true;
        onDone(true, v);
      } else if (oneShot) {
        api.bad([`Верный ответ: <b>${T.accept.join(' / ')}</b>.`]);
        inp.disabled = true;
        onDone(false, v);
      } else {
        tries++;
        api.bad([tries === 1 ? 'Проверь: подходит ли слово по группе, которую просит задание, и по смыслу связи?' : `Подсказка: подумай о слове на «${T.accept[0][0]}».`]);
        if (tries >= 2) api.foot({ label: 'Проверить', onClick: check, extraLabel: '👀 Показать ответ', onExtra: () => { inp.value = T.shown; inp.disabled = true; api.feedback('info', `Ответ: <b>${T.accept.join(' / ')}</b>. Разбор ниже 👇`); onDone(false, ''); } });
      }
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    api.foot({ label: 'Проверить', onClick: check });
  }

  /* Вопросы-развилки с выбором ответа */
  function quiz(host, api, steps, onEnd) {
    let i = 0;
    const ask = () => {
      const s = steps[i];
      api.feedback(null);
      api.foot({ label: 'Ответь на вопрос', enabled: false });
      host.innerHTML = `${steps.length > 1 ? `<div class="q-count">Вопрос ${i + 1} из ${steps.length}</div>` : ''}<div class="q">${s.q}</div>
        <div class="opts">${s.options.map((o, j) => `<button class="opt" data-j="${j}">${o}</button>`).join('')}</div>`;
      let wrongOnce = false;
      host.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
        if (+b.dataset.j === s.correct) {
          b.classList.add('right');
          host.querySelectorAll('.opt').forEach((x) => (x.disabled = true));
          api.good(wrongOnce ? 3 : 8, wrongOnce ? 0 : 3, b, s.ok);
          const last = i === steps.length - 1;
          api.foot({ label: last ? 'Дальше' : 'Следующий вопрос', onClick: () => { if (last) onEnd(); else { i++; ask(); } } });
        } else {
          wrongOnce = true;
          b.classList.add('wrong');
          b.disabled = true;
          api.bad([s.bad]);
        }
      }));
    };
    ask();
  }

  /* ===== Слайды ===== */
  const slides = [];

  // 0. Вступление
  slides.push((body, api) => {
    body.appendChild(h(`<div class="slide intro">
      <div class="hero"><div class="hero-num">1</div><div class="hero-castle">🏰</div></div>
      <div class="step-chip">Задание 1 · работа с текстом</div>
      <h2>Слово на месте пропуска</h2>
      <p class="lead">В тексте пропущено слово, которое <b>связывает</b> предложения по смыслу. Нужно самому подобрать его — без вариантов ответа — и записать.</p>
      <div class="mission card">
        <div class="mission-row"><span>🧭</span><div><b>Миссия</b><br>Освой алгоритм, разбери текст по шагам и пройди испытание — первый ключ 🗝️ от замка твой</div></div>
        <div class="mission-row"><span>🎁</span><div><b>Награда</b><br>опыт и монеты ${coin} для твоего города</div></div>
        <div class="mission-row"><span>🔥</span><div><b>Комбо</b><br>3 верных ответа подряд — опыт удваивается</div></div>
      </div>
    </div>`));
    api.foot({ label: 'Погнали! 🚀' });
  });

  // 1. Алгоритм и шпаргалка
  slides.push((body, api) => {
    body.appendChild(h(`<div class="slide">
      <div class="step-chip">Карта сокровищ</div>
      <h2>Алгоритм выполнения</h2>
      <p class="lead">Шесть шагов — и ни одного угадывания. Дальше пройдём каждый шаг на примере, схема будет «приближаться».</p>
      ${algoChart()}
      <h3>Шпаргалка: какая связь — какие слова</h3>
      ${cheatTable()}
    </div>`));
    api.foot({ label: 'Понятно, к шагу 1' });
  });

  // 2. Шаг 1 — прочитать задание: отметить, что искать и где
  slides.push((body, api) => {
    const host = shell(body, { chip: 'Шаг 1 из 6', title: 'Прочитай задание', step: 0, text: 'Нажми на слова, которые говорят, <b>какое слово</b> нужно подобрать и <b>в каком предложении</b> пропуск.' });
    const words = T1.task.split(' ');
    const need = new Set(['противительный', 'союз,', 'третьем']);
    host.appendChild(h(`<div class="etask pickable"><span class="etask-n">1</span><div>${words.map((w, i) => `<span class="pw" data-i="${i}">${w}</span>`).join(' ')}</div></div>`));
    const picked = new Set();
    host.querySelectorAll('.pw').forEach((el) => el.addEventListener('click', () => {
      const i = +el.dataset.i;
      if (picked.has(i)) picked.delete(i); else picked.add(i);
      el.classList.toggle('on');
      el.classList.remove('wrong');
      api.sound('tap');
    }));
    let tries = 0;
    const check = () => {
      const got = [...picked].map((i) => words[i]);
      const missing = [...need].filter((w) => !got.includes(w));
      const extra = [...picked].filter((i) => !need.has(words[i]));
      if (!missing.length && !extra.length) {
        api.good(tries ? 8 : 15, tries ? 3 : 8, null, 'Ищем <b>противительный союз</b> для <b>третьего</b> предложения. Это сразу сужает выбор до нескольких слов!');
        api.foot({ label: 'Дальше' });
      } else {
        tries++;
        extra.forEach((i) => host.querySelector(`.pw[data-i="${i}"]`).classList.add('wrong'));
        api.bad([missing.length ? 'Найдено не всё: нужно и <i>что</i> подобрать (разряд + часть речи), и <i>где</i> (номер предложения).' : 'Лишние слова выделены — оставь только самое важное.']);
        if (tries >= 2) api.foot({ label: 'Проверить', onClick: check, extraLabel: '👀 Показать', onExtra: () => {
          host.querySelectorAll('.pw').forEach((el) => el.classList.toggle('on', need.has(words[+el.dataset.i])));
          picked.clear(); words.forEach((w, i) => need.has(w) && picked.add(i));
          api.feedback('info', 'Главное в задании: <b>противительный союз</b>, <b>третье</b> предложение.');
          api.foot({ label: 'Дальше' });
        } });
      }
    };
    api.foot({ label: 'Проверить', onClick: check });
  });

  // 3. Шаг 2 — найти предложение с пропуском и связанное с ним
  slides.push((body, api) => {
    const host = shell(body, { chip: 'Шаг 2 из 6', title: 'Найди предложение с пропуском', step: 1, text: 'Нажми на предложение с пропуском и на то, с которым его связывает пропущенное слово (обычно — предыдущее).' });
    host.appendChild(h(taskHtml(T1)));
    host.insertAdjacentHTML('beforeend', textHtml(T1));
    const picked = new Set();
    host.querySelectorAll('.etext p').forEach((p) => {
      p.classList.add('pickable');
      p.addEventListener('click', () => { const i = +p.dataset.i; picked.has(i) ? picked.delete(i) : picked.add(i); p.classList.toggle('on'); p.classList.remove('wrong'); });
    });
    let tries = 0;
    const check = () => {
      const ok = picked.size === 2 && picked.has(1) && picked.has(2);
      if (ok) {
        api.good(tries ? 8 : 15, tries ? 3 : 8, null, 'Пропуск — в <b>(3)</b>, а связан он с <b>(2)</b>: там рассказано, какими библиотеки были раньше.');
        api.foot({ label: 'Дальше' });
      } else {
        tries++;
        [...picked].filter((i) => i !== 1 && i !== 2).forEach((i) => host.querySelector(`.etext p[data-i="${i}"]`).classList.add('wrong'));
        api.bad([!picked.has(2) ? 'Сначала найди предложение, где стоит &lt;…&gt;.' : 'Пропущенное слово связывает (3) с предложением прямо перед ним.']);
      }
    };
    api.foot({ label: 'Проверить', onClick: check });
  });

  // 4. Шаг 3 — смысловая связь
  slides.push((body, api) => {
    const host = shell(body, { chip: 'Шаг 3 из 6', title: 'Определи смысловую связь', step: 2 });
    host.insertAdjacentHTML('beforeend', `<div class="etext compact"><p><b class="snum">(2)</b> ${T1.sents[1]}</p><p><b class="snum">(3)</b> ${T1.sents[2]}</p></div>`);
    const qa = h('<div class="qa"></div>');
    host.appendChild(qa);
    quiz(qa, api, [
      { q: 'Раньше библиотеки были <b>хранилищами для немногих</b>. Потом <b>всё изменилось</b> — туда может прийти каждый. Как связаны эти мысли?', options: ['Противопоставление: было одно — стало другое', 'Причина: второе объясняет первое', 'Следствие: второе вытекает из первого', 'Пояснение: второе уточняет первое'], correct: 0, ok: 'Да! «Было так» ↔ «стало иначе» — классическое <b>противопоставление</b>.', bad: 'Сравни смысл: в (2) — как было раньше, в (3) — что всё стало наоборот. Это противоположные картины.' },
    ], () => api.next());
  });

  // 5. Шаг 4 — мини-игра: собрать противительные союзы
  slides.push((body, api) => {
    const host = shell(body, { chip: 'Шаг 4 из 6', title: 'Собери противительные союзы', step: 3, text: 'Задание просит <b>противительный союз</b>. Нажми на все такие союзы — остальные слова оставь.' });
    const items = [['но', 1], ['поэтому', 0], ['однако', 1], ['если', 0], ['а', 1], ['ведь', 0], ['зато', 1], ['хотя', 0], ['и', 0], ['это', 0], ['тоже', 0], ['так как', 0]];
    host.appendChild(h(`<div class="word-pool">${items.map(([w], i) => `<button class="wchip" data-i="${i}">${w}</button>`).join('')}</div>`));
    const picked = new Set();
    host.querySelectorAll('.wchip').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.i; picked.has(i) ? picked.delete(i) : picked.add(i); b.classList.toggle('on'); b.classList.remove('wrong'); }));
    let tries = 0;
    const check = () => {
      const wrong = items.map((it, i) => (picked.has(i) !== !!it[1] ? i : -1)).filter((i) => i >= 0);
      if (!wrong.length) {
        host.querySelectorAll('.wchip.on').forEach((b) => b.classList.add('right'));
        api.good(tries ? 10 : 20, tries ? 5 : 10, null, 'Противительные союзы: <b>но, однако, а, зато</b>. Они противопоставляют одно другому.');
        api.foot({ label: 'Дальше' });
      } else {
        tries++;
        wrong.filter((i) => picked.has(i)).forEach((i) => host.querySelector(`.wchip[data-i="${i}"]`).classList.add('wrong'));
        const miss = wrong.filter((i) => !picked.has(i)).length;
        api.bad([miss ? `Найдены не все противительные союзы (осталось ${miss}).` : 'Выделены лишние слова: «поэтому» — следствие, «если» — условие, «ведь», «так как» — причина, «хотя» — уступка.']);
      }
    };
    api.foot({ label: 'Проверить', onClick: check });
  });

  // 6. Шаг 5 — подставить и перечитать
  slides.push((body, api) => {
    const host = shell(body, { chip: 'Шаг 5 из 6', title: 'Подставь и перечитай', step: 4, text: 'Нажимай на союзы — они встанут в пропуск. Какие из них подходят по смыслу?' });
    const sentEl = h(`<div class="etext compact"><p><b class="snum">(3)</b> <span class="s3">${T1.sents[2]}</span></p></div>`);
    host.appendChild(sentEl);
    const s3 = sentEl.querySelector('.s3');
    const words = ['Но', 'Однако', 'А', 'Зато'];
    host.appendChild(h(`<div class="word-pool">${words.map((w) => `<button class="wchip" data-w="${w}">${w}</button>`).join('')}</div>`));
    host.querySelectorAll('.wchip').forEach((b) => b.addEventListener('click', () => {
      s3.innerHTML = T1.sents[2].replace(GAP, `<span class="gap-slot filled">${b.dataset.w}</span>`);
      host.querySelectorAll('.wchip').forEach((x) => x.classList.toggle('on', x === b));
      api.sound('tap');
    }));
    const qa = h('<div class="qa"></div>');
    host.appendChild(qa);
    quiz(qa, api, [
      { q: 'Какие союзы лучше всего встают в начало предложения (3)?', options: ['«Но» и «Однако»', '«А» и «Зато»', 'Подходят все четыре'], correct: 0, ok: '«<b>Однако</b> со временем всё изменилось» — звучит естественно, «<b>Но</b>» тоже. «Зато» означает «в возмещение» (плохое — зато хорошее), а «а» здесь звучит разговорно.', bad: 'Подставь и прочитай вслух: «Зато со временем всё изменилось» — разве это возмещение? Смысл не тот.' },
    ], () => api.next());
  });

  // 7. Шаг 6 — записать ответ
  slides.push((body, api) => {
    const host = shell(body, { chip: 'Шаг 6 из 6', title: 'Запиши ответ', step: 5, text: 'Впиши одно слово — как в бланке ЕГЭ.' });
    host.appendChild(h(taskHtml(T1)));
    const fin = () => {
      host.insertAdjacentHTML('beforeend', `<div class="explain card">
        <div class="ans-big">Ответ: <b>однако</b> <span class="muted small">(или «но»)</span></div>
        ${textHtml(T1, 'Однако')}
        <p>Предложение (2) рассказывает, какими библиотеки были <b>раньше</b>, а (3) — что <b>всё изменилось</b>. Это противопоставление, поэтому нужен противительный союз: <b>однако</b> или <b>но</b>.</p>
        <p class="star-note">* В ответ на ЕГЭ записывают одно слово без пробелов и знаков. Если подходят несколько слов, засчитывается любое из них.</p>
      </div>`);
      api.foot({ label: 'Дальше' });
    };
    answerBox(host, api, T1, { onDone: fin });
  });

  // 8. Испытание: вступление
  slides.push((body, api) => {
    body.appendChild(h(`<div class="slide intro">
      <div class="hero"><div class="hero-num boss">⚔️</div></div>
      <div class="step-chip gold">Испытание</div>
      <h2>Теперь сам!</h2>
      <p class="lead">Два новых текста. Подсказок по шагам больше не будет — действуй по алгоритму. Ответ проверяется сразу, попытка одна.</p>
      <div class="mission card">
        <div class="mission-row"><span>🎯</span><div>Верный ответ — 40 XP и 20 ${coin}</div></div>
        <div class="mission-row"><span>📜</span><div>Схема и шпаргалка — кнопка 📜 вверху</div></div>
      </div>
    </div>`));
    api.foot({ label: 'Принять вызов' });
  });

  // 9–10. Самостоятельные тексты
  [T2, T3].forEach((T, k) => slides.push((body, api) => {
    const host = shell(body, { chip: `Испытание · текст ${k + 1} из 2`, title: 'Подбери слово' });
    host.appendChild(h(taskHtml(T)));
    host.insertAdjacentHTML('beforeend', textHtml(T));
    answerBox(host, api, T, {
      xp: 40, coins: 20, oneShot: true,
      onDone: (ok) => {
        if (!ok) api.ctx.errors += 2;
        api.ctx.data['t' + k] = ok;
        host.insertAdjacentHTML('beforeend', `<div class="explain card">
          <div class="ans-big">Ответ: <b>${T.accept[0]}</b>${T.accept.length > 1 ? ` <span class="muted small">(или «${T.accept.slice(1).join('», «')}»)</span>` : ''}</div>
          ${textHtml(T, T.shown[0].toUpperCase() + T.shown.slice(1))}
          <p>${T.explain}</p>
        </div>`);
        host.querySelector('.explain').scrollIntoView({ behavior: 'smooth', block: 'start' });
        api.foot({ label: 'Дальше' });
      },
    });
  }));

  // 11. Финал
  slides.push((body, api) => {
    const e = api.ctx.errors;
    const stars = e <= 1 ? 3 : e <= 4 ? 2 : 1;
    const r = api.finish(stars);
    body.appendChild(h(`<div class="slide intro final">
      <div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= stars ? 'on' : ''}" style="animation-delay:${i * 0.25}s">★</span>`).join('')}</div>
      <h2>${r.first ? 'Задание 1 пройдено!' : 'Отличная тренировка!'}</h2>
      <p class="lead">${r.first ? 'Первый ключ 🗝️ от ворот Замка Грамотности у тебя. Дорога ведёт дальше!' : 'Повторение — мать учения. Навык закреплён 💪'}</p>
      <div class="loot">
        <div><b>+${api.ctx.xp}</b><span>XP</span></div>
        <div><b>+${api.ctx.coins}</b><span>${coin}</span></div>
        <div><b>${e}</b><span>ошибок</span></div>
      </div>
      <div class="card tip-card">🏙️ Загляни в <b>город</b> — монет уже может хватить на первое здание!</div>
    </div>`));
    api.confetti(180);
    api.sound('level');
    api.foot({ label: 'На карту пути', onClick: () => api.close(), extraLabel: '🏙️ В город', onExtra: () => { api.close(); document.querySelector('.tabbar [data-tab="city"]').click(); } });
  });

  App.LESSONS[1] = { slides, algoImg: ALGO_HTML };
})();

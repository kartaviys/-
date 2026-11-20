// Сквозная проверка без интернета: поддельный сайт вакансий + поддельная нейросеть (OpenAI-совместимая).
// Запуск: HH_HEADLESS=1 node test/run.js
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { Store } = require('../src/store');
const { Agent } = require('../src/agent');
const { Llm } = require('../src/llm');
const T = require('../src/text');

// ---------- фильтры ----------
const st0 = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'hh-')));
const inc = T.list(st0.get('title_include')), exc = T.list(st0.get('title_exclude'));
for (const t of ['Senior Data Scientist', 'ML-инженер', 'NLP Engineer', 'Аналитик данных', 'Lead Data Scientist', 'ML Engineer (backend)'])
  assert.ok(T.titleOk(t, inc, exc), 'должно пройти: ' + t);
for (const t of ['Data Engineer', 'Инженер данных', 'BI-аналитик', 'Бизнес-аналитик', 'Junior Data Scientist', 'Retail аналитик', 'HTML-верстальщик'])
  assert.ok(!T.titleOk(t, inc, exc), 'должно отсеяться: ' + t);
assert.equal(T.detectLanguage('Ищем Senior Data Scientist в команду ML, Python, SQL'), 'ru');
assert.equal(T.detectLanguage('We are looking for a Senior ML Engineer to build models'), 'en');
console.log('✓ фильтры и язык');

// ---------- поддельная нейросеть ----------
const llmServer = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const body = JSON.parse(b); const sys = body.messages[0].content; const user = body.messages[1].content;
    let content;
    if (sys.includes('стоит ли откликаться')) content = JSON.stringify({ fit: !/Data Engineer/i.test(user.slice(user.indexOf('ВАКАНСИЯ:'))), reason: 'тест' });
    else if (sys.includes('сопроводительные письма') || sys.includes('cover letters')) content = 'Здравствуйте! Тестовое письмо. Иван';
    else if (sys.includes('управляет браузером')) {
      const snap = JSON.parse(user.slice(user.indexOf('СНИМОК СТРАНИЦЫ:') + 16).split('\n\nОтветь только JSON')[0]);
      const find = re => snap.elements.find(e => re.test(e.text || ''));
      if (/Отклик отправлен/.test(snap.text)) content = JSON.stringify({ action: 'done', why: 'готово' });
      else if (snap.elements.find(e => e.tag === 'textarea' && !e.value)) content = JSON.stringify({ action: 'type', id: snap.elements.find(e => e.tag === 'textarea').id, text: '{{LETTER}}', why: 'письмо' });
      else if (find(/Отправить/)) content = JSON.stringify({ action: 'click', id: find(/Отправить/).id, why: 'отправка' });
      else if (find(/Откликнуться/)) content = JSON.stringify({ action: 'click', id: find(/Откликнуться/).id, why: 'отклик' });
      else content = JSON.stringify({ action: 'fail', why: 'нет кнопки' });
    } else content = '{}';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
  });
});

// ---------- поддельный сайт вакансий ----------
const VAC = { 101: 'Senior Data Scientist', 102: 'Data Engineer', 103: 'ML Engineer', 104: 'Junior Data Scientist' };
const siteServer = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  if (u.pathname === '/search') {
    if (u.searchParams.get('page') && u.searchParams.get('page') !== '1') return res.end('<p>пусто</p>');
    return res.end(Object.entries(VAC).map(([id, t]) => `<li><a href="/vacancy/${id}">${t}</a></li>`).join('') + '<li><a href="/vacancy/105">ML-инженер</a> <span>Вы откликнулись</span></li>');
  }
  const m = u.pathname.match(/^\/vacancy\/(\d+)/);
  if (m && u.searchParams.get('sent')) return res.end('<h1>Отклик отправлен</h1>');
  if (m) return res.end(`<h1>${VAC[m[1]] || 'Вакансия'}</h1><p>Описание: Python, ML, модели.</p>
    <button onclick="document.getElementById('f').style.display='block'">Откликнуться</button>
    <form id="f" style="display:none" action="/vacancy/${m[1]}"><textarea name="letter"></textarea><input type="hidden" name="sent" value="1"><button>Отправить</button></form>`);
  res.end('');
});

(async () => {
  await new Promise(r => llmServer.listen(0, r)); await new Promise(r => siteServer.listen(0, r));
  const site = `http://127.0.0.1:${siteServer.address().port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-'));
  const store = new Store(dir);
  store.setMany({ custom_base_url: `http://127.0.0.1:${llmServer.address().port}/v1`, custom_model: 'fake', providers: 'custom',
    delay_min: '0', delay_max: '0', ru_resume_text: 'Опыт: 5 лет DS', name: 'Иван' });
  const agentJs = fs.existsSync(path.join(__dirname, '..', 'assets', 'agent.js'))
    ? path.join(__dirname, '..', 'assets', 'agent.js') : path.join(__dirname, '..', '..', 'android', 'app', 'src', 'main', 'assets', 'agent.js');
  const agent = new Agent(store, { dataDir: dir, agentJsPath: agentJs, notify: (t, b) => console.log('  🔔', t, b) });
  agent.pause = async () => {}; // без пауз в тесте
  agent.llm = new Llm(store);
  Object.assign(agent.state, { running: true, done: 0, limit: 10 });
  const def = { key: 'testsite', name: 'Тест-сайт', paged: true, search: (q, p) => `${site}/search?q=${encodeURIComponent(q)}&page=${p + 1}`, link: '127\\.0\\.0\\.1:\\d+/vacancy/(\\d+)' };
  require('../src/sites').SITES.push({ ...def, group: 'test' });
  store.set('q_testsite', 'data scientist');
  await agent.ensureBrowser();
  await agent.runSite(def);
  console.log(store.logLines.slice(-40).join('\n'));
  const a = store.apps;
  assert.equal(a['testsite:101']?.status, 'applied', 'Senior DS — отклик');
  assert.equal(a['testsite:103']?.status, 'applied', 'ML Engineer — отклик');
  assert.ok(!a['testsite:102'] || a['testsite:102'].status === 'skipped', 'Data Engineer — не откликаемся');
  assert.ok(!a['testsite:104'], 'Junior — отсеян по названию, не открывался');
  assert.equal(a['testsite:105']?.error, 'откликались ранее', 'уже откликнутая — запомнена, не открывалась');
  assert.ok(a['testsite:101'].letter.includes('Тестовое письмо'), 'письмо сохранено');
  console.log('✓ агент сайта: откликнулся на 2 подходящие, Data Engineer и Junior отсеяны, повтор пропущен');
  console.log('  журнал:', Object.values(a).map(x => `${x.id}=${x.status}`).join(', '));
  console.log("  по дням:", JSON.stringify(store.daily(1)));
  console.log('  расходы:', JSON.stringify(store.dayTotal()));
  await agent.ctx.close(); llmServer.close(); siteServer.close();
  console.log('ВСЕ ТЕСТЫ ПРОШЛИ');
  process.exit(0);
})().catch(e => { console.error('ТЕСТ УПАЛ:', e); process.exit(1); });

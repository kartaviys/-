// Ядро агента для компьютера: управляет настоящим Chrome/Edge через Playwright.
// Логика — та же, что в Android (BrowserAgent.kt + AgentEngine.kt): поиск → фильтр названий → «подходит ли» →
// письмо → отклик; капча/вход — человеку; уже откликнутые вакансии не трогаем.
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
let pw; try { pw = require('playwright-core'); } catch { pw = require('playwright'); }
const T = require('./text');
const { Llm, StopSessionError } = require('./llm');
const { writeLetter, assess } = require('./letters');
const S = require('./sites');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = n => Math.floor(Math.random() * n);
const q = s => JSON.stringify(String(s));
const SUBMIT = /^\s*(отправить|откликнуться|подтвердить|submit|apply|send|finish|отправить отклик)/i;

class Agent extends EventEmitter {
  constructor(store, { dataDir, agentJsPath, notify }) {
    super();
    this.store = store;
    this.dataDir = dataDir;
    this.agentJs = fs.readFileSync(agentJsPath, 'utf8');
    this.notify = notify || (() => {});
    this.state = { status: 'Агент не запущен', running: false, target: '', prompt: null, done: 0, limit: 0 };
    this.ctx = null; this.page = null;
    this._answer = null; this._stop = false;
  }

  // ---------- состояние ----------
  setStatus(s) { this.state.status = s; this.emit('change'); }
  log(s) { this.store.log(s); this.emit('change'); }
  checkStop() { if (this._stop) throw new StopSessionError('Остановлено'); }
  async wait(ms) { const end = Date.now() + ms; while (Date.now() < end) { this.checkStop(); await sleep(Math.min(500, end - Date.now())); } }

  // ---------- браузер ----------
  async ensureBrowser() {
    if (this.ctx) { try { if (this.page && !this.page.isClosed()) return; } catch {} }
    const profile = path.join(this.dataDir, 'browser-profile');
    const want = this.store.get('browser_channel');
    const custom = this.store.get('browser_path');
    const tries = process.env.HH_HEADLESS ? [{ headless: true }] : custom ? [{ executablePath: custom }] :
      want && want !== 'auto' ? [{ channel: want }] :
      process.platform === 'win32' ? [{ channel: 'msedge' }, { channel: 'chrome' }] : [{ channel: 'chrome' }, { channel: 'msedge' }, {}];
    let lastErr = null;
    for (const t of tries) {
      try {
        this.ctx = await pw.chromium.launchPersistentContext(profile, { headless: false, viewport: null, locale: 'ru-RU', args: ['--start-maximized'], ...t });
        break;
      } catch (e) { lastErr = e; }
    }
    if (!this.ctx) throw new Error('Не удалось запустить браузер: установите Google Chrome (или укажите путь в настройках). ' + (lastErr?.message || '').slice(0, 200));
    this.ctx.on('close', () => { this.ctx = null; this.page = null; });
    this.page = this.ctx.pages()[0] || await this.ctx.newPage();
    this.ctx.on('page', p => { this.page = p; this._hookPage(p); });
    this._hookPage(this.page);
  }

  _hookPage(p) {
    // Поле загрузки файла: подставляем PDF резюме нужного языка
    p.on('filechooser', async fc => {
      const f = [path.join(this.dataDir, `resume_${this.resumeLang || 'ru'}.pdf`), path.join(this.dataDir, 'resume_ru.pdf')].find(x => fs.existsSync(x));
      if (f) await fc.setFiles(f).catch(() => {});
    });
  }

  async js(expr) {
    try { await this.page.evaluate(this.agentJs); return await this.page.evaluate(expr); }
    catch { return ''; }
  }

  async load(url) {
    await this.ensureBrowser();
    try { await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
    await this.wait(1800 + rnd(1200));
  }

  /** Открыть страницу и пройти антибот-проверку. */
  async open(url) { await this.load(url); return this.passBlockers(); }

  async passBlockers() {
    for (let i = 0; i < 6; i++) {
      const b = await this.js('window.__ag.blocker()');
      if (b === 'auto') { this.setStatus('Сайт проверяет браузер, жду…'); await this.wait(4000); continue; }
      if (b !== 'human') return true;
      this.log('  капча — жду человека');
      // ждём кнопку или пока капча исчезнет сама
      let solved = false;
      const asked = this.ask('human', 'Капча: решите её в окне браузера — агент продолжит сам, как только она исчезнет');
      const poll = (async () => { while (!solved && this._answer) { await sleep(3000); if (!solved && await this.js('window.__ag.blocker()') === '') { solved = true; this.answer(true); } } })();
      const r = await asked;
      solved = true; await poll.catch(() => {});
      return r;
    }
    return this.ask('human', 'Сайт долго проверяет браузер. Если видите капчу — решите её и нажмите «Готово»');
  }

  // ---------- вопросы к человеку ----------
  ask(type, text) {
    this.state.prompt = { type, text };
    this.emit('change');
    this.log('  ✋ ' + text);
    // статистика: просьбы о помощи по ресурсу (текущая вакансия или работающий агент)
    const CH = { hh: 'hh_site', habr: 'habr_agent', linkedin: 'linkedin_agent' };
    const channel = this._curChannel || CH[this.state.target] || this.state.target || 'single';
    const kind = type === 'confirm' ? 'confirm' : /капч|captcha|провер\S* браузер|робот/i.test(text) ? 'captcha' : /войдите|вход|логин|sign in|log in/i.test(text) ? 'login' : 'other';
    this.store.addHelp(channel, kind);
    this.notify(type === 'confirm' ? 'Подтвердите отправку' : 'Агенту нужна помощь', text);
    try { this.page?.bringToFront(); } catch {}
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.log('  нет ответа 15 минут — пропуск'); this.store.addHelp(channel, 'missed'); finish(false); }, 15 * 60000);
      const finish = v => { clearTimeout(timer); if (this._answer === finish) { this._answer = null; this.state.prompt = null; this.emit('change'); } resolve(v); };
      this._answer = finish;
    });
  }
  answer(v) { if (this._answer) this._answer(!!v); }

  async screenshot() { try { return await this.page.screenshot({ type: 'jpeg', quality: 60 }); } catch { return null; } }

  async login(url) { await this.ensureBrowser(); try { await this.page.goto(url, { waitUntil: 'domcontentloaded' }); await this.page.bringToFront(); } catch {} }

  // ---------- универсальный агент: снимок → решение модели → действие ----------
  systemPrompt(resumeTitle) {
    const salary = this.store.get('salary_answer');
    const facts = this.store.get('candidate_facts');
    return `Ты — агент, который управляет браузером, чтобы откликнуться на вакансию от лица кандидата.
Каждый шаг тебе дают: цель, профиль кандидата, письмо, историю твоих действий и снимок страницы
(список интерактивных элементов с id, у некоторых есть data-qa в поле qa, и видимый текст).
Выбери ОДНО следующее действие и верни JSON:
{"action": "click"|"type"|"select"|"scroll"|"back"|"wait"|"done"|"human"|"fail", "id": "e12", "text": "...", "why": "кратко, по-русски"}
Правила:
- Цель — отправить отклик именно на эту вакансию: нажать «Откликнуться»/«Apply», выбрать резюме «${resumeTitle}»
  (если предлагают выбор), вставить сопроводительное письмо, ответить на вопросы анкеты и отправить.
- Чтобы вставить письмо целиком, используй type с text "{{LETTER}}" — оно подставится само.
- Ответы на вопросы анкеты — только факты из резюме и профиля, коротко, от первого лица.
- Любой вопрос о зарплате или ожиданиях по доходу: строго "${salary}".
- Всегда помни о кандидате (используй в ответах на вопросы анкеты): ${facts}
  Вопрос про военный билет / воинский учёт — ответ «да, военный билет есть». Вопрос про формат работы (офис, гибрид,
  удалёнка, график) — кандидат готов к любому формату; выбирай вариант, который предлагает работодатель, или «любой».
- Поле загрузки резюме/CV (input type=file): действие click по нему — файл прикрепится автоматически.
- Вход/регистрация, капча, код из SMS/почты, оплата, паспорт, номер карты — action "human" с объяснением.
- Видимость резюме у кандидата уже «Видно всем работодателям» — подсказки и предупреждения о видимости резюме
  игнорируй и не проси человека её менять: просто продолжай отклик («Откликнуться» / «Отправить»).
  Если hh пишет, что видимость нужно сменить, — значит выбрано не то резюме: выбери резюме «${resumeTitle}» и продолжай.
- Не нажимай рекламу, другие вакансии, «В избранное», соцсети, «Скачать приложение».
- Видишь подтверждение («Отклик отправлен», «Резюме доставлено», «Вы откликнулись», «Application submitted»,
  «Thank you for applying») — "done".
- Вакансия в архиве/закрыта или откликнуться невозможно — "fail".
- Нужного элемента нет на экране — "scroll" с text "down" или "up".
- Не повторяй одно и то же действие больше двух раз подряд: если не помогает — "human".`;
  }

  async runGoal(g, confirmSubmit, guard = null) {
    const st = this.store;
    const resume = (g.lang === 'en' ? st.get('en_resume_text') : st.get('ru_resume_text')) || st.get('ru_resume_text');
    const resumeTitle = st.get(g.lang === 'en' ? 'en_title' : 'ru_title');
    const profile = JSON.stringify(Object.fromEntries(['name', 'name_en', 'email', 'phone', 'city', 'telegram', 'linkedin', 'github'].map(k => [k, st.get(k)])));
    const history = []; let lastKey = ''; let repeats = 0;
    const maxSteps = Math.min(40, Math.max(5, st.int('agent_max_steps')));
    for (let step = 1; step <= maxSteps; step++) {
      this.checkStop();
      if (!await this.passBlockers()) return 'skipped';
      if (step > 1 && guard) { const r = await guard(); if (r) return r; }
      await this.js(`window.__ag.fillSalary(${q(st.get('salary_answer'))})`);
      let snap; try { snap = JSON.parse(await this.js('window.__ag.snapshot()')); } catch { await this.wait(2000); continue; }
      const user = `ЦЕЛЬ: откликнуться на вакансию «${g.title}»${g.employer ? ' — ' + g.employer : ''}\n\nПРОФИЛЬ КАНДИДАТА: ${profile}\n\n` +
        `СОПРОВОДИТЕЛЬНОЕ ПИСЬМО (начало): ${g.letter.slice(0, 600)}\n\nРЕЗЮМЕ (кратко): ${String(resume).slice(0, 3000)}\n\n` +
        `ИСТОРИЯ ДЕЙСТВИЙ:\n${history.slice(-8).join('\n') || '(пока ничего)'}\n\nСНИМОК СТРАНИЦЫ:\n${JSON.stringify(snap)}`;
      let d;
      try { d = await this.llm.completeJson(this.systemPrompt(resumeTitle), user, 1500); }
      catch (e) { if (e instanceof StopSessionError) throw e; this.setStatus('Нейросеть не ответила: ' + e.message); return 'failed'; }
      const el = (snap.elements || []).find(x => x.id === d.id);
      const desc = el ? (el.text || el.qa || '').slice(0, 50) : '';
      this.setStatus(`Шаг ${step}: ${d.action} ${desc} — ${d.why || ''}`);
      this.log(`  агент: ${d.action} ${desc} — ${d.why || ''}`);
      const key = `${d.action}|${d.id}|${d.text}`;
      repeats = key === lastKey ? repeats + 1 : 0; lastKey = key;
      if (repeats >= 2) return (await this.ask('human', 'Агент топчется на месте: ' + (d.why || ''))) ? 'applied' : 'skipped';
      let result = '';
      switch (d.action) {
        case 'done': return 'applied';
        case 'fail': this.log('  агент: отклик невозможен — ' + (d.why || '')); return 'failed';
        case 'human': return (await this.ask('human', d.why || 'Нужна ваша помощь')) ? 'applied' : 'skipped';
        case 'click':
          if (confirmSubmit && SUBMIT.test(el?.text || '')) {
            if (!await this.ask('confirm', `Агент хочет нажать «${desc}» и отправить отклик на «${g.title}». Отправить?`)) return 'skipped';
          }
          result = await this.js(`window.__ag.click(${q(d.id)})`); break;
        case 'type': {
          const label = `${el?.text || ''} ${el?.name || ''}`;
          if (T.FORBIDDEN.test(label)) return (await this.ask('human', `Поле «${label.trim()}» агент не заполняет — введите сами`)) ? 'applied' : 'skipped';
          const v = T.SALARY.test(label) ? st.get('salary_answer') : String(d.text || '').replace('{{LETTER}}', g.letter);
          result = await this.js(`window.__ag.type(${q(d.id)}, ${q(v)})`); break;
        }
        case 'select': result = await this.js(`window.__ag.select(${q(d.id)}, ${q(d.text)})`); break;
        case 'scroll': result = await this.js(`window.__ag.scroll(${q(d.text)})`); break;
        case 'back': try { await this.page.goBack(); result = 'ok'; } catch { result = 'no'; } break;
        case 'wait': await this.wait(2500); result = 'ok'; break;
        default: result = 'unknown';
      }
      history.push(`${step}. ${d.action} ${desc}${d.action === 'type' ? ` = «${String(d.text).slice(0, 40)}»` : ''} → ${result}`);
      await this.wait(1200 + rnd(1500));
    }
    return (await this.ask('human', `Агент не справился за ${maxSteps} шагов`)) ? 'applied' : 'skipped';
  }

  // ---------- общие шаги сессий ----------
  async fits(id, title, employer, url, desc, channel) {
    this.setStatus(`Проверяю, подходит ли «${title}»…`);
    const r = await assess(this.llm, this.store, title, desc);
    this.store.addFunnel(channel, r.fit ? 'relevant' : 'llmRej');
    if (!r.fit) { this.store.record(id, { title, employer, url, status: 'skipped', channel, error: 'не подходит: ' + r.reason }); this.log(`  ✗ ${title} — не подходит: ${r.reason}`); }
    return r.fit;
  }
  async letter(title, employer, desc, lang) {
    this.setStatus(`Пишу письмо — «${title}»`);
    try { return await writeLetter(this.llm, this.store, { title, employer, description: desc, lang }); }
    catch (e) { if (e instanceof StopSessionError) throw e; this.log('  ! письмо не сгенерировано: ' + e.message); return null; }
  }
  confirmFor(key) { return key === 'linkedin' ? this.store.bool('linkedin_confirm') : this.store.bool('agent_confirm'); }
  async pause(linkedin = false) {
    const lo = linkedin ? Math.max(30, this.store.int('linkedin_delay_min')) : Math.max(15, this.store.int('delay_min'));
    const hi = Math.max(lo, this.store.int(linkedin ? 'linkedin_delay_max' : 'delay_max'));
    const sec = lo + rnd(hi - lo + 1);
    this.setStatus(`Пауза ${sec} с, чтобы не выглядеть как бот…`);
    await this.wait(sec * 1000);
  }
  capReached(def, done, limit, channel, dailyCap) {
    if (done >= limit) return true;
    const n = channel ? this.store.appliedTodayIn(channel) : this.store.appliedToday();
    if (n >= dailyCap) { this.log(`${def.name}: дневной лимит (${dailyCap}) достигнут`); return true; }
    return false;
  }

  /** Обработать одну найденную вакансию: открыть → проверить → письмо → отклик. Возвращает true, если отклик отправлен. */
  /** Одна вакансия + мониторинг скорости: время от открытия до результата пишется по ресурсу (channel). */
  async processVacancy(v) {
    const t0 = Date.now();
    let ok = false;
    this._curChannel = v.channel;
    try { ok = await this._processVacancy(v); return ok; } finally {
      this._curChannel = null;
      const ms = Date.now() - t0;
      this.store.addTiming(v.channel, ms, ok);
      if (ok) this.log(`  ⏱ отклик за ${T.dur(ms)}`);
    }
  }

  async _processVacancy({ id, title, url, channel, open, applied, apply, employer0 = '' }) {
    const st = this.store;
    this.setStatus(`«${title}» (откликов ${this.state.done} из ${this.state.limit})`);
    const info = await open();
    if (!info) { st.record(id, { title, url, status: 'manual', channel, error: 'не открылась' }); return false; }
    if (info.archived) { st.record(id, { title, url, status: 'skipped', channel, error: 'в архиве' }); return false; }
    if (await applied()) { st.markAppliedElsewhere(id, title, url, channel); return false; }
    const employer = info.employer || employer0;
    const desc = info.desc || '';
    if (T.isCvHeavy(desc)) { st.record(id, { title, employer, url, status: 'skipped', channel, error: 'computer vision' }); return false; }
    if (!await this.fits(id, title, employer, url, desc, channel)) return false;
    const lang = T.detectLanguage(`${title} ${desc}`); this.resumeLang = lang;
    const letter = await this.letter(title, employer, desc, lang);
    if (!letter) return false;
    const { status, note } = await apply({ title, employer, letter, lang });
    st.record(id, { title, employer, url, language: lang, status, channel, letter, error: note || '' });
    this.log(`• [${channel}] [${lang}] ${title} — ${employer} → ${status}${note ? ' (' + note + ')' : ''}`);
    return status === 'applied' && !note;
  }

  /** Обход: запросы × страницы; на каждой странице сразу откликаемся. */
  /**
   * Обход выдачи. Каждый запрос (или переданный поток `streams`) листается по страницам.
   * batch — сколько новых вакансий взять подряд из одного потока, прежде чем перейти к следующему (по кругу);
   * без batch потоки идут по очереди до конца.
   */
  async walk({ def, queries, streams, maxPages, channel, dailyCap, fetchPage, toCandidate, linkedin = false, batch = Infinity }) {
    const include = T.list(this.store.get('title_include')); const exclude = T.list(this.store.get('title_exclude'));
    const list = (streams || queries.map(query => ({ label: query ? '«' + query + '»' : 'лента', fetch: p => fetchPage(query, p) })))
      .map(x => ({ ...x, page: 0, finished: false, buf: [], seen: new Set() }));
    const handled = new Set();
    let aborted = false;
    const refill = async s => {
      while (!s.buf.length && !s.finished && !aborted) {
        this.checkStop();
        if (s.page >= maxPages) { s.finished = true; break; }
        const items = await s.fetch(s.page);
        if (items === null) { aborted = true; break; }
        if (!items.length || items.filter(i => !s.seen.has(i.id) && s.seen.add(i.id)).length === 0) { s.finished = true; break; }
        const cands = items.map(i => toCandidate(i));
        cands.filter(c => c.applied).forEach(c => this.store.markAppliedElsewhere(c.dbId, c.title, c.url, channel));
        const fresh = cands.filter(c => !c.applied && !handled.has(c.dbId) && !this.store.seen(c.dbId) &&
          (!c.title || T.titleOk(c.title, c.useInclude === false ? [] : include, exclude)));
        this.store.listing(channel, cands.filter(c => !c.applied && !this.store.seen(c.dbId)).map(c => [c.dbId, fresh.includes(c)]));
        this.log(`${def.name} ${s.label}, стр. ${s.page + 1}: вакансий ${items.length}, новых подходящих ${fresh.length}`);
        s.buf.push(...fresh);
        s.page++;
      }
    };
    while (!aborted && list.some(s => !s.finished || s.buf.length)) {
      for (const s of list) {
        let n = 0;
        while (n < batch) {
          this.checkStop();
          if (this.capReached(def, this.state.done, this.state.limit, channel, dailyCap)) return;
          await refill(s);
          if (aborted) return;
          const c = s.buf.shift();
          if (!c) break;
          if (handled.has(c.dbId) || this.store.seen(c.dbId)) continue;
          handled.add(c.dbId); n++;
          const ok = await this.processVacancy({ id: c.dbId, title: c.title, url: c.url, channel, open: c.open, applied: c.isApplied, apply: c.apply, employer0: c.employer });
          if (ok) { this.state.done++; await this.pause(linkedin); }
        }
        if (n > 0 && batch !== Infinity && list.length > 1) this.log(`${def.name} ${s.label}: просмотрено ${n} — следующий запрос`);
      }
    }
  }

  // ---------- hh.ru ----------
  async hhEnsureLogin() {
    if (!await this.open('https://hh.ru/applicant/resumes')) return false;
    if (/login|\/account\//.test(this.page.url())) {
      if (!await this.ask('human', 'Войдите в свой аккаунт hh.ru в окне браузера, затем нажмите «Готово»')) return false;
      if (!await this.open('https://hh.ru/applicant/resumes')) return false;
    }
    // импорт резюме из профиля: хэши (для рекомендаций), названия и тексты
    let list = []; try { list = JSON.parse(await this.js('window.__ag.hhResumes()')); } catch {}
    if (list.length) this.store.set('hh_resume_hashes', list.map(r => r.id).join(','));
    const need = ['ru_resume_text', 'en_resume_text', 'ru_title', 'en_title'].some(k => !this.store.get(k));
    if (need) {
      for (const r of list.slice(0, 4)) {
        if (!await this.open(`https://hh.ru/resume/${r.id}`)) continue;
        const text = await this.js('window.__ag.bodyText()');
        const lang = T.detectLanguage(text);
        if (!this.store.get(`${lang}_title`)) this.store.set(`${lang}_title`, r.title);
        if (!this.store.get(`${lang}_resume_text`)) this.store.set(`${lang}_resume_text`, text);
        this.log(`hh: резюме «${r.title}» (${lang}) импортировано`);
      }
    }
    return true;
  }

  hhUrl(query, page, resumeHash) {
    if (resumeHash) return `https://hh.ru/search/vacancy?resume=${resumeHash}&order_by=publication_time&items_on_page=50&page=${page}`;
    return `https://hh.ru/search/vacancy?text=${encodeURIComponent(query)}&search_field=name&order_by=publication_time&items_on_page=50&page=${page}`;
  }

  async hhApply(g) {
    const has = async sel => (await this.js(`window.__ag.has(${q(sel)})`)) === true;
    const confirm = this.confirmFor('hh');
    const clicked = await this.js(`window.__ag.clickSel('[data-qa="vacancy-response-link-top"], [data-qa="vacancy-response-link-bottom"]')`);
    if (clicked !== 'ok') return { status: await this.runGoal(g, confirm) };
    await this.wait(2500);
    if (!await this.passBlockers()) return { status: 'skipped' };
    if (await has('[data-qa="relocation-warning-confirm"]')) { await this.js(`window.__ag.clickSel('[data-qa="relocation-warning-confirm"]')`); await this.wait(2000); }
    if (this.page.url().includes('vacancy_response')) return { status: await this.runGoal(g, confirm) };
    await this.js(`window.__ag.pickResume(${q(this.store.get(g.lang === 'en' ? 'en_title' : 'ru_title'))})`);
    if (await has('[data-qa="vacancy-response-letter-toggle"]')) { await this.js(`window.__ag.clickSel('[data-qa="vacancy-response-letter-toggle"]')`); await this.wait(800); }
    if (await this.js(`window.__ag.fillSel('[data-qa="vacancy-response-popup-form-letter-input"]', ${q(g.letter)})`) !== 'ok') return { status: await this.runGoal(g, confirm) };
    await this.js(`window.__ag.fillSalary(${q(this.store.get('salary_answer'))})`);
    if (confirm && !await this.ask('confirm', `Отправить отклик на «${g.title}»?`)) return { status: 'skipped' };
    if (await this.js(`window.__ag.clickSel('[data-qa="vacancy-response-submit-popup"]')`) !== 'ok') return { status: await this.runGoal(g, confirm) };
    await this.wait(3000);
    if (!await this.passBlockers()) return { status: 'skipped' };
    if (await this.js(`window.__ag.fillSel('[data-qa="vacancy-response-letter-input"]', ${q(g.letter)})`) === 'ok') {
      await this.js(`window.__ag.clickSel('[data-qa="vacancy-response-letter-submit"]')`); await this.wait(2000);
    }
    if (this.page.url().includes('vacancy_response')) return { status: await this.runGoal(g, confirm) };
    return { status: await this.hhApplied() ? 'applied' : await this.runGoal(g, confirm) };
  }
  async hhApplied() {
    if (await this.js(`window.__ag.has('[data-qa="vacancy-response-link-view-topic"]')`) === true) return true;
    return /Резюме доставлено|Отклик отправлен|Вы откликнулись/i.test(await this.js('window.__ag.bodyText()'));
  }

  async runHh() {
    const def = S.agentDef('hh');
    if (!await this.hhEnsureLogin()) { this.log('hh: вход не выполнен'); return; }
    const maxPages = Math.min(40, Math.max(1, this.store.int('max_pages')));
    const common = {
      def, maxPages, channel: 'hh_site', dailyCap: this.store.int('daily_limit'),
      toCandidate: v => ({
        dbId: v.id, title: v.title, url: `https://hh.ru/vacancy/${v.id}`, applied: v.applied, useInclude: v.useInclude,
        open: async () => {
          if (!await this.open(`https://hh.ru/vacancy/${v.id}`)) return null;
          const body = await this.js('window.__ag.bodyText()');
          return { employer: await this.js(`window.__ag.textOf('[data-qa="vacancy-company-name"]')`),
            desc: (await this.js(`window.__ag.textOf('[data-qa="vacancy-description"]')`)) || body,
            archived: /Вакансия в архиве|vacancy is archived/i.test(body) };
        },
        isApplied: () => this.hhApplied(),
        apply: g => this.hhApply(g),
      }),
    };
    const fetchFrom = (url, useInclude) => async () => {
      this.setStatus('hh: ' + url.slice(0, 80));
      if (!await this.open(url)) return null;
      let arr = []; try { arr = JSON.parse(await this.js('window.__ag.hhLinks()')); } catch {}
      return arr.map(a => ({ ...a, useInclude }));
    };
    // Рекомендации hh под каждое резюме и ваш список «Что искать» — по кругу, по hh_batch (30) вакансий на каждый.
    // (hh уже ищет по названию — для запросов без доп. фильтра «содержит»)
    const streams = [
      ...T.list(this.store.get('hh_resume_hashes')).map(hash => ({ label: 'рекомендации', fetch: p => fetchFrom(this.hhUrl('', p, hash), true)() })),
      ...S.queries(this.store, def).map(qq => ({ label: '«' + qq + '»', fetch: p => fetchFrom(this.hhUrl(qq, p), false)() })),
    ];
    await this.walk({ ...common, streams, batch: Math.max(1, this.store.int('hh_batch')) });
  }

  // ---------- Хабр Карьера ----------
  async runHabr() {
    const def = S.agentDef('habr');
    if (!await this.open('https://career.habr.com/')) return;
    if (await this.js('window.__ag.habrLoggedIn()') !== 'true') {
      if (!await this.ask('human', 'Войдите в Хабр Карьеру в окне браузера (кнопка «Войти»), затем нажмите «Готово»')) return;
    }
    const include = T.list(this.store.get('title_include'));
    const norm = s => s.toLowerCase().replace(/-/g, ' ').replace(/ё/g, 'е');
    const totalPages = {};
    await this.walk({
      def, queries: S.queries(this.store, def), maxPages: Math.min(40, Math.max(1, this.store.int('max_pages'))),
      channel: 'habr_agent', dailyCap: this.store.int('habr_daily_limit'),
      fetchPage: async (query, page) => {
        if (totalPages[query] !== undefined && page >= totalPages[query]) return [];
        this.setStatus(`Хабр: ищу «${query}», стр. ${page + 1}`);
        try {
          const r = await fetch(`https://career.habr.com/api/frontend/vacancies?q=${encodeURIComponent(query)}&sort=date&per_page=50&page=${page + 1}`);
          const d = await r.json();
          totalPages[query] = d.meta?.totalPages || 1;
          return (d.list || []).filter(v => !v.externalLink).filter(v => !/junior|intern/i.test(v.qualification || ''))
            .filter(v => norm(query).split(' ').filter(Boolean).every(w => norm(v.title).includes(w)) || T.titleOk(v.title, include, []))
            .map(v => ({ id: String(v.id), title: v.title, employer: v.company?.title || '', href: v.href }));
        } catch (e) { this.log('Хабр: ошибка поиска — ' + e.message); return []; }
      },
      toCandidate: v => ({
        dbId: 'habr:' + v.id, title: v.title, url: 'https://career.habr.com' + v.href, employer: v.employer, useInclude: false,
        open: async () => (await this.open('https://career.habr.com' + v.href))
          ? { desc: (await this.js(`window.__ag.textOf('.vacancy-description__text')`)) || await this.js('window.__ag.bodyText()') } : null,
        isApplied: async () => (await this.js('window.__ag.habrApplied()')) === 'true',
        apply: async g => {
          const r = await this.js('window.__ag.habrRespond()');
          if (r === 'external') return { status: 'skipped', note: 'отклик только на сайте компании' };
          if (r === 'applied') return { status: 'applied', note: 'уже откликались' };
          if (r === 'missing') return { status: 'skipped', note: 'нет кнопки «Откликнуться»' }; // иначе нейросеть уходит в старые отклики
          await this.wait(2000);
          const vacancyUrl = this.page.url().split(/[?#]/)[0];
          // Работаем только на странице вакансии: отклик появился или открылись отклики/чат — готово; ушли куда-то ещё — стоп
          const guard = async () => {
            const url = this.page.url();
            if ((await this.js('window.__ag.habrApplied()')) === 'true' || /\/responses|\/conversations|\/chats/.test(url)) return 'applied';
            if (!url.startsWith(vacancyUrl)) { this.log('  агент ушёл со страницы вакансии — стоп'); return 'skipped'; }
            return null;
          };
          return { status: await this.runGoal(g, this.confirmFor('habr'), guard) };
        },
      }),
    });
  }

  // ---------- LinkedIn ----------
  liUrl(query, page) {
    const st = this.store;
    const p = new URLSearchParams({ keywords: query, f_AL: 'true', sortBy: 'DD', f_TPR: `r${Math.min(30, Math.max(1, st.int('linkedin_days'))) * 86400}` });
    if (st.get('linkedin_location')) p.set('location', st.get('linkedin_location'));
    if (st.bool('linkedin_remote')) p.set('f_WT', '2');
    if (st.bool('linkedin_senior_only')) p.set('f_E', '4');
    if (page > 0) p.set('start', String(page * 25));
    return 'https://www.linkedin.com/jobs/search/?' + p.toString();
  }
  async runLinkedIn() {
    const def = S.agentDef('linkedin');
    if (!await this.open('https://www.linkedin.com/feed/')) return;
    if (/\/login|authwall|\/signup|uas\//.test(this.page.url())) {
      if (!await this.ask('human', 'Войдите в LinkedIn в окне браузера, затем нажмите «Готово»')) return;
    }
    const maxPages = Math.min(40, Math.max(1, this.store.int('linkedin_pages')));
    const linksFrom = async url => {
      if (!await this.open(url)) return null;
      for (let i = 0; i < 3; i++) { await this.js(`window.__ag.scroll('down')`); await this.wait(900); }
      try { return JSON.parse(await this.js('window.__ag.liLinks()')); } catch { return []; }
    };
    const candidate = requireEasy => v => ({
      dbId: 'li:' + v.id, title: v.title, url: `https://www.linkedin.com/jobs/view/${v.id}/`, applied: v.applied,
      open: async () => (await this.open(`https://www.linkedin.com/jobs/view/${v.id}/`)) ? {
        employer: await this.js(`window.__ag.textOf('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name')`),
        desc: (await this.js(`window.__ag.textOf('#job-details, .jobs-description__content')`)) || await this.js('window.__ag.bodyText()'),
      } : null,
      isApplied: async () => (await this.js('window.__ag.liApplied()')) === 'true',
      apply: async g => {
        if (await this.js('window.__ag.liEasyApply()') === 'ok') await this.wait(2500);
        else if (requireEasy) return { status: 'skipped', note: 'нет Easy Apply' };
        return { status: await this.runGoal(g, this.confirmFor('linkedin')) };
      },
    });
    const common = { def, maxPages, channel: 'linkedin_agent', dailyCap: this.store.int('linkedin_daily_limit'), linkedin: true };
    await this.walk({ ...common, queries: [''], toCandidate: candidate(true),
      fetchPage: (_q, p) => linksFrom('https://www.linkedin.com/jobs/collections/recommended/' + (p > 0 ? `?start=${p * 24}` : '')) });
    await this.walk({ ...common, queries: S.queries(this.store, def), toCandidate: candidate(false), fetchPage: (qq, p) => linksFrom(this.liUrl(qq, p)) });
  }

  // ---------- общий агент сайтов ----------
  async pickLinksWithLlm(def) {
    let all = []; try { all = JSON.parse(await this.js('window.__ag.allLinks()')); } catch {}
    if (!all.length) return [];
    const listing = all.map((o, i) => `${i}. ${o.title} — ${o.url.slice(0, 140)}`).join('\n');
    try {
      const o = await this.llm.completeJson(`Перед тобой ссылки со страницы поиска вакансий сайта ${def.name}. Выбери только ссылки, которые ведут на ` +
        'страницу ОДНОЙ конкретной вакансии (не категории, не компании, не страницы поиска/пагинации, не статьи и не вход). Ответ — JSON: {"links": [номера]}', listing, 600);
      const res = (o.links || []).map(i => all[i]).filter(Boolean).map(x => ({ id: idOf(x.url), url: x.url, title: x.title, applied: false }));
      this.log(`${def.name}: шаблон ссылок не сработал — нейросеть нашла вакансий: ${res.length}`);
      return res;
    } catch (e) { if (e instanceof StopSessionError) throw e; return []; }
  }

  async runSite(def) {
    const maxPages = def.paged ? Math.min(40, Math.max(1, this.store.int('max_pages'))) : 1;
    await this.walk({
      def, queries: def.noQuery ? [''] : S.queries(this.store, def), maxPages, channel: def.key, dailyCap: this.store.int('site_daily_limit'),
      fetchPage: async (query, page) => {
        this.setStatus(`${def.name}: ${query ? `ищу «${query}»` : 'лента вакансий'}, стр. ${page + 1}`);
        if (!await this.open(def.search(query, page))) return null;
        for (let i = 0; i < 4; i++) { await this.js(`window.__ag.scroll('down')`); await this.wait(1000); }
        let found = []; try { found = JSON.parse(await this.js(`window.__ag.siteLinks(${q(def.link)})`)); } catch {}
        found = found.map(f => ({ id: f.id || idOf(f.url), url: f.url, title: f.title, applied: f.applied }));
        return found.length ? found : this.pickLinksWithLlm(def);
      },
      toCandidate: v => ({
        dbId: `${def.key}:${v.id}`, title: v.title, url: v.url, applied: v.applied,
        open: async () => {
          if (!await this.open(v.url)) return null;
          if (!v.title) v.title = (await this.page.title()).slice(0, 150);
          return { desc: await this.js('window.__ag.bodyText()') };
        },
        isApplied: async () => (await this.js('window.__ag.pageApplied()')) === 'true',
        apply: async g => ({ status: await this.runGoal(g, this.confirmFor(def.key)) }),
      }),
    });
  }

  // ---------- запуск ----------
  async start(target) {
    if (this.state.running) throw new Error('Уже работает агент ' + (S.agentDef(this.state.target)?.name || this.state.target));
    const def = S.agentDef(target);
    if (!def) throw new Error('Неизвестный агент: ' + target);
    this.llm = new Llm(this.store);
    this._stop = false;
    Object.assign(this.state, { running: true, target, done: 0, limit: Math.max(1, S.limit(this.store, def)), prompt: null });
    this.log(`Агент ${def.name}: старт, лимит ${this.state.limit}`);
    this.emit('change');
    try {
      await this.ensureBrowser();
      if (target === 'hh') await this.runHh();
      else if (target === 'habr') await this.runHabr();
      else if (target === 'linkedin') await this.runLinkedIn();
      else await this.runSite(def);
      const msg = `Агент ${def.name} закончил: откликов ${this.state.done}.`;
      this.log(msg); this.setStatus(msg + ' Подробности — в «Журнале».'); this.notify('Агент закончил', msg);
    } catch (e) {
      const msg = e instanceof StopSessionError ? e.message : 'Ошибка: ' + e.message;
      this.log((e instanceof StopSessionError ? '⛔ ' : '') + msg); this.setStatus(msg);
      if (!(e instanceof StopSessionError && e.message === 'Остановлено')) this.notify('Агент остановлен', msg);
    } finally {
      Object.assign(this.state, { running: false, target: '', prompt: null });
      this._answer = null;
      this.emit('change');
    }
  }

  stop() { this._stop = true; this.answer(false); this.setStatus('Останавливаю…'); }
}

function idOf(url) {
  let h = 0; const s = String(url).split(/[?#]/)[0].replace(/\/+$/, '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

module.exports = { Agent };

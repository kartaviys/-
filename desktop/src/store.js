// Хранилище: настройки, журнал откликов, расходы, лог. Простые JSON-файлы в папке данных приложения.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RU_EXCLUDE = 'junior, intern, стажер, стажёр, младший, head, руководител, cv, computer vision, зрени, opencv, видеоаналит, ' +
  'изображен, data engineer, инженер данных, дата инженер, дата-инженер, big data engineer, dwh, etl, bi-, bi разработчик, ' +
  'bi developer, bi analyst, power bi, 1с, 1c, бизнес-аналитик, бизнес аналитик, системный аналитик, system analyst, ' +
  'business analyst, devops, frontend, fullstack, тестировщик, mlops';

const DEFAULTS = {
  // нейросеть
  anthropic_key: '', deepseek_key: '', providers: 'claude,deepseek,custom', strategy: 'fallback',
  claude_model: 'claude-haiku-5-5', deepseek_model: 'deepseek-chat', daily_budget: '1',
  custom_base_url: '', custom_model: '', custom_key: '', custom_name: 'своя модель', custom_timeout: '300',
  custom_price_in: '0', custom_price_out: '0',
  // что искать (у каждого агента свой список; для сайтов — q_<key>)
  queries: ['data scientist', 'ml engineer', 'ml-инженер', 'machine learning engineer', 'инженер машинного обучения',
    'специалист по машинному обучению', 'ai engineer', 'ai-инженер', 'llm engineer', 'nlp engineer', 'nlp', 'ml-разработчик',
    'разработчик ml', 'ai developer', 'ml-аналитик', 'ml analyst', 'аналитик данных', 'data analyst', 'applied scientist',
    'research scientist', 'deep learning', 'внедрение ии', 'специалист по ии', 'промпт-инженер', 'рекомендательные системы',
    'компьютерный лингвист'].join('\n'),
  habr_queries: ['data scientist', 'ml engineer', 'ml-инженер', 'machine learning', 'ai engineer', 'nlp', 'llm', 'ml-аналитик',
    'аналитик данных', 'data analyst'].join('\n'),
  linkedin_queries: ['data scientist', 'machine learning engineer', 'ml engineer', 'ai engineer', 'nlp engineer', 'llm engineer',
    'applied scientist', 'data analyst'].join('\n'),
  // отбор вакансий
  title_include: 'data scien, дата сайент, дата-сайент, анализу данных, ml, machine learning, машинн, ai, ии, искусственн, llm, genai, ' +
    'nlp, естественного языка, natural language, data analyst, аналитик данных, applied scien, research scien, research engineer, ' +
    'ml researcher, ai researcher, исследователь машинн, исследователь ml, исследователь ai, deep learning, нейросет, нейронн, prompt, ' +
    'промпт, generative, генеративн, рекомендательн, recommender, recsys, ranking, ранжирован, decision scien, лингвист, linguist, conversational',
  title_exclude: RU_EXCLUDE,
  target_roles: 'Подходят: Data Scientist (в т.ч. классический ML), ML-инженер / Machine Learning Engineer, AI-инженер, NLP-инженер, ' +
    'LLM-инженер, ML-разработчик, ML-аналитик, Data Analyst / аналитик данных, специалист по внедрению AI/ИИ, Applied / Research Scientist.\n' +
    'Не подходят: Data Engineer и инженер данных, DWH/ETL, BI-разработчик и BI-аналитик, бизнес-, системный и продуктовый аналитик ' +
    'без ML, backend/frontend/fullstack-разработчик, DevOps/MLOps, тестировщик, компьютерное зрение (CV), junior и стажёр, руководители (lead/head/CTO).',
  salary_answer: '250000',
  // резюме и профиль
  ru_resume_text: '', en_resume_text: '', ru_title: '', en_title: '', en_cv_url: '',
  name: '', name_en: '', email: '', phone: '', city: 'Москва', telegram: '', linkedin: '', github: '',
  // лимиты
  agent_limit: '50', habr_limit: '30', linkedin_limit: '20', daily_limit: '150', habr_daily_limit: '60',
  linkedin_daily_limit: '30', site_daily_limit: '30', max_pages: '40', hh_batch: '30', linkedin_pages: '40', agent_max_steps: '20',
  delay_min: '15', delay_max: '40', linkedin_delay_min: '45', linkedin_delay_max: '120',
  agent_confirm: 'false', linkedin_confirm: 'true',
  linkedin_location: '', linkedin_remote: 'true', linkedin_senior_only: 'false', linkedin_days: '7',
  // браузер, пульт, уведомления, расписание
  browser_channel: 'auto', browser_path: '',
  remote_enabled: 'false', remote_pin: '', port: '8765',
  telegram_bot_token: '', telegram_chat_id: '',
  schedule_time: '', schedule_agents: 'hh',
};

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.settings = this._load('settings.json', {});
    this.apps = this._load('applications.json', {});
    this.usage = this._load('usage.json', {});
    this.timing = this._load('timing.json', {});
    this.logLines = [];
    if (!this.settings.remote_pin) { this.settings.remote_pin = String(crypto.randomInt(100000, 999999)); this._save('settings.json', this.settings); }
  }

  _file(n) { return path.join(this.dir, n); }
  _load(n, dflt) { try { return JSON.parse(fs.readFileSync(this._file(n), 'utf8')); } catch { return dflt; } }
  _save(n, obj) {
    const f = this._file(n);
    fs.writeFileSync(f + '.tmp', JSON.stringify(obj, null, 1));
    fs.renameSync(f + '.tmp', f);
  }

  // ---------- настройки ----------
  get(k) { const v = this.settings[k]; return (v === undefined || v === null || v === '') && k in DEFAULTS ? DEFAULTS[k] : (v ?? ''); }
  int(k) { const n = parseInt(this.get(k), 10); return Number.isFinite(n) ? n : parseInt(DEFAULTS[k] || '0', 10) || 0; }
  bool(k) { return String(this.get(k)) === 'true'; }
  set(k, v) { this.settings[k] = String(v); this._save('settings.json', this.settings); }
  setMany(obj) { for (const [k, v] of Object.entries(obj)) this.settings[k] = String(v); this._save('settings.json', this.settings); }
  all() { const out = { ...DEFAULTS }; for (const [k, v] of Object.entries(this.settings)) if (v !== '') out[k] = v; return out; }

  // ---------- журнал ----------
  static today() { return new Date().toISOString().slice(0, 10); }
  status(id) { return this.apps[id]?.status ?? null; }

  /** Уже обработана: не трогаем. Неудачную попытку повторяем через 3 дня. */
  seen(id) {
    const a = this.apps[id];
    if (!a) return false;
    if (['applied', 'manual', 'skipped', 'saved', 'hidden'].includes(a.status)) return true;
    if (a.status === 'failed') return Date.now() - Date.parse(a.created_at) < 3 * 86400000;
    return false;
  }

  record(id, fields) {
    this.apps[id] = { id, title: '', employer: '', url: '', language: '', letter: '', error: '', ...this.apps[id], ...fields, created_at: new Date().toISOString() };
    this._save('applications.json', this.apps);
  }

  markAppliedElsewhere(id, title, url, channel) {
    if (this.status(id) === 'applied') return;
    this.record(id, { title, url, status: 'applied', channel, error: 'откликались ранее' });
  }

  _countApplied(filter) {
    const t = Store.today();
    return Object.values(this.apps).filter(a => a.status === 'applied' && a.error !== 'откликались ранее' &&
      (a.created_at || '').slice(0, 10) === t && filter(a)).length;
  }
  appliedToday() { return this._countApplied(() => true); }
  appliedTodayIn(channel) { return this._countApplied(a => a.channel === channel); }

  list() { return Object.values(this.apps).filter(a => a.status !== 'hidden').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')); }

  // ---------- расходы ----------
  addUsage(provider, input, output, cost) {
    const d = Store.today();
    const day = this.usage[d] || (this.usage[d] = {});
    const r = day[provider] || (day[provider] = { calls: 0, input: 0, output: 0, cost: 0 });
    r.calls++; r.input += input; r.output += output; r.cost += cost;
    this._save('usage.json', this.usage);
  }
  dayTotal(d = Store.today()) {
    return Object.values(this.usage[d] || {}).reduce((a, r) => ({ calls: a.calls + r.calls, input: a.input + r.input, output: a.output + r.output, cost: a.cost + r.cost }),
      { calls: 0, input: 0, output: 0, cost: 0 });
  }
  lastDays(n) {
    const acc = { calls: 0, input: 0, output: 0, cost: 0 };
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const t = this.dayTotal(d);
      for (const k of Object.keys(acc)) acc[k] += t[k];
    }
    return acc;
  }
  usageDays(n = 14) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      if (this.usage[d]) out.push({ day: d, total: this.dayTotal(d), providers: this.usage[d] });
    }
    return { days: out, week: this.lastDays(7), month: this.lastDays(30) };
  }

  // ---------- мониторинг скорости ----------
  /** Время на вакансию по ресурсу: a/am — отклики и их время, n/nm — все просмотренные (для «откликов в час»). */
  addTiming(channel, ms, applied) {
    const d = Store.today();
    const day = this.timing[d] || (this.timing[d] = {});
    const r = day[channel] || (day[channel] = { a: 0, am: 0, min: 0, max: 0, last: 0, n: 0, nm: 0 });
    r.n++; r.nm += ms;
    if (applied) { r.a++; r.am += ms; r.last = ms; r.min = r.min ? Math.min(r.min, ms) : ms; r.max = Math.max(r.max, ms); }
    this._save('timing.json', this.timing);
  }
  timingStats(n) {
    const acc = {};
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      for (const [ch, r] of Object.entries(this.timing[d] || {})) {
        const x = acc[ch] || (acc[ch] = { a: 0, am: 0, min: 0, max: 0, last: 0, n: 0, nm: 0 });
        x.a += r.a; x.am += r.am; x.n += r.n; x.nm += r.nm; x.max = Math.max(x.max, r.max);
        if (r.min) x.min = x.min ? Math.min(x.min, r.min) : r.min;
        if (!x.last && r.last) x.last = r.last; // самый свежий день идёт первым
      }
    }
    for (const x of Object.values(acc)) { x.avg = x.a ? Math.round(x.am / x.a) : 0; x.perHour = x.nm ? x.a * 3600000 / x.nm : 0; }
    return acc;
  }

  // ---------- лог ----------
  log(line) {
    const ts = new Date().toTimeString().slice(0, 8);
    this.logLines.push(`[${ts}] ${line}`);
    if (this.logLines.length > 800) this.logLines.splice(0, this.logLines.length - 800);
  }
}

module.exports = { Store, DEFAULTS };

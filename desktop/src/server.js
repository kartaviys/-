// Сервер пульта: веб-интерфейс для окна приложения на компьютере и для Safari на iPhone (по Wi-Fi, вход по PIN).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('./sites');
const { DEFAULTS } = require('./store');
const { Llm } = require('./llm');
const T = require('./text');

/** Поля настроек для формы (раздел → [ключ, подпись, тип]). */
const SCHEMA = [
  ['Нейросеть', [
    ['anthropic_key', 'Ключ Claude (sk-ant-…)', 'secret'], ['deepseek_key', 'Ключ DeepSeek (sk-…)', 'secret'],
    ['providers', 'Порядок провайдеров: claude, deepseek, custom'], ['strategy', 'Стратегия: fallback или round_robin'],
    ['claude_model', 'Модель Claude'], ['deepseek_model', 'Модель DeepSeek'], ['daily_budget', 'Дневной бюджет, $ (0 — без ограничения)'],
  ]],
  ['Своя модель (Ollama, LM Studio, любой OpenAI-совместимый API)', [
    ['custom_base_url', 'Адрес API, напр. http://127.0.0.1:11434/v1'], ['custom_model', 'Модель, напр. qwen2.5:7b'],
    ['custom_key', 'Ключ (для локальной не нужен)', 'secret'], ['custom_timeout', 'Таймаут ответа, сек'],
    ['custom_price_in', 'Цена за 1M входных токенов, $'], ['custom_price_out', 'Цена за 1M выходных токенов, $'],
  ]],
  ['Отбор вакансий', [
    ['target_roles', 'Какие вакансии мне подходят (нейросеть проверяет каждую)', 'text'],
    ['title_include', 'Название содержит одно из (через запятую)', 'text'], ['title_exclude', 'Исключить, если в названии', 'text'],
    ['salary_answer', 'Ответ на любой вопрос о зарплате'],
    ['candidate_facts', 'Факты о себе для анкет (агент всегда учитывает)', 'text'],
  ]],
  ['Резюме', [
    ['ru_title', 'Название русского резюме на hh'], ['en_title', 'Название английского резюме на hh'],
    ['en_cv_url', 'Ссылка на PDF англ. резюме (в конец англ. писем)'],
    ['ru_resume_text', 'Текст русского резюме', 'text'], ['en_resume_text', 'Текст английского резюме', 'text'],
  ]],
  ['Профиль для анкет', [
    ['name', 'Имя Фамилия'], ['name_en', 'Name Surname'], ['email', 'Email'], ['phone', 'Телефон'], ['city', 'Город'],
    ['telegram', 'Telegram'], ['linkedin', 'LinkedIn'], ['github', 'GitHub'],
  ]],
  ['Лимиты и паузы', [
    ['daily_limit', 'hh: откликов в сутки'], ['habr_daily_limit', 'Хабр: в сутки'], ['linkedin_daily_limit', 'LinkedIn: в сутки'],
    ['site_daily_limit', 'Каждый из 22 сайтов: в сутки'], ['max_pages', 'Страниц на запрос (40 — все)'], ['hh_batch', 'hh: вакансий подряд с одного запроса, потом следующий (по кругу)'], ['agent_max_steps', 'Шагов агента на вакансию'],
    ['delay_min', 'Пауза между откликами от, сек'], ['delay_max', 'до, сек'], ['agent_confirm', 'Спрашивать перед отправкой (true/false)'],
  ]],
  ['LinkedIn', [
    ['linkedin_location', 'Локация (пусто — весь мир)'], ['linkedin_remote', 'Только удалёнка (true/false)'],
    ['linkedin_senior_only', 'Только Mid-Senior (true/false)'], ['linkedin_days', 'За последние N дней'], ['linkedin_pages', 'Страниц на запрос'],
    ['linkedin_delay_min', 'Пауза от, сек'], ['linkedin_delay_max', 'до, сек'], ['linkedin_confirm', 'Спрашивать перед отправкой (true/false)'],
  ]],
  ['Браузер', [
    ['browser_channel', 'Браузер: auto, chrome или msedge'], ['browser_path', 'Или путь к браузеру (необязательно)'],
  ]],
  ['Пульт с телефона (iPhone/Android по Wi-Fi)', [
    ['remote_enabled', 'Разрешить пульт с телефона (true/false) — после изменения перезапустите приложение'],
    ['remote_pin', 'PIN для входа с телефона'], ['port', 'Порт'],
  ]],
  ['Уведомления в Telegram (удобно для iPhone)', [
    ['telegram_bot_token', 'Токен бота (от @BotFather)', 'secret'], ['telegram_chat_id', 'Ваш chat id (узнать у @userinfobot)'],
  ]],
  ['Расписание', [
    ['schedule_time', 'Каждый день в ЧЧ:ММ (пусто — выключено)'], ['schedule_agents', 'Каких агентов запускать по очереди (ключи через запятую: hh, habr, linkedin, superjob, …)'],
  ]],
];

const CHANNEL_OF = { hh: 'hh_site', habr: 'habr_agent', linkedin: 'linkedin_agent' };
function channelName(ch) {
  if (!ch || ch === 'single') return 'Одна вакансия (вручную)';
  const key = Object.keys(CHANNEL_OF).find(k => CHANNEL_OF[k] === ch) || ch;
  return S.agentDef(key)?.name || ch;
}
/** Мониторинг для строки статуса: последний и средний отклик сегодня у работающего агента. */
function speedLine(store, target) {
  if (!target) return '';
  const r = store.timingStats(1)[CHANNEL_OF[target] || target];
  if (!r) return '';
  if (!r.a) return `⏱ сегодня откликов нет, просмотрено ${r.n} за ${T.dur(r.nm)}`;
  return `⏱ отклик: последний ${T.dur(r.last)}, в среднем ${T.dur(r.avg)} · ${r.perHour.toFixed(1)} в час`;
}

function lanUrls(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) {
    if (n.family === 'IPv4' && !n.internal) out.push(`http://${n.address}:${port}/`);
  }
  return out;
}

function createServer({ store, agent, uiDir, dataDir }) {
  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const body = req => new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 15e6) { reject(new Error('слишком большой файл')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
  });
  const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

  const agentsList = () => [...S.CORE, ...S.SITES].map(d => ({
    key: d.key, name: d.name, group: d.group, verified: !!d.verified, note: d.note || '', login: d.login || '',
    noQuery: !!d.noQuery, queries: S.queries(store, d).filter(Boolean).join('\n'), limit: S.limit(store, d),
  }));

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const p = url.pathname;
      if (p === '/' || p === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(fs.readFileSync(path.join(uiDir, 'index.html')));
      }
      if (!p.startsWith('/api/')) { res.writeHead(404); return res.end(); }
      // С телефона — только с PIN
      if (!isLocal(req)) {
        const pin = req.headers['x-pin'] || url.searchParams.get('pin');
        if (String(pin) !== String(store.get('remote_pin'))) return json(res, 401, { error: 'Неверный PIN' });
      }
      const st = agent.state;
      if (p === '/api/state' && req.method === 'GET') {
        const t = store.dayTotal(); const m = store.lastDays(30);
        return json(res, 200, {
          status: st.status, running: st.running, target: st.target, targetName: S.agentDef(st.target)?.name || '',
          prompt: st.prompt, done: st.done, limit: st.limit, appliedToday: store.appliedToday(),
          speed: speedLine(store, st.target),
          usage: `Нейросеть сегодня: ${t.calls} запросов, ≈$${t.cost.toFixed(4)} · за 30 дней ≈$${m.cost.toFixed(2)}`,
          llmReady: !!(store.get('anthropic_key') || store.get('deepseek_key') || store.get('custom_base_url')),
          log: store.logLines.slice(-150),
          remote: { enabled: store.bool('remote_enabled'), urls: lanUrls(store.int('port') || 8765), pin: isLocal(req) ? store.get('remote_pin') : '' },
        });
      }
      if (p === '/api/agents') return json(res, 200, agentsList());
      if (p.startsWith('/api/agent/') && req.method === 'POST') {
        const key = p.split('/').pop(); const def = S.agentDef(key);
        if (!def) return json(res, 404, { error: 'нет такого агента' });
        const b = JSON.parse((await body(req)).toString() || '{}');
        if (b.queries !== undefined && !def.noQuery) store.set(def.queriesKey || 'q_' + key, String(b.queries).split('\n').map(s => s.trim()).filter(Boolean).join('\n'));
        if (b.limit !== undefined && parseInt(b.limit, 10) > 0) store.set(def.limitKey || 'limit_' + key, parseInt(b.limit, 10));
        return json(res, 200, { ok: true });
      }
      if (p === '/api/start' && req.method === 'POST') {
        const b = JSON.parse((await body(req)).toString() || '{}');
        if (st.running) return json(res, 409, { error: `Уже работает агент ${S.agentDef(st.target)?.name}. Остановите его.` });
        try { new Llm(store); } catch (e) { return json(res, 400, { error: e.message }); }
        agent.start(b.target).catch(() => {});
        return json(res, 200, { ok: true });
      }
      if (p === '/api/stop' && req.method === 'POST') { agent.stop(); return json(res, 200, { ok: true }); }
      if (p === '/api/answer' && req.method === 'POST') { const b = JSON.parse((await body(req)).toString() || '{}'); agent.answer(!!b.value); return json(res, 200, { ok: true }); }
      if (p === '/api/login' && req.method === 'POST') {
        const b = JSON.parse((await body(req)).toString() || '{}'); const def = S.agentDef(b.key);
        if (!def) return json(res, 404, { error: 'нет такого агента' });
        if (st.running) return json(res, 409, { error: 'Сначала остановите агента' });
        await agent.login(def.login || def.search('data scientist', 0));
        return json(res, 200, { ok: true, message: 'Окно браузера открыто на компьютере — войдите в аккаунт. Вход запомнится.' });
      }
      if (p === '/api/journal') return json(res, 200, store.list().slice(0, 3000));
      if (p === '/api/usage') return json(res, 200, store.usageDays(14));
      if (p === '/api/daily') return json(res, 200, store.daily(30).map(d => ({ ...d, rows: d.rows.map(r => ({ ...r, name: channelName(r.channel) })) })));
      if (p === '/api/timing') {
        const named = o => Object.entries(o).map(([ch, r]) => ({ channel: ch, name: channelName(ch), ...r })).sort((a, b) => b.a - a.a);
        return json(res, 200, { today: named(store.timingStats(1)), week: named(store.timingStats(7)), month: named(store.timingStats(30)) });
      }
      if (p === '/api/settings' && req.method === 'GET') {
        const all = store.all();
        const masked = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, /key|token/.test(k) && v ? '••••' + String(v).slice(-4) : v]));
        return json(res, 200, { values: isLocal(req) ? all : masked, schema: SCHEMA, defaults: DEFAULTS });
      }
      if (p === '/api/settings' && req.method === 'POST') {
        const b = JSON.parse((await body(req)).toString() || '{}');
        for (const k of Object.keys(b)) if (String(b[k]).startsWith('••••')) delete b[k]; // маска с телефона — не перезаписываем ключ
        store.setMany(b);
        return json(res, 200, { ok: true });
      }
      if (p.startsWith('/api/resume/') && req.method === 'POST') {
        const lang = p.endsWith('/en') ? 'en' : 'ru';
        const pdf = await body(req);
        fs.writeFileSync(path.join(dataDir, `resume_${lang}.pdf`), pdf);
        const llm = new Llm(store);
        if (!llm.claude) return json(res, 200, { ok: true, message: 'PDF сохранён (будет прикрепляться к анкетам). Текст из PDF умеет доставать только Claude — вставьте текст резюме в настройках или агент hh возьмёт его из профиля hh.' });
        const text = await llm.claude.pdfText(pdf);
        store.set(`${lang}_resume_text`, text);
        return json(res, 200, { ok: true, message: `Резюме ${lang.toUpperCase()} загружено (${text.length} символов)` });
      }
      if (p === '/api/screenshot') {
        const img = await agent.screenshot();
        if (!img) { res.writeHead(204); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }); return res.end(img);
      }
      return json(res, 404, { error: 'нет такого метода' });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  });
}

module.exports = { createServer, lanUrls };

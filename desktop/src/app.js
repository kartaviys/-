// Сборка приложения: хранилище + агент + сервер пульта + уведомления + расписание.
// Используется и Electron (main.js), и запуском без Electron (node src/standalone.js).
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const { Agent } = require('./agent');
const { createServer } = require('./server');

function resolveAgentJs(baseDir) {
  const cands = [
    path.join(baseDir, 'assets', 'agent.js'),
    path.join(process.resourcesPath || '', 'assets', 'agent.js'),
    path.join(baseDir, '..', 'android', 'app', 'src', 'main', 'assets', 'agent.js'), // при разработке — общий файл с Android
  ];
  const f = cands.find(c => c && fs.existsSync(c));
  if (!f) throw new Error('Не найден assets/agent.js');
  return f;
}

async function startApp({ dataDir, baseDir, notifyDesktop }) {
  const store = new Store(dataDir);

  const notify = (title, body) => {
    try { notifyDesktop?.(title, body); } catch {}
    const token = store.get('telegram_bot_token'); const chat = store.get('telegram_chat_id');
    if (token && chat) {
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: `🤖 HH Автоотклик\n${title}\n${body}` }),
      }).catch(() => {});
    }
  };

  const agent = new Agent(store, { dataDir, agentJsPath: resolveAgentJs(baseDir), notify });
  const server = createServer({ store, agent, uiDir: path.join(baseDir, 'ui'), dataDir });
  const port = store.int('port') || 8765;
  const host = store.bool('remote_enabled') ? '0.0.0.0' : '127.0.0.1';
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });

  // Расписание: каждый день в schedule_time запускаем агентов по очереди
  let lastRun = '';
  setInterval(async () => {
    const t = store.get('schedule_time'); if (!t) return;
    const now = new Date(); const hm = now.toTimeString().slice(0, 5); const day = now.toISOString().slice(0, 10);
    if (hm !== t || lastRun === day || agent.state.running) return;
    lastRun = day;
    for (const key of store.get('schedule_agents').split(',').map(s => s.trim()).filter(Boolean)) {
      try { await agent.start(key); } catch (e) { store.log(`Расписание: ${key} — ${e.message}`); }
    }
  }, 30000);

  return { store, agent, server, url: `http://127.0.0.1:${port}/` };
}

module.exports = { startApp };

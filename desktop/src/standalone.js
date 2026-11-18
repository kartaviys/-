// Запуск без Electron (для разработки или если удобнее): node src/standalone.js → откройте http://127.0.0.1:8765
const path = require('path');
const os = require('os');
const { startApp } = require('./app');

const dataDir = process.env.HH_DATA_DIR || path.join(os.homedir(), '.hh-autoapply');
startApp({ dataDir, baseDir: path.join(__dirname, '..'), notifyDesktop: (t, b) => console.log(`🔔 ${t}: ${b}`) })
  .then(({ url }) => console.log(`HH Автоотклик: пульт открыт на ${url} (данные: ${dataDir})`))
  .catch(e => { console.error(e); process.exit(1); });

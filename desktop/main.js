// Electron: окно приложения + системные уведомления. Вся логика — в src/app.js.
const { app, BrowserWindow, Notification, shell } = require('electron');
const { startApp } = require('./src/app');

let win = null;

function createWindow(url) {
  win = new BrowserWindow({ width: 1180, height: 860, title: 'HH Автоотклик', autoHideMenuBar: true });
  win.loadURL(url);
  // Внешние ссылки (вакансии) — в системном браузере
  win.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: 'deny' }; });
  win.on('closed', () => { win = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    const notifyDesktop = (title, body) => {
      if (Notification.isSupported()) new Notification({ title, body }).show();
      if (win && !win.isFocused()) win.flashFrame(true);
    };
    try {
      const { url } = await startApp({ dataDir: app.getPath('userData'), baseDir: __dirname, notifyDesktop });
      createWindow(url);
      app.on('activate', () => { if (!win) createWindow(url); });
    } catch (e) {
      const { dialog } = require('electron');
      dialog.showErrorBox('HH Автоотклик', 'Не удалось запустить: ' + e.message);
      app.quit();
    }
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

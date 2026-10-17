// Nudge desktop: wraps the reminder app in a native window with a tray icon, a global
// quick-add shortcut, OS notifications and a dock/taskbar badge. Closing the window keeps
// Nudge running in the tray so reminders still fire.
const { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage, shell, ipcMain } = require('electron');
const path = require('node:path');

const isMac = process.platform === 'darwin';
const QUICK_ADD_SHORTCUT = 'CommandOrControl+Shift+Space';
let win = null;
let tray = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

app.setAppUserModelId('com.vnhngy.nudge'); // needed for Windows notifications

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 820,
    minHeight: 560,
    show: false,
    title: 'Nudge',
    backgroundColor: '#dde5f2',
    icon: path.join(__dirname, 'build', 'icon.png'),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 24, y: 24 },
    autoHideMenuBar: !isMac,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // keep the alert timer running while hidden
      spellcheck: true,
    },
  });

  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) win.show();
  });

  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // Links open in the default browser; the window never navigates away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  // The page puts "(3) Nudge Reminders" in its title when things need attention.
  win.on('page-title-updated', (e, title) => {
    e.preventDefault();
    const m = /^\((\d+)\)/.exec(title);
    if (m || /^Nudge/.test(title)) setAttention(m ? Number(m[1]) : 0);
  });
}

function setAttention(count) {
  app.setBadgeCount(count);
  if (tray) tray.setToolTip(count ? `Nudge: ${count} need attention` : 'Nudge');
  if (process.platform === 'win32' && win) {
    win.setOverlayIcon(count ? overlayIcon() : null, count ? `${count} need attention` : '');
  }
}

let overlay = null;
function overlayIcon() {
  if (!overlay) overlay = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png')).resize({ width: 16, height: 16 });
  return overlay;
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function run(js) {
  showWindow();
  return win.webContents.executeJavaScript(js).catch(() => {});
}

const actions = {
  newReminder: () => run("document.getElementById('quickInput')?.focus()"),
  search: () => run("document.getElementById('search')?.focus()"),
  settings: () => run('window.__nudge?.openSettings?.()'),
  shortcuts: () => run('window.__nudge?.openShortcuts?.()'),
  review: () => run('window.__nudge?.reviewOverdue?.()'),
  templates: () => run('window.__nudge?.templates?.()'),
  exportBackup: () => run('window.__nudge?.exportJSON?.()'),
  exportCalendar: () => run('window.__nudge?.exportICS?.()'),
  importBackup: () => run('window.__nudge?.importBackup?.()'),
  view: (v) => run(`document.querySelector('[data-view="${v}"]')?.click()`),
  mode: (m) => run(`document.querySelector('[data-act="mode"][data-mode="${m}"]')?.click()`),
};

function launchAtLogin() {
  return app.getLoginItemSettings().openAtLogin;
}

function setLaunchAtLogin(on) {
  app.setLoginItemSettings({ openAtLogin: on, openAsHidden: true, args: ['--hidden'] });
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Nudge', click: showWindow },
    { label: 'New Reminder', accelerator: QUICK_ADD_SHORTCUT, click: actions.newReminder },
    { label: 'Review Overdue', click: actions.review },
    { type: 'separator' },
    { label: 'Launch at Login', type: 'checkbox', checked: launchAtLogin(), click: (item) => setLaunchAtLogin(item.checked) },
    { type: 'separator' },
    { label: 'Quit Nudge', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const file = isMac ? 'trayTemplate.png' : 'tray.png';
  const image = nativeImage.createFromPath(path.join(__dirname, 'build', file));
  if (isMac) image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Nudge');
  tray.on('click', () => (win && win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
  buildTrayMenu();
}

function createMenu() {
  const template = [
    ...(isMac ? [{
      label: 'Nudge',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Command+,', click: actions.settings },
        { label: 'Launch at Login', type: 'checkbox', checked: launchAtLogin(), click: (item) => setLaunchAtLogin(item.checked) },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit Nudge', accelerator: 'Command+Q', click: () => { quitting = true; app.quit(); } },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Reminder', accelerator: 'CommandOrControl+N', click: actions.newReminder },
        { label: 'New from Template…', accelerator: 'CommandOrControl+Shift+N', click: actions.templates },
        { label: 'Review Overdue…', accelerator: 'CommandOrControl+R', click: actions.review },
        { type: 'separator' },
        { label: 'Import Backup…', click: actions.importBackup },
        { label: 'Export Backup…', accelerator: 'CommandOrControl+E', click: actions.exportBackup },
        { label: 'Export Calendar (.ics)…', click: actions.exportCalendar },
        { type: 'separator' },
        ...(isMac ? [{ role: 'close' }] : [
          { label: 'Settings…', accelerator: 'Control+,', click: actions.settings },
          { type: 'separator' },
          { label: 'Close Window', accelerator: 'Control+W', click: () => win && win.hide() },
          { label: 'Quit', accelerator: 'Control+Q', click: () => { quitting = true; app.quit(); } },
        ]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Today', accelerator: 'CommandOrControl+1', click: () => actions.view('today') },
        { label: 'Scheduled', accelerator: 'CommandOrControl+2', click: () => actions.view('scheduled') },
        { label: 'All', accelerator: 'CommandOrControl+3', click: () => actions.view('all') },
        { label: 'Flagged', accelerator: 'CommandOrControl+4', click: () => actions.view('flagged') },
        { type: 'separator' },
        { label: 'List', accelerator: 'CommandOrControl+Alt+1', click: () => actions.mode('list') },
        { label: 'Board', accelerator: 'CommandOrControl+Alt+2', click: () => actions.mode('board') },
        { label: 'Calendar', accelerator: 'CommandOrControl+Alt+3', click: () => actions.mode('calendar') },
        { label: 'Statistics', accelerator: 'CommandOrControl+Alt+4', click: () => actions.mode('stats') },
        { type: 'separator' },
        { label: 'Search', accelerator: 'CommandOrControl+F', click: actions.search },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'Keyboard Shortcuts', accelerator: 'CommandOrControl+/', click: actions.shortcuts }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.on('nudge:show', () => showWindow());

app.whenReady().then(() => {
  createWindow();
  createMenu();
  createTray();
  if (!globalShortcut.register(QUICK_ADD_SHORTCUT, actions.newReminder)) {
    console.warn(`Could not register ${QUICK_ADD_SHORTCUT}; another app may be using it.`);
  }
  app.on('activate', showWindow);
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault()); // stay in the tray

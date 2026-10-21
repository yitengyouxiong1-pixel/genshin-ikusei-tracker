// 原神 育成トラッカー — Electron main process.
// Keeps the SQLite file on disk; the page itself runs SQLite (sql.js) and hands the bytes over to be saved.
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// ASCII folder name under %APPDATA% so paths never depend on the Japanese product name. (The launcher sets it too.)
app.setPath('userData', path.join(app.getPath('appData'), 'GenshinIkuseiTracker'));
if (!global.__GT) { // started without the launcher (development)
  global.__GT = { launcherVersion: '0.0.0', coreDir: __dirname, bundledDir: __dirname, versionsDir: path.join(app.getPath('userData'), 'app-versions'),
    coreVersion: JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8')).version };
}
const updater = require('./updater');
const dataDir = () => app.getPath('userData');
const dbPath = () => path.join(dataDir(), 'tracker.sqlite');
const backupDir = () => path.join(dataDir(), 'backups');
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'binary');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1220, height: 880, minWidth: 380, minHeight: 500,
    title: '原神 育成トラッカー',
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1F2244' : '#EEF6F3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false,
      backgroundThrottling: false // keeps timers and the overlay feed running while minimized behind the game
    }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Never navigate away from the app; open real web links in the default browser.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { createWindow(); loadOv(); registerHotkeys(); if (OV.visible) showOverlay(); });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => globalShortcut.unregisterAll());

// ---------------- overlay: a small always-on-top window over the game ----------------
// It never touches the game; it is an ordinary window kept above others. Works when the game runs in borderless mode.
let overlay = null, lastState = null, hotkeyOk = { toggle: true, through: true };
const OV = { visible: false, mode: 'list', x: null, y: null, opacity: 0.94, through: false };
const ovPath = () => path.join(dataDir(), 'overlay.json');
function loadOv() { try { Object.assign(OV, JSON.parse(fs.readFileSync(ovPath(), 'utf8'))); } catch (_) { /* first run */ } OV.through = false; }
function saveOv() { try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(ovPath(), JSON.stringify(OV)); } catch (_) { /* not critical */ } }
function onScreen(x, y) { return screen.getAllDisplays().some((d) => { const a = d.workArea; return x >= a.x - 40 && y >= a.y - 10 && x < a.x + a.width - 60 && y < a.y + a.height - 40; }); }
function ovConfig() { return { mode: OV.mode, opacity: OV.opacity, through: OV.through, hotkeyOk }; }
function sendCfg() {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('ov:config', ovConfig());
  if (win && !win.isDestroyed()) win.webContents.send('ov:config', Object.assign({ visible: OV.visible && !!overlay && overlay.isVisible() }, ovConfig()));
}
function createOverlay() {
  const wa = screen.getPrimaryDisplay().workArea;
  if (OV.x == null || !onScreen(OV.x, OV.y)) { OV.x = wa.x + wa.width - 360; OV.y = wa.y + 90; }
  overlay = new BrowserWindow({
    x: OV.x, y: OV.y, width: 340, height: 160, frame: false, transparent: true, resizable: false, movable: true,
    skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false, fullscreenable: false, maximizable: false, minimizable: false,
    title: '原神 育成トラッカー（ゲーム中の表示）',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setOpacity(OV.opacity);
  overlay.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlay.webContents.on('will-navigate', (e) => e.preventDefault());
  overlay.webContents.on('did-finish-load', () => { sendCfg(); if (lastState) overlay.webContents.send('ov:state', lastState); });
  overlay.on('moved', () => { const b = overlay.getBounds(); OV.x = b.x; OV.y = b.y; saveOv(); });
  overlay.on('closed', () => { overlay = null; });
}
function showOverlay() {
  if (!overlay) createOverlay();
  const go = () => { overlay.showInactive(); overlay.setAlwaysOnTop(true, 'screen-saver'); OV.visible = true; saveOv(); sendCfg(); };
  if (overlay.webContents.isLoading()) overlay.webContents.once('did-finish-load', go); else go();
}
function hideOverlay() { if (overlay) overlay.hide(); OV.visible = false; setThrough(false); saveOv(); sendCfg(); }
function setMode(m) { OV.mode = m; saveOv(); sendCfg(); }
function setThrough(v) {
  OV.through = !!v;
  if (overlay && !overlay.isDestroyed()) overlay.setIgnoreMouseEvents(OV.through, { forward: true });
  sendCfg();
}
// Ctrl+Alt+G: hidden → list → mini → hidden
function cycleOverlay() {
  if (!OV.visible || !overlay || !overlay.isVisible()) { OV.mode = 'list'; showOverlay(); return; }
  if (OV.mode === 'list') { setMode('mini'); return; }
  hideOverlay();
}
function registerHotkeys() {
  hotkeyOk.toggle = globalShortcut.register('Control+Alt+G', cycleOverlay);
  hotkeyOk.through = globalShortcut.register('Control+Alt+M', () => { if (OV.visible) setThrough(!OV.through); });
}
const fromMain = (e) => win && e.sender === win.webContents;
const fromOverlay = (e) => overlay && e.sender === overlay.webContents;
ipcMain.on('ov:push', (e, state) => {
  if (!fromMain(e)) return;
  lastState = state;
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('ov:state', state);
});
ipcMain.on('ov:action', (e, a) => {
  if (!fromOverlay(e) || !a || typeof a.id !== 'string' || !['d', 'w'].includes(a.scope)) return;
  if (win && !win.isDestroyed()) win.webContents.send('ov:action', { scope: a.scope, id: a.id, on: !!a.on });
});
ipcMain.on('ov:size', (e, sz) => {
  if (!fromOverlay(e) || !sz) return;
  const w = Math.max(120, Math.min(420, Math.ceil(+sz.w || 0))), h = Math.max(40, Math.min(760, Math.ceil(+sz.h || 0)));
  const b = overlay.getBounds();
  if (b.width !== w || b.height !== h) {
    // some systems ignore size changes on a fixed-size window, so allow it just for this change
    overlay.setResizable(true); overlay.setBounds({ x: b.x, y: b.y, width: w, height: h }); overlay.setResizable(false);
  }
});
ipcMain.on('ov:cmd', (e, cmd) => {
  if (!fromMain(e) && !fromOverlay(e)) return;
  if (cmd === 'show') { showOverlay(); return; }
  if (cmd === 'hide') { hideOverlay(); return; }
  if (cmd === 'toggle') { if (OV.visible) hideOverlay(); else showOverlay(); return; }
  if (cmd === 'mode:list' || cmd === 'mode:mini') { setMode(cmd.slice(5)); return; }
  if (cmd === 'through') { setThrough(!OV.through); return; }
  if (cmd === 'opacity+' || cmd === 'opacity-') {
    OV.opacity = Math.round(Math.max(0.4, Math.min(1, OV.opacity + (cmd === 'opacity+' ? 0.1 : -0.1))) * 100) / 100;
    if (overlay) overlay.setOpacity(OV.opacity); saveOv(); sendCfg(); return;
  }
  if (cmd === 'open-main' && win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
});
ipcMain.handle('ov:get-config', () => Object.assign({ visible: OV.visible && !!overlay && overlay.isVisible() }, ovConfig()));

function isSqlite(buf) { return buf && buf.length >= 16 && Buffer.from(buf.subarray(0, 16)).equals(SQLITE_HEADER); }
function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// One backup per day of the file as it was before the day's first save; keeps the latest 14.
function backupOnce() {
  try {
    if (!fs.existsSync(dbPath())) return;
    fs.mkdirSync(backupDir(), { recursive: true });
    const target = path.join(backupDir(), 'tracker-' + today() + '.sqlite');
    if (!fs.existsSync(target)) fs.copyFileSync(dbPath(), target);
    const files = fs.readdirSync(backupDir()).filter(f => /^tracker-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort();
    while (files.length > 14) fs.unlinkSync(path.join(backupDir(), files.shift()));
  } catch (_) { /* a failed backup must never block saving */ }
}

ipcMain.handle('wasm:get', () => fs.readFileSync(path.join(__dirname, 'renderer', 'vendor', 'sql-wasm.wasm')));

ipcMain.handle('db:load', () => {
  try { return fs.existsSync(dbPath()) ? fs.readFileSync(dbPath()) : null; } catch (_) { return null; }
});

ipcMain.handle('db:save', (_e, bytes) => {
  const buf = Buffer.from(bytes);
  if (!isSqlite(buf)) return { ok: false, error: 'not-sqlite' };
  fs.mkdirSync(dataDir(), { recursive: true });
  backupOnce();
  const tmp = dbPath() + '.tmp';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dbPath()); // replace in one step so a crash never leaves half a file
  return { ok: true };
});

ipcMain.handle('file:export', async (_e, bytes) => {
  const d = today().replace(/-/g, '');
  const r = await dialog.showSaveDialog(win, {
    title: '育成データを書き出す',
    defaultPath: path.join(app.getPath('documents'), '原神育成データ-' + d + '.sqlite'),
    filters: [{ name: 'SQLite データ', extensions: ['sqlite'] }]
  });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(r.filePath, Buffer.from(bytes));
  return { ok: true, path: r.filePath };
});

ipcMain.handle('file:import', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '育成データを読み込む',
    properties: ['openFile'],
    filters: [{ name: 'SQLite データ', extensions: ['sqlite', 'db', 'sqlite3'] }]
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  const buf = fs.readFileSync(r.filePaths[0]);
  if (!isSqlite(buf)) return { ok: false, error: 'not-sqlite' };
  return { ok: true, bytes: buf };
});

ipcMain.handle('folder:open', () => shell.openPath(dataDir()));
ipcMain.handle('app:info', () => ({ version: global.__GT.coreVersion, launcher: global.__GT.launcherVersion, dataPath: dbPath() }));

// ---------------- updates ----------------
let updateTimer = null;
async function runUpdateCheck() {
  const st = await updater.check();
  if (win && !win.isDestroyed()) win.webContents.send('update:status', st);
  return st;
}
ipcMain.on('app:started', (e) => {
  if (!win || e.sender !== win.webContents) return;
  updater.markGood();
  if (!updateTimer) { setTimeout(runUpdateCheck, 15000); updateTimer = setInterval(runUpdateCheck, 6 * 3600e3); }
});
ipcMain.handle('update:check', () => runUpdateCheck());
ipcMain.handle('update:restart', () => updater.restart());
ipcMain.handle('update:open-page', () => shell.openExternal(updater.RELEASES_PAGE));

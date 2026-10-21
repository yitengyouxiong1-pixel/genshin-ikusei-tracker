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
const APP_ICON = path.join(__dirname, 'renderer', 'icon.png');
if (process.platform === 'win32') app.setAppUserModelId('local.genshin.ikusei.tracker'); // taskbar uses our icon and groups our windows

let win = null, quitting = false;
const alive = (w) => !!w && !w.isDestroyed();
function showMain() { if (!alive(win)) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function createWindow() {
  win = new BrowserWindow({
    width: 1220, height: 880, minWidth: 380, minHeight: 500,
    title: '原神 育成トラッカー',
    icon: APP_ICON,
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
  // The overlay gets its list from this window, so while the overlay is showing, closing this window only hides it.
  // Closing it with the overlay hidden quits the app as before.
  win.on('close', (e) => {
    if (!quitting && alive(overlay) && overlay.isVisible()) { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { win = null; if (alive(overlay)) overlay.destroy(); });
}
app.on('before-quit', () => { quitting = true; });

app.on('second-instance', () => showMain());
app.whenReady().then(() => { createWindow(); loadOv(); registerHotkeys(); if (OV.visible) showOverlay(); });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => globalShortcut.unregisterAll());

// ---------------- overlay: a small always-on-top window over the game ----------------
// It never touches the game; it is an ordinary window kept above others. Works when the game runs in borderless mode.
// The window is resizable from its edges like any window; the page adapts what it shows to the size it is given.
// Sizes below MINI_H tall count as the one-line "mini" view; each view remembers its own last size.
let overlay = null, lastState = null, hotkeyOk = { toggle: true, through: true };
const MINI_H = 90;
const OV = { visible: false, mode: 'list', x: null, y: null, opacity: 0.94, through: false, list: { w: 340, h: 480 }, mini: { w: 300, h: 46 } };
const SKY_BG = { night: '#121829', dawn: '#EEEFF6', 'day-gold': '#F6F2E7', 'day-sky': '#EEF3F9', 'day-field': '#EEF4F0', akane: '#F6ECE8', twilight: '#4D3450', sunset: '#2B1E33' };
const ovPath = () => path.join(dataDir(), 'overlay.json');
function loadOv() {
  try { const d = JSON.parse(fs.readFileSync(ovPath(), 'utf8')); Object.assign(OV, d, { list: Object.assign({}, OV.list, d.list), mini: Object.assign({}, OV.mini, d.mini) }); } catch (_) { /* first run */ }
  OV.through = false;
}
function saveOv() { try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(ovPath(), JSON.stringify(OV)); } catch (_) { /* not critical */ } }
function onScreen(x, y) { return screen.getAllDisplays().some((d) => { const a = d.workArea; return x >= a.x - 40 && y >= a.y - 10 && x < a.x + a.width - 60 && y < a.y + a.height - 40; }); }
function ovConfig() { return { mode: OV.mode, opacity: OV.opacity, through: OV.through, hotkeyOk }; }
function sendCfg() {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('ov:config', ovConfig());
  if (win && !win.isDestroyed()) win.webContents.send('ov:config', Object.assign({ visible: OV.visible && alive(overlay) && overlay.isVisible() }, ovConfig()));
}
function createOverlay() {
  const wa = screen.getPrimaryDisplay().workArea;
  const sz = OV[OV.mode] || OV.list;
  if (OV.x == null || !onScreen(OV.x, OV.y)) { OV.x = wa.x + wa.width - sz.w - 24; OV.y = wa.y + 90; }
  overlay = new BrowserWindow({
    x: OV.x, y: OV.y, width: sz.w, height: sz.h, minWidth: 140, minHeight: 34, maxWidth: 1000, maxHeight: 1200,
    frame: false, resizable: true, thickFrame: true, movable: true, backgroundColor: SKY_BG[(lastState && lastState.sky) || 'night'] || '#121829',
    skipTaskbar: true, alwaysOnTop: true, show: false, fullscreenable: false, maximizable: false, minimizable: false,
    title: '原神 育成トラッカー（ゲーム中の表示）',
    icon: APP_ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setOpacity(OV.opacity);
  overlay.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlay.webContents.on('will-navigate', (e) => e.preventDefault());
  overlay.webContents.on('did-finish-load', () => { sendCfg(); if (lastState) overlay.webContents.send('ov:state', lastState); });
  let t = null;
  const remember = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (!overlay || overlay.isDestroyed()) return;
      const b = overlay.getBounds();
      OV.x = b.x; OV.y = b.y;
      const mode = b.height < MINI_H ? 'mini' : 'list';
      OV[mode] = { w: b.width, h: b.height };
      if (mode !== OV.mode) { OV.mode = mode; sendCfg(); }
      saveOv();
    }, 250);
  };
  overlay.on('moved', remember);
  overlay.on('resize', remember);
  overlay.on('closed', () => { overlay = null; });
}
function showOverlay() {
  if (!alive(overlay)) createOverlay();
  const go = () => { overlay.showInactive(); overlay.setAlwaysOnTop(true, 'screen-saver'); OV.visible = true; saveOv(); sendCfg(); };
  if (overlay.webContents.isLoading()) overlay.webContents.once('did-finish-load', go); else go();
}
function hideOverlay() {
  if (alive(overlay)) overlay.hide();
  OV.visible = false; setThrough(false); saveOv(); sendCfg();
  // with the main window hidden, hiding the overlay would leave nothing on screen: bring the main window back
  if (alive(win) && !win.isVisible()) showMain();
}
// switch view: resize the window to the size last used for that view
function setMode(m) {
  OV.mode = m;
  if (overlay && !overlay.isDestroyed()) {
    const b = overlay.getBounds(), sz = OV[m];
    overlay.setBounds({ x: b.x, y: b.y, width: sz.w, height: sz.h });
  }
  saveOv(); sendCfg();
}
function setThrough(v) {
  OV.through = !!v;
  if (overlay && !overlay.isDestroyed()) overlay.setIgnoreMouseEvents(OV.through, { forward: true });
  sendCfg();
}
// Ctrl+Alt+G: hidden → list → mini → hidden
function cycleOverlay() {
  if (!OV.visible || !alive(overlay) || !overlay.isVisible()) { showOverlay(); setMode('list'); return; }
  if (OV.mode === 'list') { setMode('mini'); return; }
  hideOverlay();
}
function registerHotkeys() {
  hotkeyOk.toggle = globalShortcut.register('Control+Alt+G', cycleOverlay);
  hotkeyOk.through = globalShortcut.register('Control+Alt+M', () => { if (OV.visible) setThrough(!OV.through); });
}
const fromMain = (e) => alive(win) && e.sender === win.webContents;
const fromOverlay = (e) => alive(overlay) && e.sender === overlay.webContents;
ipcMain.on('ov:push', (e, state) => {
  if (!fromMain(e)) return;
  const skyChanged = !lastState || lastState.sky !== state.sky;
  lastState = state;
  if (overlay && !overlay.isDestroyed()) {
    if (skyChanged && SKY_BG[state.sky]) overlay.setBackgroundColor(SKY_BG[state.sky]);
    overlay.webContents.send('ov:state', state);
  }
});
ipcMain.on('ov:action', (e, a) => {
  if (!fromOverlay(e) || !a || typeof a.id !== 'string' || !['d', 'w'].includes(a.scope)) return;
  if (win && !win.isDestroyed()) win.webContents.send('ov:action', { scope: a.scope, id: a.id, on: !!a.on });
});
ipcMain.on('ov:size', () => { /* older overlay pages asked to be fitted; the size is now the viewer's choice */ });
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
  if (cmd === 'open-main') showMain();
});
ipcMain.handle('ov:get-config', () => Object.assign({ visible: OV.visible && alive(overlay) && overlay.isVisible() }, ovConfig()));

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
  console.log('[update]', JSON.stringify(st));
  if (win && !win.isDestroyed()) win.webContents.send('update:status', st);
  return st;
}
ipcMain.on('app:started', (e) => {
  if (!fromMain(e)) return;
  console.log('[app] started core', global.__GT.coreVersion);
  updater.markGood();
  if (!updateTimer) { setTimeout(runUpdateCheck, 15000); updateTimer = setInterval(runUpdateCheck, 6 * 3600e3); }
});
ipcMain.handle('update:check', () => runUpdateCheck());
ipcMain.handle('update:restart', () => updater.restart());
ipcMain.handle('update:open-page', () => shell.openExternal(updater.RELEASES_PAGE));

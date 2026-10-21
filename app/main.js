// 原神 育成トラッカー — launcher.
// This file and the Electron runtime stay fixed. The app itself ("core") is either the copy shipped next to this
// file or a newer one that the updater downloaded into %APPDATA%\GenshinIkuseiTracker\app-versions\<version>.
// A downloaded version must start successfully once (it writes .ok); if it never does, it is skipped from then on.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

app.setPath('userData', path.join(app.getPath('appData'), 'GenshinIkuseiTracker'));
const BUNDLED = path.join(__dirname, 'core');
const VERSIONS = path.join(app.getPath('userData'), 'app-versions');

const readVer = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8')).version; } catch (_) { return null; } };
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] - y[i]; } return 0; };

// Newest first: downloaded versions newer than the shipped one that have not failed before, then the shipped one.
function candidates() {
  const base = readVer(BUNDLED) || '0.0.0';
  const list = [];
  try {
    for (const name of fs.readdirSync(VERSIONS)) {
      const d = path.join(VERSIONS, name);
      if (!/^\d+\.\d+\.\d+$/.test(name) || readVer(d) !== name || !fs.existsSync(path.join(d, 'main.js'))) continue;
      if (cmp(name, base) <= 0 || fs.existsSync(path.join(d, '.bad'))) continue;
      // tried before and never reported a good start: give up on it
      if (fs.existsSync(path.join(d, '.trying')) && !fs.existsSync(path.join(d, '.ok'))) { mark(d, '.bad', 'never started'); continue; }
      list.push({ v: name, d });
    }
  } catch (_) { /* no downloaded versions yet */ }
  list.sort((a, b) => cmp(b.v, a.v));
  return list.map((x) => x.d).concat([BUNDLED]);
}
function mark(dir, name, text) { try { fs.writeFileSync(path.join(dir, name), String(text || Date.now())); } catch (_) { /* ignore */ } }

const chosen = candidates()[0];
if (chosen !== BUNDLED && !fs.existsSync(path.join(chosen, '.ok'))) mark(chosen, '.trying');
global.__GT = {
  launcherVersion: require('./package.json').version,
  coreDir: chosen, bundledDir: BUNDLED, versionsDir: VERSIONS,
  coreVersion: readVer(chosen) || require('./package.json').version
};
try { require(path.join(chosen, 'main.js')); }
catch (err) {
  if (chosen === BUNDLED) throw err;
  // a downloaded version failed while loading: never use it again and start over with the next one
  mark(chosen, '.bad', err && err.stack || err);
  app.relaunch(); app.exit(0);
}

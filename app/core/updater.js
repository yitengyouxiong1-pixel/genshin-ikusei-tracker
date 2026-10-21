// Updater: fetches update.json from the latest GitHub Release, downloads the matching core bundle,
// checks its size and SHA-256, unpacks it into app-versions/<version>, and tells the window it is ready.
// The switch happens on the next start (the launcher picks the newest good version).
const { app, net } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');

const OWNER = 'yitengyouxiong1-pixel';
const REPO = 'genshin-ikusei-tracker';
const RELEASES_PAGE = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const LATEST_JSON = `https://github.com/${OWNER}/${REPO}/releases/latest/download/update.json`;
// Only GitHub and its download hosts are ever contacted.
const ALLOWED = /^https:\/\/(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)\//;
const MAX_BUNDLE = 30 * 1024 * 1024;

const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] - y[i]; } return 0; };
const isVer = (v) => typeof v === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(v);

async function get(url, limit) {
  if (!ALLOWED.test(url)) throw new Error('blocked-host');
  const r = await net.fetch(url, { redirect: 'follow', cache: 'no-store', headers: { 'User-Agent': 'GenshinIkuseiTracker' } });
  if (!ALLOWED.test(r.url)) throw new Error('blocked-host');
  if (r.status === 404) throw new Error('not-found');
  if (!r.ok) throw new Error('http-' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (limit && buf.length > limit) throw new Error('too-large');
  return buf;
}

function unpack(gz, dest, version) {
  const files = JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
  if (!files || typeof files !== 'object' || files['version.json'] === undefined || files['main.js'] === undefined) throw new Error('bad-bundle');
  const tmp = dest + '.tmp-' + process.pid;
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const [rel, b64] of Object.entries(files)) {
    // plain relative paths only: letters, digits, - _ . / and no ".." segments
    if (!/^[A-Za-z0-9_\-./]+$/.test(rel) || rel.split('/').some((s) => s === '..' || s === '') || rel.startsWith('/')) throw new Error('bad-path');
    const out = path.join(tmp, ...rel.split('/'));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  }
  const v = JSON.parse(fs.readFileSync(path.join(tmp, 'version.json'), 'utf8')).version;
  if (v !== version) { fs.rmSync(tmp, { recursive: true, force: true }); throw new Error('version-mismatch'); }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(tmp, dest);
}

let busy = null;
async function check() {
  if (busy) return busy;
  busy = (async () => {
    const G = global.__GT;
    const current = G.coreVersion;
    let m;
    try { m = JSON.parse((await get(LATEST_JSON, 64 * 1024)).toString('utf8')); }
    catch (e) { return { status: e.message === 'not-found' ? 'latest' : 'offline', current }; }
    if (!m || !isVer(m.version) || typeof m.bundle !== 'string' || !/^[A-Za-z0-9_.\-]+$/.test(m.bundle) || !/^[0-9a-f]{64}$/.test(m.sha256 || '') || !(m.size > 0 && m.size <= MAX_BUNDLE)) {
      return { status: 'error', current, message: '更新情報の形式が正しくありません' };
    }
    const notes = typeof m.notes === 'string' ? m.notes.slice(0, 400) : '';
    if (cmp(m.version, current) <= 0) return { status: 'latest', current };
    if (isVer(m.minLauncher) && cmp(G.launcherVersion, m.minLauncher) < 0) return { status: 'manual', current, version: m.version, notes, page: RELEASES_PAGE };
    const dest = path.join(G.versionsDir, m.version);
    if (fs.existsSync(path.join(dest, '.bad'))) return { status: 'latest', current };
    try {
      if (!fs.existsSync(path.join(dest, 'version.json'))) {
        const gz = await get(`https://github.com/${OWNER}/${REPO}/releases/download/v${m.version}/${m.bundle}`, MAX_BUNDLE);
        if (gz.length !== m.size) throw new Error('size-mismatch');
        if (crypto.createHash('sha256').update(gz).digest('hex') !== m.sha256) throw new Error('hash-mismatch');
        fs.mkdirSync(G.versionsDir, { recursive: true });
        unpack(gz, dest, m.version);
      }
      return { status: 'ready', current, version: m.version, notes };
    } catch (e) {
      return { status: 'error', current, message: 'ダウンロードした更新を確認できませんでした（' + e.message + '）' };
    }
  })();
  try { return await busy; } finally { busy = null; }
}

// Called once the window has started cleanly on this core: marks it good and tidies old downloads.
function markGood() {
  const G = global.__GT;
  try {
    if (path.dirname(G.coreDir) === G.versionsDir) fs.writeFileSync(path.join(G.coreDir, '.ok'), String(Date.now()));
    const keep = new Set([path.basename(G.coreDir)]);
    const names = fs.readdirSync(G.versionsDir).filter((n) => /^\d+\.\d+\.\d+$/.test(n)).sort(cmp);
    // keep the running version, anything newer (waiting for restart), and one older one to fall back to
    const older = names.filter((n) => cmp(n, G.coreVersion) < 0);
    if (older.length) keep.add(older[older.length - 1]);
    names.filter((n) => cmp(n, G.coreVersion) > 0).forEach((n) => keep.add(n));
    names.filter((n) => !keep.has(n)).forEach((n) => fs.rmSync(path.join(G.versionsDir, n), { recursive: true, force: true }));
    fs.readdirSync(G.versionsDir).filter((n) => n.includes('.tmp-')).forEach((n) => fs.rmSync(path.join(G.versionsDir, n), { recursive: true, force: true }));
  } catch (_) { /* nothing to tidy */ }
}

function restart() { app.relaunch(); app.exit(0); }

module.exports = { check, markGood, restart, RELEASES_PAGE };

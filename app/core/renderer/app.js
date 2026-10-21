// 原神 育成トラッカー — page logic. Data lives in SQLite (sql.js); the main process writes the file to disk.
(function () {
'use strict';
const D = window.GT_DATA;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const ASC = ['Lv.1〜20', 'Lv.20〜40', 'Lv.40〜50', 'Lv.50〜60', 'Lv.60〜70', 'Lv.70〜80', 'Lv.80〜90'];
const BOSS_COST = [0, 0, 2, 4, 8, 12, 20];            // boss drops needed to reach each ascension stage
const TAL_COST = [0, 3, 6, 12, 18, 27, 36, 54, 108, 144]; // books (in 教え units) to go from L to L+1
const SLOTS = ['花', '羽', '砂', '杯', '冠'];
const TAL = ['通常', 'スキル', '爆発'];
const DEF = { resin: 180, bossDrop: 2.6, bookDrop: 10, art: '', prio: 'team', fragile: 0, frPerDay: 1, frSince: '', sky: 'auto', dayStyle: 'gold' };
const RESPAWN_DAYS = 2;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const hash = (s) => { let h = 5381; for (const ch of String(s)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return h.toString(36); };

// ---------------- dates (the game day switches at 5:00) ----------------
function gameToday() { const d = new Date(Date.now() - 5 * 3600e3); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addD(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function key(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fromKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function weekKey(d) { return key(addD(d, -((d.getDay() + 6) % 7))); }
function fmt(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD[d.getDay()] + '）'; }
function fmtTime(ts) { const d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate() + '（' + WD[d.getDay()] + '）' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }
function left(ms) { const m = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(m / 60), mm = m % 60; return 'あと' + (h ? h + '時間' : '') + (mm || !h ? mm + '分' : ''); }

// ---------------- sky of the day ----------------
// dawn 5:00 / day 10:00 / akane 15:30 / twilight 17:00 / sunset 18:00 / night 19:30
const SKY_TIMES = [[300, 'dawn'], [600, 'day'], [930, 'akane'], [1020, 'twilight'], [1080, 'sunset'], [1170, 'night']];
const GREET = { dawn: 'おはよう、旅人', day: 'こんにちは、旅人', akane: 'もうすぐ夕方、旅人', twilight: 'おつかれさま、旅人', sunset: 'おつかれさま、旅人', night: '旅人、おかえりなさい' };
function skySlot(d) {
  const m = d.getHours() * 60 + d.getMinutes();
  let slot = 'night';
  SKY_TIMES.forEach(([t, k]) => { if (m >= t) slot = k; });
  return slot;
}
function applySky() {
  const slot = S.sky && S.sky !== 'auto' ? S.sky : skySlot(new Date());
  const sky = slot === 'day' ? 'day-' + (S.dayStyle || 'gold') : slot;
  const tone = ['twilight', 'sunset', 'night'].includes(slot) ? 'dark' : 'light';
  document.documentElement.dataset.sky = sky;
  document.documentElement.dataset.tone = tone;
  return { slot, sky, tone };
}

// ---------------- SQLite ----------------
let SQL = null, db = null, saveTimer = null, saveChain = Promise.resolve();
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS characters(
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  book TEXT, book_days TEXT, book_dom TEXT,
  boss TEXT, weekly TEXT, wmat TEXT,
  sp TEXT, sp_area TEXT, enemy TEXT, enemy_area TEXT,
  art TEXT, art_dom TEXT, art_note TEXT, tal_note TEXT,
  def_tgt TEXT DEFAULT '1,9,9',
  custom INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS roster(
  char_id TEXT PRIMARY KEY REFERENCES characters(id),
  sort INTEGER NOT NULL DEFAULT 0, team INTEGER NOT NULL DEFAULT 1,
  asc_stage INTEGER NOT NULL DEFAULT 0,
  cur_na INTEGER NOT NULL DEFAULT 1, cur_skill INTEGER NOT NULL DEFAULT 1, cur_burst INTEGER NOT NULL DEFAULT 1,
  tgt_na INTEGER NOT NULL DEFAULT 1, tgt_skill INTEGER NOT NULL DEFAULT 9, tgt_burst INTEGER NOT NULL DEFAULT 9,
  art_slots TEXT NOT NULL DEFAULT '00000');
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS checks(day TEXT NOT NULL, scope TEXT NOT NULL, item TEXT NOT NULL, checked INTEGER NOT NULL, checked_at INTEGER, PRIMARY KEY(day, scope, item));
CREATE TABLE IF NOT EXISTS day_totals(day TEXT PRIMARY KEY, total INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS picks(item TEXT PRIMARY KEY, picked_at INTEGER NOT NULL);
`;
function q(sql, p) { const st = db.prepare(sql); try { st.bind(p || []); const out = []; while (st.step()) out.push(st.getAsObject()); return out; } finally { st.free(); } }
function run(sql, p) { db.run(sql, p || []); persist(); }
function setSave(t) { $('saveState').textContent = t; }
function persist() { clearTimeout(saveTimer); setSave('保存中…'); saveTimer = setTimeout(flush, 350); }
function flush() {
  clearTimeout(saveTimer); saveTimer = null;
  const bytes = db.export();
  saveChain = saveChain.then(() => window.api.save(bytes))
    .then((r) => setSave(r && r.ok ? '保存しました' : '保存できませんでした。もう一度操作してください'))
    .catch(() => setSave('保存できませんでした。もう一度操作してください'));
  return saveChain;
}
window.addEventListener('beforeunload', () => { if (saveTimer) flush(); });

function presetRow(p) {
  const b = D.books.find((x) => x.book === p.book) || { days: [], dom: '' };
  return [p.id, p.name, p.book, b.days.join(','), b.dom, p.boss, p.weekly, p.wmat, p.sp, p.spArea, p.enemy, p.enemyArea, p.art, p.artDom, p.artNote, p.tal, p.tgt.join(',')];
}
function migrate() {
  db.run(SCHEMA);
  db.run("INSERT OR IGNORE INTO meta(key,value) VALUES('schema','1')");
  // Presets: add missing ones; refresh untouched ones so app updates can fix data. Edited presets (custom=1) are kept.
  D.presets.forEach((p) => {
    const r = presetRow(p);
    db.run(`INSERT OR IGNORE INTO characters(id,name,book,book_days,book_dom,boss,weekly,wmat,sp,sp_area,enemy,enemy_area,art,art_dom,art_note,tal_note,def_tgt,custom) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`, r);
    db.run(`UPDATE characters SET name=?,book=?,book_days=?,book_dom=?,boss=?,weekly=?,wmat=?,sp=?,sp_area=?,enemy=?,enemy_area=?,art=?,art_dom=?,art_note=?,tal_note=?,def_tgt=? WHERE id=? AND custom=0`, r.slice(1).concat([r[0]]));
  });
}

// ---------------- in-memory state (mirrors the database) ----------------
let CHARS = {}, ROSTER = [], CH = [], P = {}, S = {}, CHECKS = {}, WEEKLY = {}, PICKS = {};
function loadAll() {
  CHARS = {}; q('SELECT * FROM characters').forEach((c) => { CHARS[c.id] = c; });
  ROSTER = q('SELECT * FROM roster ORDER BY sort, rowid').filter((r) => CHARS[r.char_id]);
  S = Object.assign({}, DEF);
  q('SELECT key,value FROM settings').forEach((r) => { try { S[r.key] = JSON.parse(r.value); } catch (_) { /* ignore bad row */ } });
  CHECKS = {}; WEEKLY = {};
  const since = key(addD(gameToday(), -70));
  q('SELECT day,total FROM day_totals WHERE day>=?', [since]).forEach((r) => { (CHECKS[r.day] || (CHECKS[r.day] = { ids: {}, opt: {}, total: 0 })).total = r.total; });
  q('SELECT day,scope,item,checked FROM checks WHERE day>=?', [since]).forEach((r) => {
    if (r.scope === 'w') { (WEEKLY[r.day] || (WEEKLY[r.day] = {}))[r.item] = !!r.checked; return; }
    const c = CHECKS[r.day] || (CHECKS[r.day] = { ids: {}, opt: {}, total: 0 });
    (r.scope === 'o' ? c.opt : c.ids)[r.item] = !!r.checked;
  });
  PICKS = {}; q('SELECT item,picked_at FROM picks').forEach((r) => { PICKS[r.item] = r.picked_at; });
  buildCH();
}
function buildCH() {
  CH = ROSTER.map((r, i) => {
    const c = CHARS[r.char_id];
    const days = String(c.book_days || '').split(',').filter((x) => x !== '').map(Number);
    return { id: c.id, name: c.name, c: 'var(--c' + (i % 8 + 1) + ')', days: days.concat([0]), book: c.book || '', dom: c.book_dom || '天賦秘境',
      boss: c.boss || '', weekly: c.weekly || '', wmat: c.wmat || '', sp: c.sp || '', spArea: c.sp_area || '', enemy: c.enemy || '', enemyArea: c.enemy_area || '',
      art: c.art || '', artDom: c.art_dom || '', artNote: c.art_note || '', tal: c.tal_note || '', team: r.team };
  });
  P = {};
  ROSTER.forEach((r) => {
    P[r.char_id] = { asc: r.asc_stage, cur: [r.cur_na, r.cur_skill, r.cur_burst], tgt: [r.tgt_na, r.tgt_skill, r.tgt_burst],
      art: String(r.art_slots || '00000').padEnd(5, '0').split('').slice(0, 5).map((x) => x === '1') };
  });
}
function setSetting(k, v) { S[k] = v; run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', [k, JSON.stringify(v)]); }
function saveProgress(id) {
  const p = P[id];
  run('UPDATE roster SET asc_stage=?,cur_na=?,cur_skill=?,cur_burst=?,tgt_na=?,tgt_skill=?,tgt_burst=?,art_slots=? WHERE char_id=?',
    [p.asc, p.cur[0], p.cur[1], p.cur[2], p.tgt[0], p.tgt[1], p.tgt[2], p.art.map((x) => (x ? '1' : '0')).join(''), id]);
}
function setCheck(scope, day, item, on) {
  db.run('INSERT OR REPLACE INTO checks(day,scope,item,checked,checked_at) VALUES(?,?,?,?,?)', [day, scope, item, on ? 1 : 0, Date.now()]);
  if (scope === 'w') { (WEEKLY[day] || (WEEKLY[day] = {}))[item] = on; }
  else {
    const c = CHECKS[day] || (CHECKS[day] = { ids: {}, opt: {}, total: 0 });
    (scope === 'o' ? c.opt : c.ids)[item] = on;
    if (scope === 'd') { c.total = todayItems.length; db.run('INSERT OR REPLACE INTO day_totals(day,total) VALUES(?,?)', [day, c.total]); }
  }
  if (scope === 'd' && item.startsWith('sp-')) {
    if (on) { PICKS[item] = Date.now(); db.run('INSERT OR REPLACE INTO picks(item,picked_at) VALUES(?,?)', [item, PICKS[item]]); }
    else { delete PICKS[item]; db.run('DELETE FROM picks WHERE item=?', [item]); }
  }
  persist();
}

// ---------------- planning ----------------
function needs(id) {
  const p = P[id]; let boss = 0, book = 0;
  for (let a = p.asc + 1; a <= 6; a++) boss += BOSS_COST[a];
  for (let i = 0; i < 3; i++) for (let l = p.cur[i]; l < p.tgt[i]; l++) book += TAL_COST[l];
  return { boss, book };
}
function totalNeed(id) {
  const p = P[id]; let boss = 0, book = 0;
  for (let a = 1; a <= 6; a++) boss += BOSS_COST[a];
  for (let i = 0; i < 3; i++) for (let l = 1; l < p.tgt[i]; l++) book += TAL_COST[l];
  return { boss, book };
}
const hasNeed = (id) => { const n = needs(id); return n.boss > 0 || n.book > 0; };
function artSets() {
  const m = {};
  CH.forEach((c) => { if (!c.art) return; const a = m[c.art] || (m[c.art] = { t: c.art, dom: c.artDom || '聖遺物の秘境', who: [], c: c.c }); a.who.push(c.name); });
  return m;
}
function leftoverSet() { const m = artSets(); return m[S.art] || m[Object.keys(m)[0]] || null; }

function fragileLeft(day) {
  const since = S.frSince || key(day), tk = key(day), per = Math.max(1, Math.round(+S.frPerDay || 1));
  let used = 0;
  Object.keys(CHECKS).forEach((k) => { if (k >= since && k < tk && CHECKS[k].ids.fr) used += per; });
  return Math.max(0, Math.round(+S.fragile || 0) - used);
}

function simulate(start) {
  const R0 = Math.max(40, +S.resin || 180), bd = Math.max(0.5, +S.bossDrop || 2.6), kd = Math.max(1, +S.bookDrop || 10);
  const N = {}; CH.forEach((c) => { N[c.id] = needs(c.id); });
  const done = {}; CH.forEach((c) => { if (N[c.id].boss <= 0 && N[c.id].book <= 0) done[c.id] = -1; });
  const days = []; let frLeft = fragileLeft(start); const frDay = Math.max(1, Math.round(+S.frPerDay || 1));
  const A = leftoverSet();
  for (let i = 0; i < 400; i++) {
    const d = addD(start, i), wd = d.getDay(); let R = R0; const items = [];
    const anyNeed = CH.some((c) => N[c.id].boss > 0 || N[c.id].book > 0);
    if (frLeft > 0 && anyNeed) {
      const u = Math.min(frDay, frLeft); frLeft -= u; R += 60 * u;
      items.push({ id: 'fr', kind: 'f', color: 'var(--gold)', runs: u, t: '脆弱樹脂を ' + u + ' 個使う', s: '樹脂＋' + (60 * u) + ' ・ 使ったあと残り ' + frLeft + ' 個', resin: 0 });
    }
    const tRuns = {}, bRuns = {};
    // "team": finish priority-1 characters first (their books, then bosses), then the rest. "all": everyone shares each day.
    const tiers = S.prio === 'all' ? [CH] : [CH.filter((c) => c.team === 1), CH.filter((c) => c.team !== 1)];
    tiers.forEach((tier) => {
      let avail = tier.filter((c) => c.days.includes(wd) && N[c.id].book > 0);
      while (R >= 20 && avail.length) {
        avail.sort((a, b) => N[b.id].book - N[a.id].book); const c = avail[0];
        tRuns[c.id] = (tRuns[c.id] || 0) + 1; N[c.id].book -= kd; R -= 20; avail = avail.filter((x) => N[x.id].book > 0);
      }
      let bAvail = tier.filter((c) => N[c.id].boss > 0);
      while (R >= 40 && bAvail.length) {
        if (S.prio === 'all') bAvail.sort((a, b) => N[b.id].boss - N[a.id].boss);
        const c = bAvail[0]; bRuns[c.id] = (bRuns[c.id] || 0) + 1; N[c.id].boss -= bd; R -= 40; bAvail = tier.filter((x) => N[x.id].boss > 0);
      }
    });
    CH.forEach((c) => { if (tRuns[c.id]) items.push({ id: 't-' + c.id, kind: 't', ch: c, color: c.c, runs: tRuns[c.id], t: (c.book ? c.book + 'の' : '') + '天賦秘境 ×' + tRuns[c.id], s: c.name + ' ・ ' + c.dom, resin: tRuns[c.id] * 20 }); });
    CH.forEach((c) => { if (bRuns[c.id]) items.push({ id: 'b-' + c.id, kind: 'b', ch: c, color: c.c, runs: bRuns[c.id], t: (c.boss || '突破ボス') + ' ×' + bRuns[c.id], s: c.name + 'の突破素材', resin: bRuns[c.id] * 40 }); });
    const a = Math.floor(R / 20);
    if (a > 0 && A) items.push({ id: 'a', kind: 'a', color: A.c, art: A, runs: a, t: A.t + ' ×' + a, s: A.who.join('・') + 'の聖遺物 ・ ' + A.dom, resin: a * 20 });
    days.push({ d, items });
    CH.forEach((c) => { if (done[c.id] === undefined && N[c.id].boss <= 0 && N[c.id].book <= 0) done[c.id] = i; });
    if (i >= 13 && CH.every((c) => done[c.id] !== undefined)) break;
  }
  return { days, done };
}

// ---------------- checklist items ----------------
function mapItems() {
  const out = [{ id: 'daily', t: 'デイリー依頼 4つ＋冒険者協会で報告', s: '原石と冒険経験', tag: '毎日', color: 'var(--muted)' }];
  const enemies = {};
  CH.forEach((c) => { if (!c.enemy || !hasNeed(c.id)) return; (enemies[c.enemy] || (enemies[c.enemy] = { area: c.enemyArea, who: [], color: c.c })).who.push(c.name); });
  Object.keys(enemies).forEach((e) => {
    const g = enemies[e];
    out.push({ id: 'en-' + hash(e), t: (g.area ? g.area + 'で' : '') + e + 'を倒す', s: '突破と天賦の素材 ・ ' + g.who.join('と') + 'に使う', tag: g.who.length > 1 ? g.who.length + '人分' : g.who[0], color: g.color });
  });
  CH.forEach((c) => {
    if (!c.sp || P[c.id].asc >= 6) return;
    out.push({ id: 'sp-' + c.id, respawn: RESPAWN_DAYS, t: c.sp + 'を拾う' + (c.spArea ? '（' + c.spArea + '）' : ''), s: c.name + 'の突破 ・ 取ってから48時間で復活', tag: c.name, color: c.c });
  });
  return out;
}
function weekItems() {
  return CH.filter((c) => { const p = P[c.id]; return p.cur.some((v, i) => p.tgt[i] >= 7 && v < p.tgt[i]); })
    .map((c) => ({ id: 'w-' + c.id, t: c.weekly ? '週ボス：' + c.weekly : '週ボス（' + (c.wmat || '天賦7以上の素材') + '）', s: (c.wmat ? c.wmat + ' ・ ' : '') + c.name + 'の天賦7以上に必要', tag: c.name, color: c.c }));
}
function artItems() {
  const bySet = {};
  CH.forEach((c) => { if (!c.art) return; const miss = SLOTS.filter((_, i) => !P[c.id].art[i]); if (!miss.length) return; (bySet[c.art] || (bySet[c.art] = { dom: c.artDom, g: [] })).g.push({ c, miss }); });
  const out = Object.keys(bySet).map((k) => {
    const b = bySet[k];
    return { id: 'o-' + hash(k), t: k + 'の秘境を1回以上', s: (b.dom ? b.dom + ' ・ ' : '') + '足りない部位：' + b.g.map((x) => x.c.name + '（' + x.miss.join('・') + '）').join('、'), tag: b.g.map((x) => x.c.name).join('・'), color: b.g[0].c.c };
  });
  if (out.length) out.push({ id: 'o-lvl', t: '取れた聖遺物を強化して、いらない分は分解する', s: '分解した欠片は廻聖（狙った部位を作る機能）に使える', tag: '整理', color: 'var(--muted)' });
  return out;
}
function lastChecked(id, beforeKey) {
  let best = null;
  Object.keys(CHECKS).forEach((k) => { if (k < beforeKey && CHECKS[k].ids[id] && (!best || k > best)) best = k; });
  return best ? fromKey(best) : null;
}
// When a pickup is back: 48h after the pick time; for a check saved without a time, 2 days after that game day's 5:00.
function readyAt(it) {
  if (PICKS[it.id]) return PICKS[it.id] + it.respawn * 864e5;
  const last = lastChecked(it.id, key(addD(gameToday(), 1))); if (!last) return null;
  const r = addD(last, it.respawn); r.setHours(5, 0, 0, 0); return r.getTime();
}

// ---------------- rendering ----------------
const STAR_PATH = 'M12 1c.6 5.4 2.4 8.4 11 11-8.6 2.6-10.4 5.6-11 11-.6-5.4-2.4-8.4-11-11 8.6-2.6 10.4-5.6 11-11z';
const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="' + STAR_PATH + '"/></svg>';
let lastToggled = null; // only the box the viewer just ticked gets the stamp animation
function chkRow(scope, it, on) {
  const id = 'k-' + scope + '-' + it.id;
  return '<label class="chk" for="' + id + '"><input type="checkbox" id="' + id + '" data-scope="' + scope + '" data-id="' + esc(it.id) + '"' + (on ? ' checked' : '') + '><span class="box">' + CHECK_SVG + '</span>' +
    '<span class="tx"><span class="t">' + esc(it.t) + '</span><span class="s">' + esc(it.s) + (it.resin ? ' ・ ' + it.resin + ' 樹脂' : '') + '</span></span>' +
    (it.tag ? '<span class="tag" style="--c:' + it.color + '">' + esc(it.tag) + '</span>' : '') + '</label>';
}
let todayItems = [];
function render() {
  const today = gameToday(), tk = key(today), wk = weekKey(today), now = Date.now();
  $('today').textContent = today.getFullYear() + '年' + fmt(today);
  const skyNow = applySky();
  $('hello').textContent = GREET[skyNow.slot];
  $('teamLine').textContent = CH.length ? 'いま育てている：' + CH.map((c) => c.name).join('、') : 'まだ誰も育てていません';
  const sim = simulate(today);

  // summary
  if (!CH.length) { $('daysLeft').innerHTML = '–'; $('endDate').textContent = '育てるキャラを追加すると計算します'; $('charSum').innerHTML = ''; }
  else {
    const ends = CH.map((c) => (sim.done[c.id] === undefined ? 399 : sim.done[c.id]));
    const maxEnd = Math.max.apply(null, ends);
    if (maxEnd < 0) { $('daysLeft').innerHTML = '0<small>日</small>'; $('endDate').textContent = 'みんな目標まで育ちました。おつかれさま'; }
    else { $('daysLeft').innerHTML = (maxEnd + 1) + '<small>日</small>'; $('endDate').textContent = fmt(addD(today, maxEnd)) + 'ごろ'; }
    $('charSum').innerHTML = CH.map((c, ix) => {
      const n = needs(c.id), t = totalNeed(c.id), tot = t.boss + t.book, rem = n.boss + n.book, pct = tot ? Math.round(100 * (1 - rem / tot)) : 100, e = ends[ix];
      return '<div class="cs" style="--c:' + c.c + '"><span class="nm"><span class="dot"></span>' + esc(c.name) + '</span><div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<span class="d">' + (e < 0 ? '<span class="done">完了</span>' : 'あと <b>' + (e + 1) + '</b>日 ・ ' + fmt(addD(today, e))) + '</span></div>';
    }).join('');
  }

  // today's checklist
  const ck = (CHECKS[tk] && CHECKS[tk].ids) || {}, ock = (CHECKS[tk] && CHECKS[tk].opt) || {}, wck = WEEKLY[wk] || {};
  const day0 = sim.days[0] || { items: [] };
  const rItems = day0.items.map((it) => Object.assign({}, it, { tag: { a: '聖遺物', t: '天賦', b: '突破', f: '樹脂回復' }[it.kind] }));
  const waiting = [];
  const mItems = mapItems().map((it) => {
    if (!it.respawn) return it;
    const r = readyAt(it);
    if (ck[it.id] && r && r > now) return Object.assign({}, it, { s: it.s.replace(/ ・ 取ってから48時間で復活$/, '') + ' ・ 復活まで' + left(r - now) + '（' + fmtTime(r) + '）' });
    if (!r || r <= now) return it;
    waiting.push({ it, r }); return null;
  }).filter(Boolean);
  const wItems = weekItems(), oItems = artItems();
  $('listResin').innerHTML = rItems.length ? rItems.map((it) => chkRow('d', it, ck[it.id])).join('') : '<p class="empty">キャラを追加すると、今日の樹脂の使い道が出ます。</p>';
  $('resinSum').textContent = day0.items.reduce((a, b) => a + b.resin, 0) + ' 樹脂';
  $('listMap').innerHTML = mItems.map((it) => chkRow('d', it, ck[it.id])).join('');
  $('waitMap').hidden = !waiting.length;
  $('waitMap').textContent = waiting.length ? '復活待ち：' + waiting.sort((a, b) => a.r - b.r).map((w) => w.it.t.replace(/を拾う.*$/, '') + ' ' + left(w.r - now) + '（' + fmtTime(w.r) + '）').join('、') : '';
  $('listWeek').innerHTML = wItems.length ? wItems.map((it) => chkRow('w', it, wck[it.id])).join('') : '<p class="empty">天賦7以上を目指しているキャラがいないので、今は不要です。</p>';
  $('weekLabel').textContent = fmt(fromKey(wk)) + '〜';
  $('listArt').innerHTML = oItems.length ? oItems.map((it) => chkRow('o', it, ock[it.id])).join('') : '<p class="empty">' + (CH.length ? '全員の聖遺物の部位が揃っています。' : 'キャラを追加すると表示されます。') + '</p>';
  $('optDone').textContent = oItems.filter((it) => ock[it.id]).length; $('optTotal').textContent = oItems.length;
  todayItems = rItems.concat(mItems);
  pushOverlay(rItems, mItems, wItems, waiting, ck, wck, now);
  $('pDone').textContent = todayItems.filter((it) => ck[it.id]).length; $('pTotal').textContent = todayItems.length;

  if (lastToggled && $(lastToggled)) $(lastToggled).closest('.chk').classList.add('pop');
  lastToggled = null;
  renderCards();
  renderAddSel();

  // plan
  $('plan').innerHTML = sim.days.length ? sim.days.slice(0, 14).map((dd, i) => {
    const pills = (k) => dd.items.filter((it) => it.kind === k).map((it) => '<span class="pill" style="--c:' + it.color + '">' + esc(k === 'a' ? it.art.t + ' ×' + it.runs : (k === 't' ? it.ch.name + ' ' + it.ch.book : it.ch.name) + ' ×' + it.runs) + '</span>').join('') || '<span class="muted">–</span>';
    const fr = dd.items.find((it) => it.kind === 'f');
    return '<tr class="' + (i === 0 ? 'today' : '') + '"><td class="day' + (dd.d.getDay() === 0 ? ' wd0' : '') + '">' + (i === 0 ? '今日 ' : '') + fmt(dd.d) + (fr ? '<br><span class="pill" style="--c:var(--gold)">脆弱樹脂 ×' + fr.runs + '</span>' : '') + '</td><td>' + pills('t') + '</td><td>' + pills('b') + '</td><td>' + pills('a') + '</td></tr>';
  }).join('') : '<tr><td colspan="4" class="muted">キャラを追加すると予定が出ます。</td></tr>';

  // history
  let h = '';
  for (let i = 13; i >= 0; i--) {
    const d = addD(today, -i), c = CHECKS[key(d)]; let r = 0;
    if (c && c.total) r = Math.min(1, Object.values(c.ids).filter(Boolean).length / c.total);
    const full = r >= 1;
    h += '<div class="hd2" title="' + fmt(d) + ' ' + Math.round(r * 100) + '%"><span class="sq' + (full ? ' full' : '') + '">' + (full ? CHECK_SVG : '<i style="height:' + Math.round(r * 100) + '%"></i>') + '</span><span>' + d.getDate() + '</span></div>';
  }
  $('hist').innerHTML = h;
  let streak = 0;
  for (let i = 0; i < 70; i++) {
    const c = CHECKS[key(addD(today, -i))];
    const full = c && c.total && Object.values(c.ids).filter(Boolean).length >= c.total;
    if (full) streak++; else if (i === 0) continue; else break;
  }
  $('streak').textContent = streak;

  // settings
  const setv = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
  setv('s-resin', S.resin); setv('s-boss', S.bossDrop); setv('s-book', S.bookDrop);
  setv('s-fr', fragileLeft(today)); setv('s-sky', S.sky || 'auto'); setv('s-dayStyle', S.dayStyle || 'gold'); setv('s-frday', S.frPerDay || 1); setv('s-prio', S.prio || 'team');
  const sets = artSets(), cur = leftoverSet();
  if (document.activeElement !== $('s-art')) {
    $('s-art').innerHTML = Object.keys(sets).length ? Object.keys(sets).map((k) => '<option value="' + esc(k) + '">' + esc(k + '（' + sets[k].who.join('・') + '）') + '</option>').join('') : '<option value="">キャラを追加してください</option>';
    $('s-art').value = cur ? cur.t : '';
  }
}

// ---------------- overlay feed ----------------
// The overlay window has no database of its own: it shows this list and sends checks back here.
function pushOverlay(rItems, mItems, wItems, waiting, ck, wck, now) {
  if (!window.api.ovPush) return;
  const pack = (sec, scope, list, on) => list.map((it) => ({ sec, scope, id: it.id, t: it.t, s: it.s + (it.resin ? ' ・ ' + it.resin + ' 樹脂' : ''), tag: it.tag || '', color: it.color || 'var(--muted)', on: !!on[it.id] }));
  const items = pack('樹脂でまわる', 'd', rItems, ck).concat(pack('マップ', 'd', mItems, ck), pack('今週の週ボス', 'w', wItems, wck));
  const ts = waiting.slice().sort((a, b) => a.r - b.r);
  window.api.ovPush({
    days: (/^\d/.test($('daysLeft').textContent) ? 'あと' : '') + $('daysLeft').textContent.replace(/\s+/g, ''),
    sky: document.documentElement.dataset.sky, tone: document.documentElement.dataset.tone,
    done: items.filter((x) => x.on).length, total: items.length, items,
    emptyText: CH.length ? 'きょうのやることはありません。' : 'メイン画面で育てるキャラを追加してください。',
    timers: ts.length ? '復活待ち：' + ts.map((w) => w.it.t.replace(/を拾う.*$/, '') + ' ' + left(w.r - now)).join('、') : '',
    nextTimer: ts.length ? '次の復活 ' + left(ts[0].r - now) : ''
  });
}
function showOvStatus(c) {
  if (!c) return;
  $('ovBtn').textContent = c.visible ? 'ゲーム中の表示を隠す' : 'ゲーム中の表示';
  const bad = c.hotkeyOk && (c.hotkeyOk.toggle === false || c.hotkeyOk.through === false);
  $('ovNote').textContent = bad ? 'ショートカットの一部を、ほかのアプリが先に使っています。ボタンから操作してください。' : '';
}

// ---------------- updates ----------------
function showUpdate(st) {
  if (!st) return;
  const msg = {
    latest: '最新のバージョンです（' + st.current + '）。',
    offline: 'いまは確認できませんでした。インターネットにつながっているときに、また確認します。',
    ready: 'バージョン ' + st.version + ' の準備ができました。次に開いたときに切りかわります。',
    manual: 'バージョン ' + st.version + ' は、ダウンロードし直しが必要です。',
    error: st.message || '確認できませんでした。'
  }[st.status] || '';
  $('updMsg').textContent = msg;
  if (st.status === 'manual') $('updMsg').insertAdjacentHTML('beforeend', ' <button type="button" class="btn small" id="pageBtn">配布ページを開く</button>');
  if (st.status === 'ready') {
    $('toastText').textContent = '新しいバージョン ' + st.version + ' の準備ができました。次に開いたときに切りかわります。' + (st.notes ? '（' + st.notes + '）' : '');
    $('toast').hidden = false;
  }
}

// character cards are rebuilt only when the roster changes, so open dropdowns are never replaced mid-use
let cardsSig = null;
function opts(a, b) { let o = ''; for (let i = a; i <= b; i++) o += '<option value="' + i + '">' + i + '</option>'; return o; }
function renderCards() {
  const sig = CH.map((c) => c.id + ':' + c.name + ':' + c.c + ':' + c.team + ':' + c.artNote + ':' + c.tal + ':' + c.book + ':' + c.boss).join('|');
  if (sig !== cardsSig) {
    cardsSig = sig;
    $('cards').innerHTML = CH.length ? CH.map(cardHTML).join('') : onboardHTML();
  }
  CH.forEach((c) => {
    const p = P[c.id];
    $('asc-' + c.id).value = p.asc; $('team-' + c.id).value = c.team;
    for (let i = 0; i < 3; i++) { $('cur-' + c.id + i).value = p.cur[i]; $('tgt-' + c.id + i).value = p.tgt[i]; }
    for (let i = 0; i < 5; i++) $('sl-' + c.id + i).checked = !!p.art[i];
    const n = needs(c.id);
    $('st-' + c.id).innerHTML = (n.boss <= 0 && n.book <= 0) ? '<span class="done">目標まで完了</span>' :
      '<span>ボス あと約<b class="num"> ' + Math.max(0, Math.ceil(n.boss / (+S.bossDrop || 2.6))) + ' </b>回</span>' +
      '<span>天賦秘境 あと約<b class="num"> ' + Math.max(0, Math.ceil(n.book / (+S.bookDrop || 10))) + ' </b>回</span>' +
      '<span>本の曜日 <b>' + c.days.filter((x) => x).map((x) => WD[x]).join('・') + (c.days.length > 1 ? '・' : '') + '日</b></span>';
  });
}
function cardHTML(c) {
  const id = esc(c.id);
  return '<div class="card" style="--c:' + c.c + '"><div class="hd"><b>' + esc(c.name) + '</b><span class="acts">' +
    '<label class="small" for="team-' + id + '">優先</label><select id="team-' + id + '" data-c="' + id + '" data-f="team"><option value="1">先に育てる</option><option value="2">後で育てる</option></select>' +
    '<button type="button" class="btn ghost small" data-edit="' + id + '">編集</button>' +
    '<button type="button" class="btn ghost small" data-remove="' + id + '">外す</button></span></div>' +
    '<div class="confirm" id="rm-' + id + '" hidden><span>' + esc(c.name) + 'を育成リストから外しますか？進み具合の記録も消えます。</span><span class="addrow"><button type="button" class="btn danger" data-remove-yes="' + id + '">外す</button><button type="button" class="btn ghost" data-remove-no="' + id + '">やめる</button></span></div>' +
    '<div class="small">' + esc((c.book ? c.book + ' ・ ' : '') + (c.boss || '突破ボス未設定')) + '</div>' +
    '<div class="row"><label for="asc-' + id + '">レベル <select id="asc-' + id + '" data-c="' + id + '" data-f="asc">' + ASC.map((t, i) => '<option value="' + i + '">' + t + (i === 6 ? '（突破完了）' : '') + '</option>').join('') + '</select></label></div>' +
    '<div class="tal">' + TAL.map((t, i) => '<div class="tl"><span>' + t + '</span><span class="sel"><select id="cur-' + id + i + '" aria-label="' + esc(c.name) + ' ' + t + ' 現在" data-c="' + id + '" data-f="cur" data-i="' + i + '">' + opts(1, 10) + '</select>→<select id="tgt-' + id + i + '" aria-label="' + esc(c.name) + ' ' + t + ' 目標" data-c="' + id + '" data-f="tgt" data-i="' + i + '">' + opts(1, 10) + '</select></span></div>').join('') + '</div>' +
    '<div class="stat" id="st-' + id + '"></div>' +
    (c.tal ? '<div class="small">天賦の優先：' + esc(c.tal) + '</div>' : '') +
    (c.art || c.artNote ? '<div class="small">聖遺物の目標：' + esc(c.artNote || c.art) + '</div>' : '') +
    '<div class="slots"><span class="small">揃った部位</span>' + SLOTS.map((s, i) => '<input type="checkbox" id="sl-' + id + i + '" data-c="' + id + '" data-slot="' + i + '"><label for="sl-' + id + i + '">' + s + '</label>').join('') + '</div></div>';
}
function onboardHTML() {
  const t = D.starterTeam;
  return '<div class="onboard"><b>まずは育てるキャラを選ぼう</b><p class="small">上の欄からキャラを選んで「追加」を押すと、きょうのやることと完成までの日数が出ます。一覧にいないキャラは「キャラを登録」で素材を入れると追加できます。</p>' +
    '<div class="addrow"><button type="button" class="btn" id="starterBtn">おすすめ編成をまとめて追加</button><span class="small">' + esc(t.name) + '</span></div></div>';
}
function renderAddSel() {
  const inRoster = new Set(ROSTER.map((r) => r.char_id));
  const list = Object.values(CHARS).filter((c) => !inRoster.has(c.id)).sort((a, b) => a.custom - b.custom || a.name.localeCompare(b.name, 'ja'));
  const sig = list.map((c) => c.id + c.name).join('|');
  if ($('addSel').dataset.sig === sig) return;
  $('addSel').dataset.sig = sig;
  $('addSel').innerHTML = list.length ? list.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + (c.custom ? '（登録済み）' : '') + '</option>').join('') : '<option value="">追加できるキャラはいません</option>';
  $('addBtn').disabled = !list.length;
}

// ---------------- roster edits ----------------
function addToRoster(id, team) {
  const ch = CHARS[id] || q('SELECT * FROM characters WHERE id=?', [id])[0]; // a just-registered character isn't in CHARS yet
  if (!ch || ROSTER.some((r) => r.char_id === id)) return;
  const tgt = String(ch.def_tgt || '1,9,9').split(',').map(Number);
  const sort = ROSTER.length ? Math.max.apply(null, ROSTER.map((r) => r.sort)) + 1 : 0;
  db.run('INSERT INTO roster(char_id,sort,team,tgt_na,tgt_skill,tgt_burst) VALUES(?,?,?,?,?,?)', [id, sort, team || 1, tgt[0] || 1, tgt[1] || 9, tgt[2] || 9]);
}
function reload() { loadAll(); render(); }

// ---------------- events ----------------
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('input[type=checkbox][data-scope]')) {
    const today = gameToday();
    setCheck(el.dataset.scope, el.dataset.scope === 'w' ? weekKey(today) : key(today), el.dataset.id, el.checked);
    if (el.checked) lastToggled = el.id;
    render(); return;
  }
  if (el.matches('input[data-slot]')) { P[el.dataset.c].art[+el.dataset.slot] = el.checked; saveProgress(el.dataset.c); render(); return; }
  if (el.matches('select[data-c]')) {
    const id = el.dataset.c, v = +el.value, p = P[id];
    if (el.dataset.f === 'team') { run('UPDATE roster SET team=? WHERE char_id=?', [v, id]); reload(); return; }
    if (el.dataset.f === 'asc') p.asc = v;
    else { const i = +el.dataset.i; p[el.dataset.f][i] = v; if (el.dataset.f === 'cur' && p.tgt[i] < v) p.tgt[i] = v; if (el.dataset.f === 'tgt' && p.cur[i] > v) p.cur[i] = v; }
    saveProgress(id); render(); return;
  }
  if (el.id === 's-art') { setSetting('art', el.value); render(); return; }
  if (el.id === 's-prio') { setSetting('prio', el.value); render(); return; }
  if (el.id === 's-sky') { setSetting('sky', el.value); render(); return; }
  if (el.id === 's-dayStyle') { setSetting('dayStyle', el.value); render(); return; }
});
document.addEventListener('input', (e) => {
  const el = e.target; if (!el.id || !el.id.startsWith('s-') || el.tagName !== 'INPUT') return;
  const v = parseFloat(el.value);
  if (el.id === 's-fr') { if (!(v >= 0)) return; setSetting('fragile', Math.round(v)); setSetting('frSince', key(gameToday())); render(); return; }
  if (el.id === 's-frday') { if (!(v >= 1)) return; setSetting('frPerDay', Math.round(v)); render(); return; }
  if (!(v > 0)) return;
  setSetting({ 's-resin': 'resin', 's-boss': 'bossDrop', 's-book': 'bookDrop' }[el.id], v); render();
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'addBtn') { const id = $('addSel').value; if (id) { addToRoster(id, 1); persist(); reload(); } return; }
  if (b.id === 'starterBtn') { D.starterTeam.ids.forEach((id) => addToRoster(id, D.starterTeam.team[id] || 1)); persist(); reload(); return; }
  if (b.id === 'newBtn') { openEditor(null); return; }
  if (b.dataset.edit) { openEditor(b.dataset.edit); return; }
  if (b.dataset.remove) { $('rm-' + b.dataset.remove).hidden = false; return; }
  if (b.dataset.removeNo) { $('rm-' + b.dataset.removeNo).hidden = true; return; }
  if (b.dataset.removeYes) { run('DELETE FROM roster WHERE char_id=?', [b.dataset.removeYes]); reload(); return; }
  if (b.id === 'expBtn') { doExport(); return; }
  if (b.id === 'impBtn') { $('impConfirm').hidden = false; return; }
  if (b.id === 'impNo') { $('impConfirm').hidden = true; return; }
  if (b.id === 'impYes') { doImport(); return; }
  if (b.id === 'dirBtn') { window.api.openFolder(); return; }
  if (b.id === 'ovBtn') { window.api.ovCmd('toggle'); return; }
  if (b.id === 'updBtn') { $('updMsg').textContent = '確認しています…'; window.api.updateCheck().then(showUpdate).catch(() => showUpdate({ status: 'offline' })); return; }
  if (b.id === 'toastLater') { $('toast').hidden = true; return; }
  if (b.id === 'toastGo') { b.disabled = true; flush().then(() => window.api.updateRestart()); return; }
  if (b.id === 'pageBtn') { window.api.openReleases(); return; }
});

// ---------------- character editor ----------------
let editing = null;
function openEditor(id) {
  editing = id;
  const c = id ? CHARS[id] : null;
  $('dlgTitle').textContent = c ? c.name + 'を編集' : 'キャラを登録';
  $('dlgErr').textContent = '';
  $('f-book').innerHTML = D.books.map((b) => '<option value="' + esc(b.book) + '">' + esc(b.book + '（' + b.days.map((x) => WD[x]).join('・') + '・日）') + '</option>').join('') + '<option value="__custom">その他（手入力）</option>';
  $('f-days').innerHTML = [1, 2, 3, 4, 5, 6].map((d) => '<label for="fd-' + d + '"><input type="checkbox" id="fd-' + d + '" value="' + d + '">' + WD[d] + '</label>').join('');
  const f = (k, v) => { $(k).value = v || ''; };
  f('f-name', c && c.name); f('f-boss', c && c.boss); f('f-weekly', c && c.weekly); f('f-wmat', c && c.wmat);
  f('f-sp', c && c.sp); f('f-sparea', c && c.sp_area); f('f-enemy', c && c.enemy); f('f-enemyarea', c && c.enemy_area);
  f('f-art', c && c.art); f('f-artdom', c && c.art_dom); f('f-artnote', c && c.art_note); f('f-tal', c && c.tal_note);
  const known = c && D.books.find((b) => b.book === c.book && b.days.join(',') === String(c.book_days) && b.dom === c.book_dom);
  if (!c) $('f-book').value = D.books[0].book;
  else if (known) $('f-book').value = c.book;
  else {
    $('f-book').value = '__custom'; f('f-bookname', c.book); f('f-bookdom', c.book_dom);
    String(c.book_days || '').split(',').forEach((d) => { if ($('fd-' + d)) $('fd-' + d).checked = true; });
  }
  $('customBook').hidden = $('f-book').value !== '__custom';
  $('charDlg').showModal();
  $('f-name').focus();
}
$('f-book').addEventListener('change', () => { $('customBook').hidden = $('f-book').value !== '__custom'; });
$('dlgCancel').addEventListener('click', () => $('charDlg').close());
$('charForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = (k) => $(k).value.trim();
  const name = v('f-name');
  if (!name) { $('dlgErr').textContent = '名前を入力してください。'; $('f-name').focus(); return; }
  let book, days, dom;
  if ($('f-book').value === '__custom') {
    book = v('f-bookname'); dom = v('f-bookdom');
    days = [1, 2, 3, 4, 5, 6].filter((d) => $('fd-' + d).checked);
    if (!book) { $('dlgErr').textContent = '天賦本の名前を入力してください。'; $('f-bookname').focus(); return; }
    if (!days.length) { $('dlgErr').textContent = '天賦本の曜日を1つ以上選んでください（日曜日は自動で入ります）。'; return; }
  } else {
    const b = D.books.find((x) => x.book === $('f-book').value); book = b.book; days = b.days; dom = b.dom;
  }
  const id = editing || ('c' + Date.now().toString(36));
  const old = editing ? CHARS[editing] : null;
  db.run(`INSERT OR REPLACE INTO characters(id,name,book,book_days,book_dom,boss,weekly,wmat,sp,sp_area,enemy,enemy_area,art,art_dom,art_note,tal_note,def_tgt,custom) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [id, name, book, days.join(','), dom, v('f-boss'), v('f-weekly'), v('f-wmat'), v('f-sp'), v('f-sparea'), v('f-enemy'), v('f-enemyarea'), v('f-art'), v('f-artdom'), v('f-artnote'), v('f-tal'), old ? old.def_tgt : '1,9,9']);
  if (!editing) addToRoster(id, 1);
  persist();
  $('charDlg').close();
  reload();
});

// ---------------- export / import ----------------
async function doExport() {
  $('dataMsg').textContent = '';
  try {
    const r = await window.api.exportFile(db.export());
    if (r && r.ok) $('dataMsg').textContent = '書き出しました：' + r.path;
  } catch (_) { $('dataMsg').textContent = '書き出せませんでした。保存先を変えてもう一度試してください。'; }
}
async function doImport() {
  $('impConfirm').hidden = true; $('dataMsg').textContent = '';
  try {
    await flush();
    const r = await window.api.importFile();
    if (!r || r.canceled) return;
    if (!r.ok) { $('dataMsg').textContent = 'このファイルは育成データではありません。書き出した .sqlite ファイルを選んでください。'; return; }
    const next = new SQL.Database(new Uint8Array(r.bytes));
    const t = next.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('roster','characters')");
    if (!t.length || t[0].values.length < 2) { next.close(); $('dataMsg').textContent = 'このファイルは育成データではありません。書き出した .sqlite ファイルを選んでください。'; return; }
    db.close(); db = next; migrate(); cardsSig = null; reload(); await flush();
    $('dataMsg').textContent = '読み込みました。';
  } catch (_) { $('dataMsg').textContent = '読み込めませんでした。ファイルが壊れていないか確認してください。'; }
}

// ---------------- start ----------------
(async function start() {
  applySky(); // paint the right sky before the data loads
  try {
    SQL = await window.initSqlJs({ wasmBinary: await window.api.wasm() });
    const bytes = await window.api.load();
    db = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();
    migrate();
    loadAll();
    render();
    setSave(bytes ? '保存済みのデータを読み込みました' : '新しいデータを作りました');
    if (!bytes) flush();
    window.api.info().then((i) => { $('appVer').textContent = 'バージョン ' + i.version; }).catch(() => {});
    if (window.api.appStarted) { window.api.appStarted(); window.api.onUpdate(showUpdate); }
    if (window.api.onOvAction) {
      window.api.onOvAction((a) => {
        const today = gameToday();
        setCheck(a.scope, a.scope === 'w' ? weekKey(today) : key(today), a.id, a.on);
        if (a.on) lastToggled = 'k-' + a.scope + '-' + a.id;
        render();
      });
      window.api.onOvConfig(showOvStatus);
      window.api.ovGetConfig().then(showOvStatus).catch(() => {});
    }
  } catch (err) {
    setSave('起動できませんでした');
    document.querySelector('.wrap').insertAdjacentHTML('afterbegin', '<p class="confirm">データを開けませんでした。アプリを開き直してください。直らない場合は「保存場所を開く」から backups フォルダの前日のファイルを読み込んでください。</p>');
  }
  // keep countdowns and the day switch fresh; skip while a dropdown or number field is in use
  setInterval(() => { if (!db) return; const a = document.activeElement; if (a && (a.tagName === 'SELECT' || (a.tagName === 'INPUT' && a.type !== 'checkbox')) ) return; if ($('charDlg').open) return; render(); }, 60000);
})();
})();

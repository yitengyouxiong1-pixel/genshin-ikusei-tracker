// Overlay window: shows what the main window computed and sends checks back to it.
// The window size is the viewer's choice (drag the edges); overlay.css decides what fits.
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1c.6 5.4 2.4 8.4 11 11-8.6 2.6-10.4 5.6-11 11-.6-5.4-2.4-8.4-11-11 8.6-2.6 10.4-5.6 11-11z"/></svg>';
document.documentElement.dataset.sky = 'night'; document.documentElement.dataset.tone = 'dark';
let state = null, cfg = { mode: 'list', opacity: 0.94, through: false, hotkeyOk: { toggle: true, through: true } }, showDone = false;

function row(it) {
  return '<button type="button" class="it' + (it.on ? ' on' : '') + '" data-scope="' + it.scope + '" data-id="' + esc(it.id) + '" data-on="' + (it.on ? 1 : 0) + '" title="' + esc(it.t + '\n' + it.s) + '">' +
    '<span class="ck">' + STAR + '</span><span><span class="t">' + esc(it.t) + '</span><span class="s">' + esc(it.s) + '</span></span>' +
    (it.tag ? '<span class="tag" style="--c:' + it.color + '">' + esc(it.tag) + '</span>' : '<span></span>') + '</button>';
}
function render() {
  const mini = cfg.mode === 'mini';
  $('modeBtn').dataset.cmd = mini ? 'mode:list' : 'mode:mini';
  $('modeBtn').textContent = mini ? '▢' : '▁';
  $('modeBtn').title = mini ? 'リスト表示にする' : 'ちび表示にする';
  $('modeBtn').setAttribute('aria-label', $('modeBtn').title);
  $('through').hidden = !cfg.through;
  $('op').textContent = '濃さ ' + Math.round(cfg.opacity * 100) + '%';
  $('hint').textContent = cfg.hotkeyOk && cfg.hotkeyOk.through === false ? 'Ctrl+Alt+M は他のアプリが使用中です' : '縁をドラッグで大きさを変えられます';
  if (!state) { $('list').innerHTML = '<p class="empty">メイン画面を読み込み中です…</p>'; $('days').textContent = '–'; return; }
  $('days').textContent = state.days;
  $('count').textContent = state.done + ' / ' + state.total + ' できた';
  $('cnt').textContent = 'きょう ' + state.done + ' / ' + state.total;
  $('nt').textContent = state.nextTimer || '';
  $('bar').style.width = (state.total ? Math.round(100 * state.done / state.total) : 0) + '%';
  if (!state.items.length) { $('list').innerHTML = '<p class="empty">' + esc(state.emptyText || 'きょうのやることはありません。') + '</p>'; }
  else {
    const todo = state.items.filter((x) => !x.on), done = state.items.filter((x) => x.on);
    let h = '', sec = '';
    todo.forEach((it) => { if (it.sec !== sec) { sec = it.sec; h += '<div class="sec">' + esc(sec) + '</div>'; } h += row(it); });
    if (!todo.length) h += '<p class="empty">ぜんぶできました。おつかれさま</p>';
    if (done.length) {
      h += '<button type="button" class="more" id="toggleDone">' + (showDone ? '▾' : '▸') + ' できたもの（' + done.length + '）</button>';
      if (showDone) h += done.map(row).join('');
    }
    const sc = $('list').scrollTop;
    $('list').innerHTML = h;
    $('list').scrollTop = sc; // keep the reader's place when the list refreshes
  }
  $('timers').hidden = !state.timers; $('timers').textContent = state.timers || '';
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'toggleDone') { showDone = !showDone; render(); return; }
  if (b.dataset.cmd) { window.api.ovCmd(b.dataset.cmd); return; }
  if (b.dataset.id) {
    const on = b.dataset.on !== '1';
    // show the change right away; the main window answers with the saved state
    const it = state && state.items.find((x) => x.id === b.dataset.id && x.scope === b.dataset.scope);
    if (it) { it.on = on; state.done += on ? 1 : -1; render(); }
    window.api.ovAction({ scope: b.dataset.scope, id: b.dataset.id, on });
  }
});
// double-click the header in the one-line view to open the list
document.querySelector('.hd').addEventListener('dblclick', () => { if (cfg.mode === 'mini') window.api.ovCmd('mode:list'); });
window.api.onOvState((s) => {
  state = s;
  if (s.sky) { document.documentElement.dataset.sky = s.sky; document.documentElement.dataset.tone = s.tone || 'dark'; }
  render();
});
window.api.onOvConfig((c) => { cfg = Object.assign(cfg, c); render(); });
window.api.ovGetConfig().then((c) => { cfg = Object.assign(cfg, c); render(); }).catch(() => render());
})();

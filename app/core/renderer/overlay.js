// Overlay window: shows what the main window computed and sends checks back to it.
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1c.6 5.4 2.4 8.4 11 11-8.6 2.6-10.4 5.6-11 11-.6-5.4-2.4-8.4-11-11 8.6-2.6 10.4-5.6 11-11z"/></svg>';
let state = null, cfg = { mode: 'list', opacity: 0.94, through: false, hotkeyOk: { toggle: true, through: true } }, showDone = false;

function row(it) {
  return '<button type="button" class="it' + (it.on ? ' on' : '') + '" data-scope="' + it.scope + '" data-id="' + esc(it.id) + '" data-on="' + (it.on ? 1 : 0) + '" title="' + esc(it.t + '\n' + it.s) + '">' +
    '<span class="ck">' + STAR + '</span><span><span class="t">' + esc(it.t) + '</span><span class="s">' + esc(it.s) + '</span></span>' +
    (it.tag ? '<span class="tag" style="--c:' + it.color + '">' + esc(it.tag) + '</span>' : '<span></span>') + '</button>';
}
function render() {
  $('root').className = cfg.mode === 'mini' ? 'is-mini' : 'is-list';
  $('through').hidden = !cfg.through;
  $('op').textContent = '濃さ ' + Math.round(cfg.opacity * 100) + '%';
  $('hint').textContent = cfg.hotkeyOk && cfg.hotkeyOk.through === false ? 'Ctrl+Alt+M は他のアプリが使用中です' : 'Ctrl+Alt+M でクリックすり抜け';
  if (!state) { $('list').innerHTML = '<p class="empty">メイン画面を読み込み中です…</p>'; $('days').textContent = '–'; report(); return; }
  $('days').textContent = state.days; $('mDays').textContent = state.days;
  $('count').textContent = state.done + ' / ' + state.total + ' できた';
  $('mDone').textContent = 'きょう ' + state.done + ' / ' + state.total;
  $('bar').style.width = (state.total ? Math.round(100 * state.done / state.total) : 0) + '%';
  $('mTimer').textContent = state.nextTimer || '';
  if (!state.items.length) { $('list').innerHTML = '<p class="empty">' + esc(state.emptyText || 'きょうのやることはありません。') + '</p>'; }
  else {
    const todo = state.items.filter((x) => !x.on), done = state.items.filter((x) => x.on);
    let h = '';
    let sec = '';
    todo.forEach((it) => { if (it.sec !== sec) { sec = it.sec; h += '<div class="sec">' + esc(sec) + '</div>'; } h += row(it); });
    if (!todo.length) h += '<p class="empty">ぜんぶできました。おつかれさま！</p>';
    if (done.length) {
      h += '<button type="button" class="more" id="toggleDone">' + (showDone ? '▾' : '▸') + ' できたもの（' + done.length + '）</button>';
      if (showDone) h += done.map(row).join('');
    }
    $('list').innerHTML = h;
  }
  $('timers').hidden = !state.timers; $('timers').textContent = state.timers || '';
  report();
}
// Tell the main process how big the content is, so the window hugs it.
function report() {
  requestAnimationFrame(() => { const r = $('root').getBoundingClientRect(); window.api.ovSize(r.width + 2, r.height + 2); });
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'mini') { window.api.ovCmd('mode:list'); return; }
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
window.api.onOvState((s) => { state = s; render(); });
window.api.onOvConfig((c) => { cfg = Object.assign(cfg, c); render(); });
window.api.ovGetConfig().then((c) => { cfg = Object.assign(cfg, c); render(); }).catch(() => render());
})();

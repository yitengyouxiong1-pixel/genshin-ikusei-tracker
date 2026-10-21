// Narrow bridge: the page can only load/save its own database file and use the two file dialogs.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  wasm: () => ipcRenderer.invoke('wasm:get'),
  load: () => ipcRenderer.invoke('db:load'),
  save: (bytes) => ipcRenderer.invoke('db:save', bytes),
  exportFile: (bytes) => ipcRenderer.invoke('file:export', bytes),
  importFile: () => ipcRenderer.invoke('file:import'),
  openFolder: () => ipcRenderer.invoke('folder:open'),
  info: () => ipcRenderer.invoke('app:info'),
  appStarted: () => ipcRenderer.send('app:started'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateRestart: () => ipcRenderer.invoke('update:restart'),
  openReleases: () => ipcRenderer.invoke('update:open-page'),
  onUpdate: (cb) => ipcRenderer.on('update:status', (_e, s) => cb(s)),
  // overlay (main window side and overlay side share this bridge; the main process checks who sent what)
  ovPush: (state) => ipcRenderer.send('ov:push', state),
  ovAction: (a) => ipcRenderer.send('ov:action', a),
  ovSize: (w, h) => ipcRenderer.send('ov:size', { w, h }),
  ovCmd: (cmd) => ipcRenderer.send('ov:cmd', cmd),
  ovGetConfig: () => ipcRenderer.invoke('ov:get-config'),
  onOvState: (cb) => ipcRenderer.on('ov:state', (_e, s) => cb(s)),
  onOvAction: (cb) => ipcRenderer.on('ov:action', (_e, a) => cb(a)),
  onOvConfig: (cb) => ipcRenderer.on('ov:config', (_e, c) => cb(c))
});

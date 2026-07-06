const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('albion', {
  fetchJson: (url, headers) => ipcRenderer.invoke('api:fetchJson', url, headers),
  postJson: (url, body, headers) => ipcRenderer.invoke('api:postJson', url, body, headers),
  request: (method, url, body, headers) => ipcRenderer.invoke('api:request', method, url, body, headers),
  ollamaDiagnose: () => ipcRenderer.invoke('ollama:diagnose'),
  ollamaStart: () => ipcRenderer.invoke('ollama:start'),
  ollamaInstall: () => ipcRenderer.invoke('ollama:install'),
  ollamaPull: (model) => ipcRenderer.invoke('ollama:pull', model),
  onOllamaProgress: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('ollama:progress', listener);
    return () => ipcRenderer.removeListener('ollama:progress', listener);
  },
  fetchCachedText: (key, url, maxAgeDays) => ipcRenderer.invoke('api:fetchCachedText', key, url, maxAgeDays),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  onUpdateStatus: (cb) => {
    const l = (_e, p) => cb(p);
    ipcRenderer.on('update:status', l);
    return () => ipcRenderer.removeListener('update:status', l);
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
});

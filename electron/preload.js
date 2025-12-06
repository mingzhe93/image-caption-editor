const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDirs: (path) => ipcRenderer.invoke('get-dirs', path),
  getFiles: (path) => ipcRenderer.invoke('get-files', path),
  readCaption: (path) => ipcRenderer.invoke('read-caption', path),
  saveCaption: (payload) => ipcRenderer.invoke('save-caption', payload),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  captioner: {
    getStatus: () => ipcRenderer.invoke('captioner:get-status'),
    start: (options) => ipcRenderer.invoke('captioner:start', options),
    stop: () => ipcRenderer.invoke('captioner:stop'),
    installAcceleration: (preferredBackend) =>
      ipcRenderer.invoke('captioner:install-accel', preferredBackend),
    installBackend: (preferredBackend) =>
      ipcRenderer.invoke('captioner:install-backend', preferredBackend),
    downloadModel: (payload) => ipcRenderer.invoke('captioner:download-model', payload),
    clearCache: () => ipcRenderer.invoke('captioner:clear-cache'),
    openCache: () => ipcRenderer.invoke('captioner:open-cache'),
  },
});

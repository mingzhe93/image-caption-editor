const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDirs: (path) => ipcRenderer.invoke('get-dirs', path),
  getFiles: (path) => ipcRenderer.invoke('get-files', path),
  readCaption: (path) => ipcRenderer.invoke('read-caption', path),
  saveCaption: (payload) => ipcRenderer.invoke('save-caption', payload),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
});

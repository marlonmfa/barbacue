const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', Object.freeze({
  state: () => ipcRenderer.invoke('desktop:state'),
  printers: () => ipcRenderer.invoke('desktop:printers'),
  save: value => ipcRenderer.invoke('desktop:save', value),
  open: () => ipcRenderer.invoke('desktop:open'),
  test: () => ipcRenderer.invoke('desktop:test'),
  toggle: () => ipcRenderer.invoke('desktop:toggle'),
}));

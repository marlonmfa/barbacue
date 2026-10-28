const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('workspace', Object.freeze({
  state: () => ipcRenderer.invoke('workspace:state'),
  navigate: id => ipcRenderer.invoke('workspace:navigate', id),
  command: name => ipcRenderer.invoke('workspace:command', name),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('workspace:updated', listener);
    return () => ipcRenderer.removeListener('workspace:updated', listener);
  },
  onSessionExpired: callback => {
    const listener = () => callback();
    ipcRenderer.on('workspace:sessionExpired', listener);
    return () => ipcRenderer.removeListener('workspace:sessionExpired', listener);
  },
}));

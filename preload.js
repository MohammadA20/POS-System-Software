// preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loginAttempt: (credentials) => {
    return ipcRenderer.invoke('login-attempt', credentials);
  },
});

'use strict';
// Most między oknem aktywacji a procesem głównym. Okno nie ma dostępu do Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('optyk', {
  activate: (email, password) => ipcRenderer.invoke('license:activate', { email, password }),
  quit: () => ipcRenderer.send('license:quit'),
});

// The only bridge between the overlay page and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fiona', {
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
  onEnter: (cb) => ipcRenderer.on('enter', (_e, side) => cb(side)),
  onCommand: (cb) => ipcRenderer.on('command', (_e, c) => cb(c)),
  setInteractive: (on) => ipcRenderer.send('interactive', on),
  setFish: (img) => ipcRenderer.send('fish', img),
});

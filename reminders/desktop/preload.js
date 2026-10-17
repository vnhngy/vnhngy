// Runs before the page loads. Gives the page a tiny, safe bridge to the desktop shell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nudgeDesktop', {
  platform: process.platform,
  show: () => ipcRenderer.send('nudge:show'),
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('desktop', `platform-${process.platform}`);
});

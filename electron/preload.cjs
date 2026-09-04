const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("axgate", {
  isElectron: true,
  platform: process.platform,
  openFolder: () => ipcRenderer.invoke("open-folder"),
  openFiles: () => ipcRenderer.invoke("open-files"),
  saveFile: (opts) => ipcRenderer.invoke("save-file", opts),
  minimize: () => ipcRenderer.invoke("win-min"),
  maximize: () => ipcRenderer.invoke("win-max"),
  close: () => ipcRenderer.invoke("win-close"),
});

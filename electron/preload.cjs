const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("axgate", {
  isElectron: true,
  platform: process.platform,
  openFolder: () => ipcRenderer.invoke("open-folder"),
  openFiles: () => ipcRenderer.invoke("open-files"),
  openRecent: (dir) => ipcRenderer.invoke("open-recent", dir),
  listRecent: () => ipcRenderer.invoke("list-recent"),
  saveFile: (opts) => ipcRenderer.invoke("save-file", opts),
  onOpenFiles: (handler) => {
    const listen = (_event, files) => handler(files);
    ipcRenderer.on("open-files", listen);
    return () => ipcRenderer.removeListener("open-files", listen);
  },
  rendererReady: () => ipcRenderer.invoke("renderer-ready"),
  minimize: () => ipcRenderer.invoke("win-min"),
  maximize: () => ipcRenderer.invoke("win-max"),
  close: () => ipcRenderer.invoke("win-close"),
});

const { contextBridge, ipcRenderer } = require("electron");

// tiny bridge for the header, nothing else
contextBridge.exposeInMainWorld("appweb", {
  onState: (cb) => ipcRenderer.on("state", (_e, s) => cb(s)),
  copyUrl: () => ipcRenderer.send("copy-url"),
  nav: (action) => ipcRenderer.send("nav", action),
});

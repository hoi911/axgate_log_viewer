const { app, BrowserWindow, dialog, ipcMain, Menu, shell, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("node:url");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const isDev = !app.isPackaged;
let mainWindow = null;

function distDir() {
  return path.resolve(__dirname, "..", "dist");
}

function fileFromAppUrl(requestUrl) {
  const { pathname } = new URL(requestUrl);
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  const dist = distDir();
  const filePath = path.resolve(dist, rel);
  const relative = path.relative(dist, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return filePath;
}

function scanDir(dir, acc = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      scanDir(full, acc);
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (lower.endsWith(".adb") || lower.endsWith(".csv")) acc.push(full);
  }
  return acc;
}

function readPayload(filePath) {
  const buf = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    bytes: buf,
  };
}

function createWindow() {
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#10161c",
    title: "AXGATE 로그 뷰어",
    frame: isMac,
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
    dialog.showErrorBox(
      "화면을 열 수 없습니다",
      `주소: ${url}\n코드: ${code}\n${desc}`,
    );
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadURL("app://localhost/index.html");
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const filePath = fileFromAppUrl(request.url);
    if (!filePath) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("open-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const dir = result.filePaths[0];
  const files = scanDir(dir).map(readPayload);
  return { dir, files };
});

ipcMain.handle("open-files", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "로그 파일", extensions: ["adb", "csv"] },
      { name: "모든 파일", extensions: ["*"] },
    ],
  });
  if (result.canceled) return null;
  return result.filePaths.map(readPayload);
});

ipcMain.handle("save-file", async (_event, opts) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: opts.defaultName,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, Buffer.from(opts.data));
  return result.filePath;
});

ipcMain.handle("win-min", () => mainWindow?.minimize());
ipcMain.handle("win-max", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle("win-close", () => mainWindow?.close());

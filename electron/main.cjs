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
const MAX_SCAN_FILES = 200;
const MAX_RECENTS = 8;
let mainWindow = null;
let pendingOpenPaths = [];

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

function isLogFile(name) {
  const lower = name.toLowerCase();
  return lower.endsWith(".adb") || lower.endsWith(".csv");
}

function collectLogFiles(dir, recursive, max) {
  const acc = [];
  const walk = (current) => {
    if (acc.length >= max) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    const dirs = [];
    for (const entry of entries) {
      if (acc.length >= max) return;
      if (entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        dirs.push(full);
        continue;
      }
      if (isLogFile(entry.name)) acc.push(full);
    }
    if (recursive) {
      for (const child of dirs) {
        if (acc.length >= max) return;
        walk(child);
      }
    }
  };
  walk(dir);
  return acc;
}

function scanLogPaths(dir) {
  const top = collectLogFiles(dir, false, MAX_SCAN_FILES + 1);
  if (top.length > 0) {
    return { paths: top.slice(0, MAX_SCAN_FILES), truncated: top.length > MAX_SCAN_FILES, recursive: false };
  }
  const rec = collectLogFiles(dir, true, MAX_SCAN_FILES + 1);
  return { paths: rec.slice(0, MAX_SCAN_FILES), truncated: rec.length > MAX_SCAN_FILES, recursive: true };
}

function readPayload(filePath) {
  const buf = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    bytes: buf,
  };
}

function recentsPath() {
  return path.join(app.getPath("userData"), "recents.json");
}

function loadRecents() {
  try {
    const raw = JSON.parse(fs.readFileSync(recentsPath(), "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveRecents(list) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(recentsPath(), JSON.stringify(list.slice(0, MAX_RECENTS), null, 2));
}

function rememberDir(dir, fileCount) {
  if (!dir) return;
  const next = [
    { dir, name: path.basename(dir), lastOpened: Date.now(), fileCount },
    ...loadRecents().filter((item) => item.dir !== dir),
  ];
  saveRecents(next);
}

function extractAdbArgs(argv) {
  return (argv || []).filter((arg) => typeof arg === "string" && arg.toLowerCase().endsWith(".adb") && fs.existsSync(arg));
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
      sandbox: true,
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

function sendOpenFiles(files) {
  if (!mainWindow || files.length === 0) return;
  mainWindow.webContents.send("open-files", files);
}

function flushPendingOpens() {
  if (!mainWindow || pendingOpenPaths.length === 0) return;
  const paths = pendingOpenPaths.splice(0, pendingOpenPaths.length);
  sendOpenFiles(paths.map(readPayload));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const files = extractAdbArgs(argv);
    if (files.length) pendingOpenPaths.push(...files);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      flushPendingOpens();
    }
  });

  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    pendingOpenPaths.push(filePath);
    if (mainWindow) flushPendingOpens();
  });

  app.whenReady().then(() => {
    protocol.handle("app", (request) => {
      const filePath = fileFromAppUrl(request.url);
      if (!filePath) return new Response("Forbidden", { status: 403 });
      return net.fetch(pathToFileURL(filePath).toString());
    });
    pendingOpenPaths.push(...extractAdbArgs(process.argv));
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("open-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const dir = result.filePaths[0];
  const scanned = scanLogPaths(dir);
  if (scanned.paths.length === 0) return { dir, files: [] };
  if (scanned.truncated || scanned.paths.length >= 80) {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "warning",
      buttons: ["가져오기", "취소"],
      defaultId: scanned.truncated ? 1 : 0,
      cancelId: 1,
      title: "많은 파일",
      message: `${scanned.truncated ? `${MAX_SCAN_FILES}개 이상` : `${scanned.paths.length}개`}의 로그 파일을 찾았습니다.`,
      detail: scanned.recursive
        ? "하위 폴더까지 검색했습니다. 상위 폴더를 연 것 같으면 취소를 누르세요."
        : "계속하면 파일을 모두 메모리로 읽습니다.",
    });
    if (choice !== 0) return null;
  }
  const files = scanned.paths.map(readPayload);
  rememberDir(dir, files.length);
  return { dir, files };
});

ipcMain.handle("open-recent", async (_event, dir) => {
  if (!dir || !fs.existsSync(dir)) return { missing: true, dir };
  const scanned = scanLogPaths(dir);
  const files = scanned.paths.map(readPayload);
  rememberDir(dir, files.length);
  return { dir, files };
});

ipcMain.handle("list-recent", () => loadRecents());

ipcMain.handle("renderer-ready", () => {
  flushPendingOpens();
  return true;
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

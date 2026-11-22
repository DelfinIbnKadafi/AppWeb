const { app, BaseWindow, WebContentsView, Menu, ipcMain, clipboard, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const config = require("./app.config.json");

const HEADER_H = 40;
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

let win = null;
let header = null;
let content = null;
let zoom = 1;

// host check, subdomains are cool too
function isAllowed(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === config.domain || host.endsWith("." + config.domain);
  } catch {
    return false;
  }
}

// ---- zoom ----

const zoomFile = () => path.join(app.getPath("userData"), "zoom.json");

function loadZoom() {
  try {
    const z = JSON.parse(fs.readFileSync(zoomFile(), "utf8")).zoom;
    if (typeof z === "number" && z >= 0.5 && z <= 3) zoom = z;
  } catch {
    // first run, no file, whatever
  }
}

function saveZoom() {
  try {
    fs.writeFileSync(zoomFile(), JSON.stringify({ zoom }));
  } catch {
    // not worth crashing over
  }
}

// dir: 1 = in, -1 = out, 0 = reset
function stepZoom(dir) {
  if (dir === 0) {
    zoom = 1;
  } else {
    let idx = 0;
    ZOOM_STEPS.forEach((s, i) => {
      if (Math.abs(s - zoom) < Math.abs(ZOOM_STEPS[idx] - zoom)) idx = i;
    });
    zoom = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, idx + dir))];
  }
  saveZoom();
  content.webContents.setZoomFactor(zoom);
  sendState();
}

// ctrl +, ctrl -, ctrl 0
function hookZoomKeys(wc) {
  wc.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown" || !(input.control || input.meta)) return;
    const k = input.key;
    if (k === "+" || k === "=" || k === "Add") {
      e.preventDefault();
      stepZoom(1);
    } else if (k === "-" || k === "_" || k === "Subtract") {
      e.preventDefault();
      stepZoom(-1);
    } else if (k === "0") {
      e.preventDefault();
      stepZoom(0);
    }
  });
}

// ---- window ----

function layout() {
  if (!win) return;
  const { width, height } = win.getContentBounds();
  header.setBounds({ x: 0, y: 0, width, height: HEADER_H });
  content.setBounds({ x: 0, y: HEADER_H, width, height: Math.max(0, height - HEADER_H) });
}

function sendState() {
  if (!header || header.webContents.isDestroyed()) return;
  const wc = content.webContents;
  header.webContents.send("state", {
    title: wc.getTitle() || config.name,
    canBack: wc.navigationHistory.canGoBack(),
    canForward: wc.navigationHistory.canGoForward(),
    zoom,
  });
}

function errorPage(url) {
  const safe = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const html = `<body style="font-family:sans-serif;background:#111318;color:#e8eaf0;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h2>Can't load this page</h2><p>Check your connection, then retry.</p>
<a href="${safe}" style="color:#6ea8ff">Retry</a></div></body>`;
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

function setupContent() {
  const wc = content.webContents;

  if (config.blockOtherDomains) {
    // cancel off-domain moves, user stays on the current page
    const guard = (e) => {
      if (!isAllowed(e.url)) e.preventDefault(); // nope
    };
    wc.on("will-navigate", guard);
    wc.on("will-redirect", guard);
  }

  // popups load in the same view, if allowed
  wc.setWindowOpenHandler(({ url }) => {
    if (isAllowed(url) || (!config.blockOtherDomains && /^https?:/i.test(url))) wc.loadURL(url);
    return { action: "deny" };
  });

  // zoom: keys, ctrl+wheel, touchpad pinch
  hookZoomKeys(wc);
  wc.setVisualZoomLevelLimits(1, 3);
  wc.on("zoom-changed", (_e, direction) => stepZoom(direction === "in" ? 1 : -1));

  // chromium resets zoom per host, so re-apply on every nav
  const onNav = () => {
    wc.setZoomFactor(zoom);
    sendState();
  };

  wc.on("page-title-updated", (_e, title) => {
    win.setTitle(title);
    sendState();
  });
  wc.on("did-navigate", onNav);
  wc.on("dom-ready", onNav);
  wc.on("did-navigate-in-page", sendState);
  wc.on("did-finish-load", sendState);

  wc.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = aborted (our block), ignore
    wc.loadURL(errorPage(url));
  });

  wc.loadURL(config.entry);
}

function createWindow() {
  Menu.setApplicationMenu(null);
  loadZoom();

  const iconFile = path.join(__dirname, "icon.ico");
  const icon = fs.existsSync(iconFile) ? nativeImage.createFromPath(iconFile) : null;

  win = new BaseWindow({
    width: 1200,
    height: 800,
    title: config.name,
    backgroundColor: "#111318",
    ...(icon ? { icon } : {}),
  });

  header = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  content = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true } });

  win.contentView.addChildView(content);
  win.contentView.addChildView(header);

  header.webContents.loadFile(path.join(__dirname, "header.html"));
  header.webContents.on("did-finish-load", sendState);
  hookZoomKeys(header.webContents); // keys work even if header has focus

  layout();
  for (const ev of ["resize", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) {
    win.on(ev, layout);
  }
  win.on("closed", () => {
    // views don't die on their own, clean up
    header.webContents.close();
    content.webContents.close();
    win = null;
  });

  setupContent();
}

// only the header view is allowed to talk to us
ipcMain.on("copy-url", (e) => {
  if (e.sender !== header.webContents) return;
  clipboard.writeText(content.webContents.getURL());
});

ipcMain.on("nav", (e, action) => {
  if (e.sender !== header.webContents) return;
  const wc = content.webContents;
  if (action === "back" && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  if (action === "forward" && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  if (action === "reload") wc.reload();
  if (action === "zoom-reset") stepZoom(0);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}

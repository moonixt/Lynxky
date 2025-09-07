// Electron main process for Fair Note
const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  // Cria a janela de splash
  const splash = new BrowserWindow({
    width: 1200,
    height: 720,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    center: true,
    resizable: false,
    skipTaskbar: true,
    show: true,
  });
  splash.loadFile(path.join(__dirname, "public", "splash.html"));

  // Cria a janela principal, mas não mostra ainda
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 436,
    minHeight: 720,
    autoHideMenuBar: true,
    menuBarVisible: false,
    frame: true,
    show: false, // Hide until ready
    backgroundColor: "#000",
    fullscreen: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, "app", "favicon.ico"), // Ícone da janela
    title: "Lynxky",
  });

  // Em desenvolvimento usa localhost, em produção usa lynxky.com
  const isDev = process.env.NODE_ENV === "development" || process.env.ELECTRON_START_URL;
  const startUrl = isDev 
    ? (process.env.ELECTRON_START_URL || "http://localhost:3000")
    : "";
    
  win.loadURL(startUrl).catch((err) => {
    // Fallback para desenvolvimento se falhar
    if (!isDev) {
      win.loadURL("http://lynxky.com").catch(() => {
        win.loadURL(
          "data:text/html,<h2>Failed to load app. Please check your internet connection.</h2><pre>" +
            err +
            "</pre>",
        );
      });
    } else {
      win.loadURL(
        "data:text/html,<h2>Failed to load app. Is the Next.js server running?</h2><pre>" +
          err +
          "</pre>",
      );
    }
  });

  const userLocale = app.getLocale(); // e.g., 'ja'
  win.webContents.on("did-finish-load", () => {
    win.webContents.send("set-locale", userLocale);
  });

  // Quando a janela principal estiver pronta, fecha o splash e mostra o app
  win.once("ready-to-show", () => {
    setTimeout(() => {
      splash.destroy();
      win.show();
    }, 9500); // 1500ms = 1.5 segundos
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

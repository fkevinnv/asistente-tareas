// main.js
// Proceso principal de Electron: crea la ventana, gestiona la bandeja del
// sistema, guarda/lee las tareas y ajustes, y comprueba periódicamente si
// hay recordatorios que disparar (notificación del sistema y/o sonido).

const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, shell } = require("electron");
const path = require("path");
const crypto = require("crypto");
const { JSONStore } = require("./store");
const { isDue, markNotifiedFields } = require("./task-engine");

const CHECK_INTERVAL_MS = 15000; // se revisan las tareas cada 15 segundos

let mainWindow = null;
let tray = null;
let checkTimer = null;
let isQuitting = false;

let tasksStore;
let settingsStore;

const DEFAULT_SETTINGS = {
  notificationsEnabled: true,
  defaultSound: "campana.wav",
  volume: 0.8,
  minimizeToTray: true,
};

function createStores() {
  const userDataPath = app.getPath("userData");
  tasksStore = new JSONStore(userDataPath, "tasks.json", []);
  settingsStore = new JSONStore(userDataPath, "settings.json", DEFAULT_SETTINGS);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#10132A",
    frame: false,
    show: false,
    icon: path.join(__dirname, "assets/icons/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Al cerrar con la X, se minimiza a la bandeja en lugar de salir,
  // para que los recordatorios sigan funcionando en segundo plano.
  mainWindow.on("close", (event) => {
    const settings = settingsStore.read();
    if (!isQuitting && settings.minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("maximize", () => mainWindow.webContents.send("window-state", { maximized: true }));
  mainWindow.on("unmaximize", () => mainWindow.webContents.send("window-state", { maximized: false }));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "assets/icons/tray.png"));
  tray = new Tray(icon);
  tray.setToolTip("Asistente de Tareas Personal");

  const menu = Menu.buildFromTemplate([
    {
      label: "Abrir Asistente de Tareas",
      click: () => {
        mainWindow.show();
      },
    },
    { type: "separator" },
    {
      label: "Salir",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);

  tray.on("click", () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });
}

function startScheduler() {
  checkTimer = setInterval(checkDueTasks, CHECK_INTERVAL_MS);
  // primera comprobación casi inmediata al abrir la app
  setTimeout(checkDueTasks, 1500);
}

function checkDueTasks() {
  const settings = settingsStore.read();
  if (!settings.notificationsEnabled) return;

  const tasks = tasksStore.read();
  const now = new Date();
  let changed = false;

  for (const task of tasks) {
    if (isDue(task, now)) {
      fireReminder(task, settings);
      Object.assign(task, markNotifiedFields(task, now));
      changed = true;
    }
  }

  if (changed) tasksStore.write(tasks);
}

function fireReminder(task, settings) {
  const wantsSystem = task.notifyType === "sistema" || task.notifyType === "ambos";
  const wantsSound = task.notifyType === "sonido" || task.notifyType === "ambos";

  if (wantsSystem && Notification.isSupported()) {
    const n = new Notification({
      title: `⏰ ${task.title}`,
      body: task.description ? task.description : "Es la hora de tu tarea.",
      icon: path.join(__dirname, "assets/icons/icon.png"),
      silent: true, // el sonido lo gestionamos nosotros para poder elegirlo
    });
    n.on("click", () => {
      mainWindow.show();
      mainWindow.webContents.send("focus-task", task.id);
    });
    n.show();
  }

  // Avisamos siempre a la ventana para mostrar el aviso interno (toast)
  // y reproducir el sonido elegido, si corresponde.
  const soundFile = wantsSound ? task.sound || settings.defaultSound : null;
  if (mainWindow) {
    mainWindow.webContents.send("task-due", {
      task,
      playSound: Boolean(soundFile),
      soundFile,
      volume: settings.volume,
    });
  }

  if (!mainWindow.isVisible()) {
    // pequeño rebote del icono en la bandeja / dock si aplica
    if (process.platform === "darwin") app.dock.bounce("informational");
  }
}

// ---------- IPC: control de ventana ----------
ipcMain.handle("window-minimize", () => mainWindow.minimize());
ipcMain.handle("window-maximize-toggle", () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle("window-close", () => mainWindow.close());
ipcMain.handle("window-is-maximized", () => mainWindow.isMaximized());

// ---------- IPC: tareas ----------
ipcMain.handle("tasks:getAll", () => tasksStore.read());

ipcMain.handle("tasks:add", (event, taskInput) => {
  const tasks = tasksStore.read();
  const task = {
    id: crypto.randomUUID(),
    title: taskInput.title.trim(),
    description: (taskInput.description || "").trim(),
    date: taskInput.date,
    time: taskInput.time,
    priority: taskInput.priority || "media",
    repeat: taskInput.repeat || "none",
    notifyType: taskInput.notifyType || "ambos",
    sound: taskInput.sound || "campana.wav",
    completed: false,
    notified: false,
    lastNotifiedDate: null,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  tasksStore.write(tasks);
  return task;
});

ipcMain.handle("tasks:update", (event, id, changes) => {
  const tasks = tasksStore.read();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  const prev = tasks[idx];
  const updated = { ...prev, ...changes };

  // Si se cambia la fecha/hora/repetición de una tarea, se reactivan sus avisos
  const scheduleChanged =
    changes.date !== undefined || changes.time !== undefined || changes.repeat !== undefined;
  if (scheduleChanged) {
    updated.notified = false;
    updated.lastNotifiedDate = null;
  }

  tasks[idx] = updated;
  tasksStore.write(tasks);
  return updated;
});

ipcMain.handle("tasks:delete", (event, id) => {
  const tasks = tasksStore.read().filter((t) => t.id !== id);
  tasksStore.write(tasks);
  return true;
});

ipcMain.handle("tasks:toggleComplete", (event, id) => {
  const tasks = tasksStore.read();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  tasks[idx].completed = !tasks[idx].completed;
  tasksStore.write(tasks);
  return tasks[idx];
});

ipcMain.handle("tasks:snooze", (event, id, minutes) => {
  const tasks = tasksStore.read();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const task = tasks[idx];
  const newDate = new Date(Date.now() + minutes * 60000);
  const pad = (n) => String(n).padStart(2, "0");
  task.date = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}`;
  task.time = `${pad(newDate.getHours())}:${pad(newDate.getMinutes())}`;
  task.notified = false;
  task.lastNotifiedDate = null;
  tasksStore.write(tasks);
  return task;
});

// ---------- IPC: ajustes ----------
ipcMain.handle("settings:get", () => settingsStore.read());
ipcMain.handle("settings:update", (event, changes) => {
  const updated = { ...settingsStore.read(), ...changes };
  settingsStore.write(updated);
  return updated;
});

// ---------- IPC: sonidos disponibles ----------
const fs = require("fs");
const { pathToFileURL } = require("url");
ipcMain.handle("sounds:list", () => {
  const dir = path.join(__dirname, "assets", "sounds");
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(wav|mp3|ogg)$/i.test(f))
    .map((f) => ({ file: f, url: pathToFileURL(path.join(dir, f)).href }));
});

ipcMain.handle("sounds:importCustom", async () => {
  const { dialog } = require("electron");
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Elegir sonido personalizado",
    properties: ["openFile"],
    filters: [{ name: "Audio", extensions: ["wav", "mp3", "ogg"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const src = result.filePaths[0];
  const destDir = path.join(__dirname, "assets", "sounds");
  const destName = path.basename(src);
  const dest = path.join(destDir, destName);
  fs.copyFileSync(src, dest);
  return destName;
});

app.whenReady().then(() => {
  createStores();
  createWindow();
  createTray();
  startScheduler();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // no cerramos la app: sigue en la bandeja para poder avisar
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  if (checkTimer) clearInterval(checkTimer);
});

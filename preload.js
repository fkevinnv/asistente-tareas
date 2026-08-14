// preload.js
// Puente seguro entre el proceso principal y la interfaz (contextIsolation).

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Ventana
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowMaximizeToggle: () => ipcRenderer.invoke("window-maximize-toggle"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  onWindowState: (cb) => ipcRenderer.on("window-state", (e, state) => cb(state)),

  // Tareas
  getTasks: () => ipcRenderer.invoke("tasks:getAll"),
  addTask: (task) => ipcRenderer.invoke("tasks:add", task),
  updateTask: (id, changes) => ipcRenderer.invoke("tasks:update", id, changes),
  deleteTask: (id) => ipcRenderer.invoke("tasks:delete", id),
  toggleComplete: (id) => ipcRenderer.invoke("tasks:toggleComplete", id),
  snoozeTask: (id, minutes) => ipcRenderer.invoke("tasks:snooze", id, minutes),

  // Ajustes
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (changes) => ipcRenderer.invoke("settings:update", changes),

  // Sonidos
  listSounds: () => ipcRenderer.invoke("sounds:list"),
  importCustomSound: () => ipcRenderer.invoke("sounds:importCustom"),

  // Eventos que llegan desde el proceso principal
  onTaskDue: (cb) => ipcRenderer.on("task-due", (e, payload) => cb(payload)),
  onFocusTask: (cb) => ipcRenderer.on("focus-task", (e, id) => cb(id)),
});

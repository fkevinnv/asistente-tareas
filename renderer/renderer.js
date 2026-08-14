// renderer.js
// Toda la lógica de la interfaz. Se ejecuta en el proceso de renderizado y
// habla con el proceso principal únicamente a través de `window.api`
// (definido en preload.js).

(() => {
  "use strict";

  // ---------------- Estado ----------------
  let tasks = [];
  let settings = {};
  let sounds = []; // [{file, url}]
  let currentFilter = "hoy";
  let searchQuery = "";
  let editingTaskId = null;
  let pendingDeleteId = null;

  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const PRIORIDAD_COLOR = { alta: "var(--priority-alta)", media: "var(--priority-media)", baja: "var(--priority-baja)" };
  const PRIORIDAD_LABEL = { alta: "Alta", media: "Media", baja: "Baja" };
  const NOTIFY_LABEL = { sistema: "🔔 Notificación", sonido: "🔊 Sonido", ambos: "🔔🔊 Ambos" };

  // ---------------- Utilidades de fecha ----------------
  function pad(n) { return String(n).padStart(2, "0"); }

  function todayStr(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function nowHHMM(d = new Date()) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function minutesOfDay(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
  }

  function formatDateLabel(dateStr) {
    const today = todayStr();
    const d = new Date(`${dateStr}T00:00:00`);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateStr === today) return "HOY";
    if (dateStr === todayStr(tomorrow)) return "MAÑANA";
    return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`.toUpperCase();
  }

  // ¿Aplica esta tarea "hoy" (incluye recurrentes que tocan hoy)?
  function appliesToday(task) {
    const today = todayStr();
    if (task.repeat === "diario") return today >= task.date;
    if (task.repeat === "semanal") {
      const startWeekday = new Date(`${task.date}T00:00:00`).getDay();
      return today >= task.date && new Date().getDay() === startWeekday;
    }
    return task.date === today;
  }

  function isDueSoon(task) {
    if (task.completed) return false;
    if (!appliesToday(task)) return false;
    const diff = minutesOfDay(task.time) - minutesOfDay(nowHHMM());
    return diff >= -2 && diff <= 30;
  }

  // ---------------- Arranque ----------------
  async function init() {
    bindTitlebar();
    bindTabsAndSearch();
    bindDrawerTareas();
    bindSettingsDrawer();
    bindConfirmDialog();
    bindFab();

    [tasks, settings, sounds] = await Promise.all([
      window.api.getTasks(),
      window.api.getSettings(),
      window.api.listSounds(),
    ]);

    populateSoundSelect(document.getElementById("field-sound"));
    populateSoundSelect(document.getElementById("setting-default-sound"));
    applySettingsToForm();

    renderAll();
    startClock();

    window.api.onTaskDue((payload) => onTaskDue(payload));
    window.api.onFocusTask((id) => focusTaskCard(id));
  }

  function renderAll() {
    renderTaskList();
    renderRail();
  }

  // ---------------- Barra de título ----------------
  function bindTitlebar() {
    document.getElementById("win-min").addEventListener("click", () => window.api.windowMinimize());
    document.getElementById("win-max").addEventListener("click", () => window.api.windowMaximizeToggle());
    document.getElementById("win-close").addEventListener("click", () => window.api.windowClose());
    document.getElementById("btn-settings").addEventListener("click", openSettingsDrawer);
  }

  function startClock() {
    const el = document.getElementById("titlebar-clock");
    const tick = () => {
      const now = new Date();
      el.textContent = nowHHMM(now);
      updateRailNowLine(now);
    };
    tick();
    setInterval(tick, 1000 * 15);
    setInterval(renderAll, 1000 * 60); // refresca "hoy/mañana", due-soon, etc.
  }

  // ---------------- Pestañas y búsqueda ----------------
  function bindTabsAndSearch() {
    document.querySelectorAll("#filter-tabs .tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#filter-tabs .tab").forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        currentFilter = btn.dataset.filter;
        renderTaskList();
      });
    });

    document.getElementById("search-input").addEventListener("input", (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderTaskList();
    });

    document.getElementById("empty-cta").addEventListener("click", () => openTaskDrawer());
  }

  // ---------------- Lista de tareas ----------------
  function getFilteredTasks() {
    let list = tasks.slice();

    if (currentFilter === "hoy") list = list.filter(appliesToday);
    else if (currentFilter === "pendientes") list = list.filter((t) => !t.completed);
    else if (currentFilter === "completadas") list = list.filter((t) => t.completed);
    // 'todas' no filtra

    if (searchQuery) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery) ||
          (t.description || "").toLowerCase().includes(searchQuery)
      );
    }

    list.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return minutesOfDay(a.time) - minutesOfDay(b.time);
    });

    return list;
  }

  function renderTaskList() {
    const container = document.getElementById("task-list");
    const emptyState = document.getElementById("empty-state");
    const list = getFilteredTasks();

    container.innerHTML = "";

    if (list.length === 0) {
      container.hidden = true;
      emptyState.hidden = false;
      setEmptyStateCopy();
      return;
    }

    container.hidden = false;
    emptyState.hidden = true;

    let lastGroup = null;
    const showDividers = currentFilter !== "hoy";

    for (const task of list) {
      if (showDividers && task.date !== lastGroup) {
        lastGroup = task.date;
        const divider = document.createElement("div");
        divider.className = "day-divider";
        divider.textContent = formatDateLabel(task.date);
        container.appendChild(divider);
      }
      container.appendChild(buildTaskCard(task));
    }
  }

  function setEmptyStateCopy() {
    const title = document.getElementById("empty-title");
    const copy = document.getElementById("empty-copy");
    const cta = document.getElementById("empty-cta");

    if (searchQuery) {
      title.textContent = "Sin resultados";
      copy.textContent = `No hay tareas que coincidan con "${searchQuery}".`;
      cta.hidden = true;
      return;
    }
    cta.hidden = false;
    if (currentFilter === "pendientes") {
      title.textContent = "Vas al día";
      copy.textContent = "No tienes tareas pendientes ahora mismo.";
    } else if (currentFilter === "completadas") {
      title.textContent = "Nada completado todavía";
      copy.textContent = "Las tareas que marques como hechas aparecerán aquí.";
      cta.hidden = true;
    } else {
      title.textContent = "Aún no hay tareas para hoy";
      copy.textContent = "Añade la primera y te avisaré cuando toque, con notificación y sonido.";
    }
  }

  function buildTaskCard(task) {
    const card = document.createElement("div");
    card.className = "task-card" + (task.completed ? " completed" : "");
    card.dataset.id = task.id;

    const metaBits = [];
    if (task.description) metaBits.push(`<span class="task-desc">${escapeHTML(task.description)}</span>`);
    if (task.repeat !== "none") {
      metaBits.push(
        `<span class="task-badge">🔁 ${task.repeat === "diario" ? "Cada día" : "Cada semana"}</span>`
      );
    }
    metaBits.push(`<span class="task-badge">${NOTIFY_LABEL[task.notifyType] || ""}</span>`);

    card.innerHTML = `
      <button class="task-check ${task.completed ? "checked" : ""}" data-action="toggle" title="Marcar como hecha">
        ${task.completed ? "✓" : ""}
      </button>
      <span class="task-priority-dot" style="background:${PRIORIDAD_COLOR[task.priority]}"></span>
      <span class="task-time">${task.time}</span>
      <div class="task-main">
        <div class="task-title">${escapeHTML(task.title)}</div>
        <div class="task-meta">${metaBits.join("")}</div>
      </div>
      <div class="task-actions">
        <button class="icon-btn" data-action="edit" title="Editar">
          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button class="icon-btn danger" data-action="delete" title="Eliminar">
          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2zM4 7h16v2H4V7z"/></svg>
        </button>
      </div>
    `;

    card.querySelector('[data-action="toggle"]').addEventListener("click", () => handleToggleComplete(task.id));
    card.querySelector('[data-action="edit"]').addEventListener("click", () => openTaskDrawer(task));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => openConfirmDelete(task.id));

    return card;
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function handleToggleComplete(id) {
    const updated = await window.api.toggleComplete(id);
    if (!updated) return;
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx !== -1) tasks[idx] = updated;
    renderAll();
  }

  function focusTaskCard(id) {
    // Si la tarea aplica hoy, aseguramos estar en la pestaña "Hoy"; si no, en "Todas".
    const task = tasks.find((t) => t.id === id);
    if (task) {
      const filterBtn = document.querySelector(
        `.tab[data-filter="${appliesToday(task) ? "hoy" : "todas"}"]`
      );
      if (filterBtn && !filterBtn.classList.contains("active")) filterBtn.click();
    }
    requestAnimationFrame(() => {
      const el = document.querySelector(`.task-card[data-id="${id}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("highlight");
      setTimeout(() => el.classList.remove("highlight"), 1600);
    });
  }

  // ---------------- Riel del día ----------------
  function renderRail() {
    const track = document.getElementById("rail-track");
    const nowLine = document.getElementById("rail-now");

    track.querySelectorAll(".rail-hour, .rail-task").forEach((el) => el.remove());

    for (let h = 0; h < 24; h++) {
      const row = document.createElement("div");
      row.className = "rail-hour";
      row.style.top = `${h * 60}px`;
      row.innerHTML = `<span class="rail-hour-line"></span><span class="rail-hour-label">${pad(h)}h</span>`;
      track.insertBefore(row, nowLine);
    }

    const todays = tasks.filter(appliesToday);
    for (const task of todays) {
      const dot = document.createElement("div");
      dot.className =
        "rail-task" + (task.completed ? " completed" : "") + (isDueSoon(task) ? " due-soon" : "");
      dot.style.top = `${minutesOfDay(task.time)}px`;
      dot.style.background = PRIORIDAD_COLOR[task.priority];
      dot.title = `${task.time} — ${task.title}`;
      dot.addEventListener("click", () => focusTaskCard(task.id));
      track.insertBefore(dot, nowLine);
    }

    updateRailNowLine(new Date());
  }

  function updateRailNowLine(now) {
    const nowLine = document.getElementById("rail-now");
    if (!nowLine) return;
    nowLine.style.top = `${now.getHours() * 60 + now.getMinutes()}px`;

    // Autocentrar la franja de la hora actual la primera vez que carga
    if (!updateRailNowLine._centered) {
      updateRailNowLine._centered = true;
      const rail = document.getElementById("rail-scroll");
      rail.scrollTop = Math.max(0, now.getHours() * 60 - rail.clientHeight / 2);
    }
  }

  // ---------------- Cajón: nueva/editar tarea ----------------
  function bindDrawerTareas() {
    document.getElementById("drawer-close").addEventListener("click", closeTaskDrawer);
    document.getElementById("btn-cancel-task").addEventListener("click", closeTaskDrawer);
    document.getElementById("drawer-overlay").addEventListener("click", closeTaskDrawer);

    document.querySelectorAll("#field-notify-type .segment").forEach((seg) => {
      seg.addEventListener("click", () => {
        document.querySelectorAll("#field-notify-type .segment").forEach((s) => s.classList.remove("active"));
        seg.classList.add("active");
      });
    });

    document.getElementById("btn-preview-sound").addEventListener("click", () => {
      const file = document.getElementById("field-sound").value;
      playSoundPreview(file, settings.volume ?? 0.8);
    });

    document.getElementById("btn-import-sound").addEventListener("click", async () => {
      const newFile = await window.api.importCustomSound();
      if (!newFile) return;
      sounds = await window.api.listSounds();
      populateSoundSelect(document.getElementById("field-sound"));
      populateSoundSelect(document.getElementById("setting-default-sound"));
      document.getElementById("field-sound").value = newFile;
    });

    document.getElementById("task-form").addEventListener("submit", handleSubmitTask);
  }

  function bindFab() {
    document.getElementById("fab-new-task").addEventListener("click", () => openTaskDrawer());
  }

  function openTaskDrawer(task = null) {
    editingTaskId = task ? task.id : null;
    document.getElementById("drawer-title").textContent = task ? "Editar tarea" : "Nueva tarea";
    document.getElementById("btn-save-task").textContent = task ? "Guardar cambios" : "Guardar tarea";
    document.getElementById("form-error").hidden = true;

    const now = new Date();
    const defaultTime = new Date(now.getTime() + 5 * 60000);

    document.getElementById("field-title").value = task ? task.title : "";
    document.getElementById("field-description").value = task ? task.description : "";
    document.getElementById("field-date").value = task ? task.date : todayStr();
    document.getElementById("field-time").value = task ? task.time : nowHHMM(defaultTime);
    document.getElementById("field-priority").value = task ? task.priority : "media";
    document.getElementById("field-repeat").value = task ? task.repeat : "none";
    document.getElementById("field-sound").value = task ? task.sound : settings.defaultSound || "campana.wav";

    const notifyType = task ? task.notifyType : "ambos";
    document.querySelectorAll("#field-notify-type .segment").forEach((s) => {
      s.classList.toggle("active", s.dataset.value === notifyType);
    });

    document.getElementById("drawer-overlay").hidden = false;
    document.getElementById("task-drawer").hidden = false;
    document.getElementById("field-title").focus();
  }

  function closeTaskDrawer() {
    document.getElementById("drawer-overlay").hidden = true;
    document.getElementById("task-drawer").hidden = true;
    editingTaskId = null;
  }

  async function handleSubmitTask(e) {
    e.preventDefault();
    const title = document.getElementById("field-title").value.trim();
    const errorEl = document.getElementById("form-error");

    if (!title) {
      errorEl.textContent = "Añade un título para guardar la tarea.";
      errorEl.hidden = false;
      return;
    }

    const date = document.getElementById("field-date").value;
    const time = document.getElementById("field-time").value;
    if (!date || !time) {
      errorEl.textContent = "Elige una fecha y una hora para el recordatorio.";
      errorEl.hidden = false;
      return;
    }

    const payload = {
      title,
      description: document.getElementById("field-description").value.trim(),
      date,
      time,
      priority: document.getElementById("field-priority").value,
      repeat: document.getElementById("field-repeat").value,
      notifyType: document.querySelector("#field-notify-type .segment.active")?.dataset.value || "ambos",
      sound: document.getElementById("field-sound").value,
    };

    if (editingTaskId) {
      const updated = await window.api.updateTask(editingTaskId, payload);
      const idx = tasks.findIndex((t) => t.id === editingTaskId);
      if (idx !== -1) tasks[idx] = updated;
    } else {
      const created = await window.api.addTask(payload);
      tasks.push(created);
    }

    closeTaskDrawer();
    renderAll();
  }

  // ---------------- Cajón: ajustes ----------------
  function bindSettingsDrawer() {
    document.getElementById("settings-close").addEventListener("click", closeSettingsDrawer);
    document.getElementById("settings-overlay").addEventListener("click", closeSettingsDrawer);

    document.getElementById("setting-enabled").addEventListener("change", (e) =>
      saveSetting("notificationsEnabled", e.target.checked)
    );
    document.getElementById("setting-tray").addEventListener("change", (e) =>
      saveSetting("minimizeToTray", e.target.checked)
    );
    document.getElementById("setting-default-sound").addEventListener("change", (e) =>
      saveSetting("defaultSound", e.target.value)
    );
    document.getElementById("setting-volume").addEventListener("change", (e) =>
      saveSetting("volume", Number(e.target.value))
    );
    document.getElementById("btn-preview-default-sound").addEventListener("click", () => {
      const file = document.getElementById("setting-default-sound").value;
      const vol = Number(document.getElementById("setting-volume").value);
      playSoundPreview(file, vol);
    });
  }

  async function saveSetting(key, value) {
    settings = await window.api.updateSettings({ [key]: value });
  }

  function openSettingsDrawer() {
    applySettingsToForm();
    document.getElementById("settings-overlay").hidden = false;
    document.getElementById("settings-drawer").hidden = false;
  }

  function closeSettingsDrawer() {
    document.getElementById("settings-overlay").hidden = true;
    document.getElementById("settings-drawer").hidden = true;
  }

  function applySettingsToForm() {
    document.getElementById("setting-enabled").checked = settings.notificationsEnabled !== false;
    document.getElementById("setting-tray").checked = settings.minimizeToTray !== false;
    document.getElementById("setting-default-sound").value = settings.defaultSound || "campana.wav";
    document.getElementById("setting-volume").value = settings.volume ?? 0.8;
  }

  // ---------------- Sonidos ----------------
  function populateSoundSelect(select) {
    const niceName = (file) => {
      const map = { "campana.wav": "Campana", "suave.wav": "Suave", "alerta.wav": "Alerta" };
      if (map[file]) return map[file];
      return file.replace(/\.[^.]+$/, "");
    };
    const current = select.value;
    select.innerHTML = sounds.map((s) => `<option value="${s.file}">${niceName(s.file)}</option>`).join("");
    if (current && sounds.some((s) => s.file === current)) select.value = current;
  }

  function playSoundPreview(file, volume) {
    const sound = sounds.find((s) => s.file === file);
    if (!sound) return;
    const player = document.getElementById("audio-player");
    player.src = sound.url;
    player.volume = Math.max(0, Math.min(1, volume ?? 0.8));
    player.currentTime = 0;
    player.play().catch(() => {});
  }

  // ---------------- Confirmación de borrado ----------------
  function bindConfirmDialog() {
    document.getElementById("confirm-cancel").addEventListener("click", closeConfirmDialog);
    document.getElementById("confirm-overlay").addEventListener("click", (e) => {
      if (e.target.id === "confirm-overlay") closeConfirmDialog();
    });
    document.getElementById("confirm-accept").addEventListener("click", async () => {
      if (!pendingDeleteId) return;
      await window.api.deleteTask(pendingDeleteId);
      tasks = tasks.filter((t) => t.id !== pendingDeleteId);
      closeConfirmDialog();
      renderAll();
    });
  }

  function openConfirmDelete(id) {
    pendingDeleteId = id;
    document.getElementById("confirm-overlay").hidden = false;
  }

  function closeConfirmDialog() {
    pendingDeleteId = null;
    document.getElementById("confirm-overlay").hidden = true;
  }

  // ---------------- Avisos internos (toasts) ----------------
  function onTaskDue({ task, playSound, soundFile, volume }) {
    // Refrescamos datos desde el proceso principal (ya se guardó "notified"/"lastNotifiedDate")
    window.api.getTasks().then((fresh) => {
      tasks = fresh;
      renderAll();
    });

    if (playSound && soundFile) playSoundPreview(soundFile, volume);
    showToast(task);
  }

  function showToast(task) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
      <div class="toast-head"><span class="toast-bell">⏰</span><strong>${escapeHTML(task.title)}</strong></div>
      <p>${task.description ? escapeHTML(task.description) : "Es la hora de tu tarea."}</p>
      <div class="toast-actions">
        <button data-act="done" class="primary">Hecho</button>
        <button data-act="snooze10">Posponer 10 min</button>
        <button data-act="dismiss">Descartar</button>
      </div>
    `;

    const remove = () => {
      toast.classList.add("leaving");
      setTimeout(() => toast.remove(), 220);
    };

    toast.querySelector('[data-act="done"]').addEventListener("click", async () => {
      await handleToggleComplete(task.id);
      remove();
    });
    toast.querySelector('[data-act="snooze10"]').addEventListener("click", async () => {
      const updated = await window.api.snoozeTask(task.id, 10);
      if (updated) {
        const idx = tasks.findIndex((t) => t.id === task.id);
        if (idx !== -1) tasks[idx] = updated;
        renderAll();
      }
      remove();
    });
    toast.querySelector('[data-act="dismiss"]').addEventListener("click", remove);

    container.appendChild(toast);
    setTimeout(remove, 25000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();

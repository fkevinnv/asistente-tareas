// task-engine.js
// Lógica pura (sin dependencias de Electron) para decidir cuándo una tarea
// debe disparar su recordatorio. Se usa desde el proceso principal.

function pad(n) {
  return String(n).padStart(2, "0");
}

function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Combina la fecha "YYYY-MM-DD" de la tarea con la hora "HH:MM" del día
// indicado (por defecto, la fecha propia de la tarea).
function dateTimeOf(task, onDate) {
  const d = onDate || task.date;
  const [h, m] = (task.time || "00:00").split(":").map(Number);
  const dt = new Date(`${d}T00:00:00`);
  dt.setHours(h, m, 0, 0);
  return dt;
}

// Devuelve true si `task` debe disparar su aviso en el instante `now`.
function isDue(task, now = new Date()) {
  if (task.completed) return false;

  const today = todayStr(now);

  if (task.repeat === "diario") {
    if (today < task.date) return false; // aún no ha empezado
    if (task.lastNotifiedDate === today) return false; // ya avisó hoy
    return now >= dateTimeOf(task, today);
  }

  if (task.repeat === "semanal") {
    if (today < task.date) return false;
    if (task.lastNotifiedDate === today) return false;
    const startWeekday = new Date(`${task.date}T00:00:00`).getDay();
    if (now.getDay() !== startWeekday) return false;
    return now >= dateTimeOf(task, today);
  }

  // Tarea única ("none")
  if (task.notified) return false;
  return now >= dateTimeOf(task, task.date);
}

// Devuelve los campos que hay que actualizar en la tarea tras avisar.
function markNotifiedFields(task, now = new Date()) {
  if (task.repeat === "diario" || task.repeat === "semanal") {
    return { lastNotifiedDate: todayStr(now) };
  }
  return { notified: true, lastNotifiedDate: todayStr(now) };
}

// Próxima ocurrencia legible (para mostrar en la interfaz), o null si la
// tarea es única y ya se avisó / completó.
function nextOccurrenceLabel(task, now = new Date()) {
  if (task.completed) return null;
  if (task.repeat === "none") {
    return task.notified ? null : `${task.date} ${task.time}`;
  }
  return task.repeat === "diario" ? `Cada día a las ${task.time}` : `Cada semana a las ${task.time}`;
}

module.exports = { pad, todayStr, dateTimeOf, isDue, markNotifiedFields, nextOccurrenceLabel };

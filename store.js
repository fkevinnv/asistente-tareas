// store.js
// Guarda y lee las tareas y los ajustes en archivos JSON dentro de la
// carpeta de datos de usuario de la aplicación (no requiere dependencias
// externas ni base de datos).

const fs = require("fs");
const path = require("path");

class JSONStore {
  constructor(userDataPath, fileName, defaultData) {
    this.filePath = path.join(userDataPath, fileName);
    this.defaultData = defaultData;
    this._ensureFile();
  }

  _ensureFile() {
    if (!fs.existsSync(this.filePath)) {
      this._write(this.defaultData);
    }
  }

  _write(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  read() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return JSON.parse(raw);
    } catch (err) {
      // Si el archivo está corrupto o no existe, se restaura el valor por defecto
      this._write(this.defaultData);
      return this.defaultData;
    }
  }

  write(data) {
    this._write(data);
    return data;
  }
}

module.exports = { JSONStore };

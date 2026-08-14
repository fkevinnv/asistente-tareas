# 🔔 Asistente de Tareas Personal

Aplicación de escritorio (Windows, macOS y Linux) para gestionar tus tareas
del día y recibir recordatorios mediante **notificaciones del sistema** y/o
**sonido**, incluso con la ventana minimizada en segundo plano.

Está construida con **Electron** (JavaScript + HTML + CSS), así que se
desarrolla y se ejecuta directamente desde Visual Studio Code.

---

## ✨ Funciones incluidas

- Crear, editar, eliminar y marcar tareas como completadas.
- Fecha, hora, prioridad (alta / media / baja) y repetición (una vez, cada
  día o cada semana).
- Notificaciones del sistema operativo, sonido, o ambas a la vez, elegido
  por tarea.
- 3 sonidos de aviso incluidos (Campana, Suave, Alerta) + botón para
  **importar tu propio sonido** (.wav, .mp3, .ogg).
- Aviso interno ("toast") cuando una tarea vence, con botones para
  **posponer 10 minutos** o **marcar como hecha** al momento.
- **Riel del día**: una franja vertical con las 24 horas del día donde ves
  de un vistazo tus tareas de hoy y una línea ámbar que marca la hora
  actual en tiempo real.
- Pestañas Hoy / Pendientes / Completadas / Todas, con buscador.
- La app se minimiza a la **bandeja del sistema** al cerrar la ventana, para
  seguir avisándote aunque no la tengas abierta (puedes desactivar esto en
  Ajustes).
- Ajustes: activar/desactivar notificaciones, sonido predeterminado,
  volumen y comportamiento al cerrar.
- Tus tareas se guardan solo en tu equipo (no se envían a ningún servidor),
  en un archivo JSON dentro de la carpeta de datos de la aplicación.

---

## 🧩 Qué necesitas instalar

### 1. Node.js (obligatorio)

Esto **no es una extensión de VS Code**, es el entorno que ejecuta la
aplicación. Descárgalo de **https://nodejs.org** (versión LTS) e instálalo.
Comprueba que quedó instalado abriendo una terminal y escribiendo:

```
node -v
npm -v
```

### 2. Extensiones recomendadas para Visual Studio Code (opcionales)

No son obligatorias para que la app funcione, pero hacen el desarrollo más
cómodo. Búscalas en el panel de Extensiones de VS Code (`Ctrl+Shift+X`):

| Extensión | Para qué sirve |
|---|---|
| **ESLint** (dbaeumer.vscode-eslint) | Avisa de errores y malas prácticas en el JavaScript. |
| **Prettier – Code formatter** (esbenp.prettier-vscode) | Formatea el código automáticamente. |
| **vscode-icons** | Iconos más claros para cada tipo de archivo. |
| **Auto Rename Tag** | Útil al editar el HTML de la interfaz. |

---

## 🚀 Cómo ejecutarla

1. Descomprime el proyecto y abre la carpeta `asistente-tareas-personal`
   con VS Code (`Archivo > Abrir carpeta…`).
2. Abre la terminal integrada (`Ctrl + ñ` o `` Ctrl + ` ``).
3. Instala las dependencias (solo la primera vez; descarga Electron, así
   que necesitas conexión a internet y puede tardar unos minutos):
   ```
   npm install
   ```
4. Arranca la aplicación:
   ```
   npm start
   ```

Cada vez que quieras volver a abrirla desde VS Code, solo hace falta
`npm start` (el paso de `npm install` no hay que repetirlo, salvo que
cambies las dependencias).

### Generar un instalador (opcional)

Si quieres un `.exe` (Windows), `.dmg` (macOS) o `.AppImage` (Linux) para
instalar la app como cualquier otro programa:

```
npm run dist
```

El resultado se genera en la carpeta `dist/`.

---

## 🗂 Estructura del proyecto

```
asistente-tareas-personal/
├── main.js              Proceso principal: ventana, bandeja, notificaciones
├── preload.js            Puente seguro entre la app y la interfaz
├── store.js               Guardado de datos en JSON
├── task-engine.js        Reglas de cuándo debe avisar cada tarea
├── package.json
├── renderer/              Interfaz (lo que ves en pantalla)
│   ├── index.html
│   ├── styles.css
│   └── renderer.js
└── assets/
    ├── icons/             Icono de la app y de la bandeja
    └── sounds/            Sonidos de notificación (puedes añadir más aquí)
```

---

## 🔁 Cómo funciona la repetición

- **No se repite**: se avisa una única vez en la fecha y hora indicadas.
- **Cada día / Cada semana**: se avisa siempre a esa hora (en el caso
  semanal, el mismo día de la semana en que la creaste).
- Marcar una tarea repetitiva como **completada** detiene sus avisos
  futuros (funciona como "dar por terminada la serie"). Si solo quieres
  posponerla un rato, usa **Posponer 10 min** desde el aviso en pantalla en
  lugar de marcarla como hecha.

---

## 🔊 Añadir tus propios sonidos

Dos formas:

1. Desde la app: al crear/editar una tarea o en Ajustes, pulsa el botón de
   importar (icono de flecha hacia arriba) junto al selector de sonido y
   elige un archivo `.wav`, `.mp3` u `.ogg`.
2. Manualmente: copia el archivo de audio dentro de `assets/sounds/` y
   reinicia la app; aparecerá en el desplegable de sonidos.

---

## 📍 Dónde se guardan tus datos

En la carpeta de datos de usuario que gestiona Electron para esta app
(`tasks.json` y `settings.json`), por ejemplo:

- Windows: `%APPDATA%\asistente-tareas-personal\`
- macOS: `~/Library/Application Support/asistente-tareas-personal/`
- Linux: `~/.config/asistente-tareas-personal/`

---

## 💡 Posibles mejoras futuras

- Iniciar automáticamente con el sistema operativo (paquete
  `auto-launch`).
- Sincronizar tareas entre varios equipos.
- Subtareas o listas de comprobación dentro de una tarea.

¡Que la disfrutes! 🕐

<div align="center">
  <img src="https://raw.githubusercontent.com/tauri-apps/tauri/HEAD/app-icon.png" alt="Sesame Companion Logo" width="120" height="120" />
  <h1>Sesame Companion (Pro Max V2.2)</h1>
  <p><strong>Un Asistente Flotante Dinámico para Sesame Habilitado por Tauri v2</strong></p>

  <p>
    <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-blue.svg?cacheSeconds=2592000" />
    <img alt="Tauri" src="https://img.shields.io/badge/tauri-v2.0.0--rc-orange.svg" />
    <img alt="Rust" src="https://img.shields.io/badge/rust-1.75+-black.svg?logo=rust" />
    <img alt="License" src="https://img.shields.io/badge/License-Private-red.svg" />
  </p>
</div>

---

## 🌟 Visión General

**Sesame Companion** es una aplicación de escritorio nativa, rápida y ligera construida con [Tauri v2](https://v2.tauri.app/). Diseñada para integrarse a la perfección con la aplicación web de Sesame, ofrece una experiencia de usuario única a través de un **Orbe (Widget Flotante)**.

Este Orbe se mantiene siempre visible y reacciona en tiempo real a las interacciones de voz de la llamada web (p. ej., "Usuario hablando", "Maya hablando", "Desconectado"), ofreciendo retroalimentación visual al instante gracias a un puente IPC bidireccional mediante *Eventos Nativos*.

---

## ✨ Características Principales

- 🔄 **Inyección Inteligente de Scripts:** Intercepta la aplicación web de Sesame de manera transparente para monitorear el flujo de la conversación y el estado de la conexión sin alterar la interfaz original.
- 📡 **Comunicación IPC Ultra Rápida:** Utiliza el sistema de eventos de Tauri v2 (`event.emit` & `app.listen_any`) para eludir restricciones de CSP (Content Security Policy) en dominios remotos.
- 🔮 **Orbe Flotante Interactivo:** Una ventana secundaria (frameless, transparente y *always-on-top*) renderizada mediante WebGL / CSS avanzado, reaccionando a las voces (Maya o Usuario) con animaciones fluidas.
- 🎤 **Mic Selector Dinámico (Hot-swapping):** Permite cambiar el micrófono en tiempo real sin cortar la llamada. Recuerda la preferencia del dispositivo del usuario y elimina micrófonos fantasma o duplicados.
- 🛡️ **Resiliencia de Conexión:** Limpia de manera proactiva estados huérfanos (por ejemplo, evitar quedarse estancado en "usuario hablando" cuando la llamada ya ha terminado).
- ⚙️ **Optimización de Consumo:** Sustituye los antiguos bucles activos (polling) por arquitectura impulsada por eventos, reduciendo enormemente la carga del procesador.

---

## 🛠️ Arquitectura y Tecnologías

El proyecto se divide en las siguientes capas fundamentales:

- **Frontend Principal (Web Inyectada):** `app.sesame.com` cargada a través del WebView de Tauri.
- **Frontend Orbe (Renderizado Reactivo):** `orb.html` con micro-animaciones (Vanilla JS + CSS puro).
- **Backend (Rust + Tauri):** Orquesta el ciclo de vida de la aplicación, inyecta `injector.js`, gestiona la bandeja del sistema (System Tray) y retransmite los eventos IPC al Orbe.

### Flujo de Datos

1. `injector.js` detecta actividad de audio (o la falta de esta) en Sesame.
2. Dispara `window.__TAURI__.event.emit('syncstatus', ...)`.
3. Rust (`lib.rs`) intercepta el evento.
4. Rust evalúa dinámicamente un script en el contexto de la ventana del `orb`.
5. El Orbe actualiza su estado visual.

---

## 🚀 Empezar a Desarrollar

### Prerrequisitos

Para levantar este proyecto necesitas tener instalado el entorno de desarrollo para Rust y Tauri:

- [Rust y Cargo](https://rustup.rs/) (>= 1.75)
- [Node.js](https://nodejs.org/) (>= 20.x)
- Herramientas de compilación C++ de Windows (Visual Studio Build Tools)

### Instalación

1. Clona el repositorio:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd sesame-companion
   ```

2. Instala las dependencias del frontend:
   ```bash
   npm install
   ```

3. Inicia el servidor de desarrollo:
   ```bash
   npm run tauri dev
   ```

---

## 📜 Reglas de Negocio (El "Red Team" Check)

Siguiendo nuestras normativas estrictas de desarrollo:

- **Auto-Redial-on-Timeout:** El `injector.js` supervisa de forma activa la conexión y descarta diálogos de calificación zombie para recuperar la llamada ante latencias excesivas.
- **Console-Auto-Debug-Resilience:** El backend depura continuamente estados corruptos y evita parálisis visuales si el micrófono de Sesame se queda "atascado" tras un `onclose` o un 400.

---

<div align="center">
  <sub>Desarrollado con ❤️ para llevar la experiencia Sesame al siguiente nivel.</sub>
</div>

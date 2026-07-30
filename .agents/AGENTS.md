# Sesame Companion Workspace Rules

## Habilidades Forzadas (Mandatory Skills)
- **deep-think**: ESTRICTAMENTE REQUERIDO para cualquier análisis de arquitectura, refactorización o cambio de diseño. Si el usuario pide analizar algo o mejorar visualmente un componente, **DEBES** activar el marco de Pensamiento Profundo, dividir tu análisis con etiquetas `<decompose>` y `<identify_risks>`, y pensar adversarialmente.
- **frontend-specialist**: ESTRICTAMENTE REQUERIDO para todo código HTML, CSS o interfaz de usuario. Nunca uses componentes genéricos, siempre usa micro-animaciones, fondos dinámicos, interpolaciones suaves, y paletas HSL (estilos 21st.dev/Higgsfield).
- **auto-redial-on-timeout**: PASO OBLIGATORIO 1: Detectar proactivamente cuando la llamada finalice por tiempo, inactividad o error (ej. HTTP 400 stopCall). Desestimar modales de calificación (rating/skip), colgar si la llamada está zombi y forzar la re-llamada (redial) inmediata sin quedarse en estado pasivo.
- **console-auto-debug-resilience**: PASO OBLIGATORIO 2: Analizar los logs de consola e IPC en tiempo real para auto-depurarse. Limpiar estados huérfanos del micrófono (`user-speaking` no debe anular `isDisconnected` cuando la llamada terminó) y reiniciar observadores DOM si el estado visual del Orb deja de reaccionar tras un periodo de inactividad o desconexión.

## Contexto de la Aplicación
- Aplicación de escritorio Tauri v2 (Tauri Core + Vite frontend).
- El núcleo inyecta un script (`injector.js`) en `app.sesame.com` para automatizar llamadas.
- Interfaz secundaria flotante (`orb.html`) para feedback visual del estado del asistente.


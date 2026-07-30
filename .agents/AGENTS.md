# AuraRTC Workspace Rules

## Mandatory Skills
- **deep-think**: Required for any architecture analysis, refactoring, or design changes.
- **frontend-specialist**: Required for all HTML, CSS, or UI code.
- **auto-redial-on-timeout**: Detect when calls end by timeout/inactivity/error. Dismiss rating modals, force redial.
- **console-auto-debug-resilience**: Analyze console/IPC logs in real-time for self-debugging. Clean orphaned mic states.

## Application Context
- Desktop application built with Tauri v2 (Rust backend + Vite frontend).
- The core injects a script (`injector.bundle.js`) into a user-configured target website to automate WebRTC calls.
- Secondary floating window (`orb.html`) provides visual voice activity feedback.
- All site-specific configuration lives in `aurartc.json` — the codebase is fully site-agnostic.

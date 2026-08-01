<div align="center">

# 🔮 AuraRTC

**Voice-reactive overlay engine for the real-time web.**

A floating orb that visualizes who's speaking on *any* WebRTC-enabled site —
local mic, remote participant, and double-talk — without touching the site.

`Tauri v2` · `Rust` · `TypeScript` · `Canvas 2D`

[![Tauri](https://img.shields.io/badge/Tauri-v2-orange?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-red?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-experimental-orange)](#-status--limitations)

</div>

---

```text
          ┌──────────────────────────────────────────────┐
          │                                              │
          │    target site  ──▶  injector  ──▶  VAD      │
          │         ▲                │             │     │
          │         │                ▼             ▼     │
          │      ORB UI  ◀──  rust core  ◀──  IPC events │
          │         │                ▲                   │
          │    always-on-top     system tray             │
          │                     mic switching            │
          │                                              │
          └──────────────────────────────────────────────┘
```

AuraRTC opens the user-configured site in a Tauri WebView, injects a TypeScript
bundle that taps WebRTC APIs (`getUserMedia`, `RTCPeerConnection`, `<audio>`/
`<video>`), and bridges voice-activity events to a transparent always-on-top orb
that animates in real time. All site-specific behavior is JSON-configured —
zero hardcoding.

> ⚠️ **Experimental / proof-of-concept.** See [Status & Limitations](#-status--limitations).

---

## ✨ Features

- 🔮 **Reactive floating orb** — Canvas 2D particle system with smoothed color interpolation; reacts to local and remote voice in real time.
- 🎙️ **Dynamic microphone switching** — change input device from the system tray mid-call, no reconnection.
- 🤖 **Configurable auto-connect** — auto-clicks "join"/"connect" buttons via text-pattern selectors.
- 🎯 **Site-agnostic by design** — point it at any WebRTC site via `aurartc.json`. No site-specific code paths.
- 🧠 **Dual VAD engine** — adaptive noise-floor detection, shared between local-mic and remote-stream analysis.
- ⚙️ **Hot-reload config** — save & apply recreates the main window without recompiling.
- 🖥️ **System tray integration** — settings UI, mic selector, and toggles live in the tray.

---

## 🌈 Orb states

The orb communicates call state purely through color:

| State | Color | Hex | Trigger |
|-------|-------|-----|---------|
| 🟢 **Idle** | Green | `#00C864` | Silent / connected but nobody speaking |
| 🔵 **You speaking** | Cyan | `#00FFFF` | Local microphone voice activity detected |
| 🟣 **Remote speaking** | Purple | `#FF00FF` | Inbound WebRTC audio detected |
| 🟡 **Double-talk** | Gold | `#FFD700` | Both local + remote active (interruption) |
| 🔴 **Disconnected** | Red | `#FF4D4D` | Call ended / hangup detected |

---

## 🏗️ Architecture

Clean / hexagonal architecture with a strict separation between the injected
frontend and the Rust desktop backend:

```text
src-injector/                    # TypeScript — injected into the target site
├── domain/
│   ├── models/                  # AppConfig, CallStatus
│   └── ports/                   # IAudioAnalyzer, IDOMClicker, IIPCAdapter
└── infrastructure/
    └── adapters/
        ├── WebRTCMonkeyPatch    # getUserMedia + RTCPeerConnection hooks, VAD
        ├── DebouncedDOMObserver # MutationObserver-based auto-clicker
        ├── MicManager           # device enumeration + tray mic selection
        └── TauriIPCAdapter      # event emit/listen bridge

src-tauri/src/                   # Rust — desktop backend
├── domain/
│   ├── config.rs                # AuraConfig (JSON persistence)
│   └── state.rs                 # AppState (mic management)
├── infrastructure/
│   ├── ipc.rs                   # Tauri commands + hot-reload
│   └── tray.rs                  # system tray + dynamic mic submenu
└── lib.rs                       # app entry + event bridge (injector → orb)
```

### Data flow

```
Target Website ──▶ WebRTC MonkeyPatch ──▶ VAD Analysis ──▶ IPC Events
                       │                                         │
                 DOM Observer                            Rust Backend
                 (auto-click)                                 │
                                                      ┌──────┴──────┐
                                               Orb (Canvas)   System Tray
```

---

## 🚀 Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) 1.75+
- [Tauri v2 prerequisites](https://tauri.app/start/prerequisites/)

### Install & run

```bash
git clone https://github.com/JairFC/AuraRTC.git
cd AuraRTC
npm install
npm run tauri dev
```

On first launch AuraRTC creates `aurartc.json` in your AppData directory. Edit it
to point at your target site, or use the **Settings** window from the system tray.

---

## ⚙️ Configuration

All behavior is driven by `aurartc.json` (persisted in AppData, never committed):

```jsonc
{
  "site_name": "My Voice App",
  "target_url": "https://your-voice-app.com",
  "auto_call_enabled": true,
  "selectors": {
    "hangup":  ["hang up", "end call", "disconnect"],
    "bot":     ["connect", "start", "call", "join"],
    "dismiss": ["skip", "close", "done", "not now"]
  },
  "vad": {
    "noise_floor_max": 40.0,      // adaptive noise ceiling
    "speaking_threshold": 12.0,   // min amplitude for speech
    "speaking_offset": 10.0,      // sensitivity above noise floor
    "analysis_interval_ms": 30    // VAD sample rate
  }
}
```

| Field | Description |
|-------|-------------|
| `target_url` | HTTPS WebRTC-enabled site to overlay |
| `auto_call_enabled` | Auto-click connect buttons on load |
| `selectors.bot` | Text/aria-label patterns for "start call" buttons |
| `selectors.hangup` | Patterns for "end call" (drives call state) |
| `selectors.dismiss` | Patterns for modals to auto-dismiss |
| `vad.*` | Voice Activity Detection tuning (shared local + remote) |

---

## 🧪 Tested sites & how to try it

AuraRTC is site-agnostic. Good places to validate without setup:

| Site | What it validates | `selectors.bot` |
|------|-------------------|-----------------|
| [Mozilla gUM test page](https://mozilla.github.io/webrtc-landing/gum_test.html) | Local-mic VAD (no call needed) | *(disable auto-call)* |
| [Talky](https://talky.io) / [Whereby](https://whereby.com) | Local **+ remote** VAD | `join`, `enter room` |
| Google Meet / Discord web | Real-world stress test | `join`, `enter voice` |

> **Fastest remote test:** open a Talky room in AuraRTC's main window and in a
> second browser tab; speak from the other tab — the orb turns purple.

---

## 🔧 How it works

1. **Tauri** opens a WebView at `target_url` and injects the bundle as an `initialization_script`.
2. The injector **monkey-patches** `getUserMedia` (local mic) and `RTCPeerConnection` (remote tracks), and taps `<audio>`/`<video>` elements as a fallback.
3. **Dual VAD** analyzes each source with an adaptive noise floor and emits `user-speaking` / `remote-speaking` / `connected` / `disconnected` events.
4. **Rust** listens via `listen_any` and `eval`s state changes into the orb window.
5. The **orb** interpolates color/scale smoothly each frame via `requestAnimationFrame`.

---

## 📜 How It Works — Deep Dive

<details>
<summary><b>The remote-voice detection problem</b></summary>

The local microphone is easy — `getUserMedia` hands us the stream. But the
*remote* participant's voice arrives as an inbound WebRTC track that the browser
pipes into an `<audio>` element. AuraRTC captures it via two redundant paths:

- **`RTCPeerConnection` `track` event** — the canonical WebRTC inbound path.
  Works on any standards-compliant site.
- **Media element tap** — `createMediaElementSource()` on every `<audio>`/`<video>`,
  re-routed back to `destination` so the site's own playback is preserved
  (without this, the site would go silent).

Both feed the same adaptive VAD engine — no duplicated logic, no site-specific
thresholds.
</details>

<details>
<summary><b>Why the injector must wait for <code>document.body</code></b></summary>

Tauri's `initialization_script` runs *before* the page constructs its DOM. If the
injector calls `MutationObserver.observe(document.body, …)` at that point,
`document.body` is `null` and the call throws — killing the entire watchdog,
auto-call, and (indirectly) the orb pipeline. AuraRTC polls until `body` exists
before observing.
</details>

---

## ⚠️ Status & limitations

- **Experimental** — built as a proof-of-concept; not production-hardened.
- **Web only** — AuraRTC overlays WebView pages. Native apps (Zoom desktop,
  Discord.exe, Spotify.exe) use OS audio APIs, not WebRTC — a different capture
  layer (e.g. WASAPI loopback) would be needed.
- **Single remote voice** — all inbound audio aggregates into one "remote"
  signal today. Per-participant coloring via `track.id` is a planned enhancement.
- **HTTPS required** — browsers only grant `getUserMedia` on secure origins.

---

## 🛡️ Security

- **Scoped remote IPC** — capabilities limit remote-origin API access to the configured window.
- **No telemetry** — AuraRTC never phones home; all config is local.
- **Auditable** — the injected bundle is plain JS, readable in `src-injector/`.

---

## 🗺️ Roadmap

- [ ] Per-participant orb coloring via WebRTC `track.id`
- [ ] Speaker labeling (config-driven name mapping)
- [ ] Native audio loopback mode (WASAPI) for desktop apps
- [ ] Built-in local STT (Whisper.cpp) call transcription

---

## 🤝 Contributing

Contributions welcome. Please open an issue first to discuss changes.

```bash
npm run typecheck   # tsc on src-injector
npm run build       # build injector bundle + dist
npm run tauri dev   # run the app
```

---

## 📄 License

[MIT](LICENSE) © AuraRTC contributors

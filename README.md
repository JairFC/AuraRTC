# 🔮 AuraRTC

**A floating voice companion widget for any WebRTC-enabled web application.**

Built with Tauri v2, Rust, and TypeScript Clean Architecture.

> Status: **experimental / proof-of-concept.** The orb reacts to local + remote
> voice activity on any WebRTC site. Tested against browser-based calling apps;
> see [Tested sites](#-tested-sites--how-to-try-it). Not affiliated with any
> service it overlays.

---

## ✨ Features

- 🔮 **Floating Orb** — Real-time voice activity visualization with particle system
- 🎙️ **Dynamic Microphone Switching** — Change mics on-the-fly from the system tray, no call interruption
- 🤖 **Configurable Auto-Connect** — Automatically clicks "connect" buttons with customizable selectors
- 🎯 **Site-Agnostic DOM Automation** — Works with any website via JSON-configured selectors
- ⚙️ **Fully Configurable** — URL, selectors, VAD thresholds — everything lives in `aurartc.json`
- 🧠 **Voice Activity Detection (VAD)** — WebRTC-based speech detection with tunable parameters
- 📦 **Zero Dependencies Frontend** — Injector is a single IIFE bundle, no React/Vue/Angular

---

## 🏗️ Architecture

AuraRTC uses **Clean Architecture / Hexagonal Architecture** with a clear separation of concerns:

```text
src-injector/                    # TypeScript — injected into target site
├── domain/
│   ├── models/                  # AppConfig, CallStatus
│   ├── ports/                   # IAudioAnalyzer, IDOMClicker, IIPCAdapter
│   └── use_cases/               # (Business logic)
├── infrastructure/
│   └── adapters/                # WebRTCMonkeyPatch, DebouncedDOMObserver, TauriIPCAdapter
└── main.ts                      # Composition Root

src-tauri/src/                   # Rust — desktop backend
├── domain/
│   ├── config.rs                # AuraConfig (JSON persistence)
│   └── state.rs                 # AppState (mic management)
├── infrastructure/
│   ├── ipc.rs                   # Tauri commands (logdom, resizeorb)
│   └── tray.rs                  # System tray with dynamic mic selector
└── lib.rs                       # Entry point
```

### Data Flow

```
Target Website → WebRTC MonkeyPatch → VAD Analysis → IPC Events → Orb (Canvas 2D)
                 DOM Observer → Auto-Click → Session Recovery
                                                        ↕
                                          System Tray ← Rust Backend → aurartc.json
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) 1.75+
- [Tauri v2 Prerequisites](https://tauri.app/start/prerequisites/)

### Installation

```bash
git clone https://github.com/your-username/aurartc.git
cd aurartc
npm install
```

### Configuration

On first launch, AuraRTC creates `aurartc.json` in your AppData directory.
Edit it to point to your target website:

```json
{
  "site_name": "My Voice App",
  "target_url": "https://your-voice-app.com",
  "auto_call_enabled": true,
  "selectors": {
    "hangup": ["hang up", "end call", "disconnect"],
    "bot": ["connect", "start", "call", "join"],
    "dismiss": ["skip", "close", "not now"]
  },
  "vad": {
    "noise_floor_max": 40.0,
    "speaking_threshold": 12.0,
    "speaking_offset": 10.0,
    "analysis_interval_ms": 30
  }
}
```

| Field | Description |
|-------|-------------|
| `site_name` | Display name shown in title bar and tray |
| `target_url` | The WebRTC-enabled website to load |
| `auto_call_enabled` | Auto-click "connect" buttons on page load |
| `selectors.hangup` | Text patterns for "end call" buttons |
| `selectors.bot` | Text patterns for "start call" / "connect" buttons |
| `selectors.dismiss` | Text patterns for modals to auto-dismiss |
| `vad.*` | Voice Activity Detection sensitivity tuning |

### Development

```bash
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

---

## 📜 How It Works

1. **Tauri** opens a WebView pointing to `target_url`
2. An **injector script** (TypeScript → IIFE bundle) is injected into the page
3. The injector **monkey-patches** `navigator.mediaDevices.getUserMedia` to intercept audio streams
4. **Voice Activity Detection** analyzes the audio in real-time using `AnalyserNode`
5. **DOM Observer** watches for configurable button patterns and auto-clicks when needed
6. **IPC Events** flow from the injector to the Rust backend and the floating Orb
7. The **Orb** (a transparent always-on-top Canvas 2D window) visualizes voice activity with particles

---

## 🧪 Tested sites & how to try it

AuraRTC is site-agnostic: point `target_url` at any WebRTC-enabled page and it
just works. Good places to validate the orb without setup:

| Site | What it validates | Suggested `selectors.bot` |
|------|-------------------|---------------------------|
| [Mozilla gUM test page](https://mozilla.github.io/webrtc-landing/gum_test.html) | Local-mic VAD only (no call needed) | *(disable auto-call)* |
| [Talky](https://talky.io) / [Whereby](https://whereby.com) | Full local **+ remote** VAD (open the same room in two tabs) | `join`, `enter room` |
| Google Meet / Discord web | Real-world stress test | `join`, `enter voice` |

**Fastest remote-voice test:** open a Talky room in AuraRTC's main window and in
a second browser tab, then talk from the other tab — the orb should turn purple
(remote speaking) and gold when both sides talk at once.

### How the orb communicates state

| Orb color | Meaning |
|-----------|---------|
| 🟢 Green | Idle / silent |
| 🔵 Cyan | **You** are speaking |
| 🟣 Purple | **Remote** participant is speaking |
| 🟡 Gold | Both speaking at once (interruption) |
| 🔴 Red | Disconnected |

---

## ⚠️ Limitations & notes

- **Permissions:** the target site must be served over HTTPS and grant
  microphone access for VAD to engage.
- **Auto-call** matches buttons by text/aria-label (configurable). Heavily
  obfuscated SPAs may need custom `selectors.bot` entries.
- **Remote VAD** taps `RTCPeerConnection` inbound tracks and `<audio>`/`<video>`
  elements; media elements are re-routed to the audio destination so the site's
  own playback is preserved.
- **Single remote voice:** the orb currently treats all inbound audio as one
  "remote" signal. Per-participant coloring is a future enhancement.

---

## 🛡️ Security

- **Capabilities**: Remote IPC is scoped to `https://*/*` — only the configured `target_url` is loaded
- **No data exfiltration**: AuraRTC never sends data to external servers
- **Local-only config**: All settings persist locally in `aurartc.json`
- **Open source**: Full audit trail of all IPC commands and event handlers

---

## 📄 License

MIT

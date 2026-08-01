import { TauriIPCAdapter } from "./infrastructure/adapters/TauriIPCAdapter";
import { DebouncedDOMObserver } from "./infrastructure/adapters/DebouncedDOMObserver";
import { WebRTCMonkeyPatch } from "./infrastructure/adapters/WebRTCMonkeyPatch";
import { MicManager } from "./infrastructure/adapters/MicManager";
import { AppConfig, emptyConfig } from "./domain/models/AppConfig";
import { CallStatus } from "./domain/models/CallStatus";

(function() {
    // 1. Only run in the TOP frame. Sesame embeds Google recaptcha/analytics
    // iframes whose origin differs (google.com, null) — injecting there causes
    // duplicate "INJECTOR ALIVE" logs, stray clicks, and crashes inside those
    // frames. All audio/DOM control belongs to the top-level document.
    if (window.self !== window.top) {
        return;
    }

    console.log("=== AURARTC INJECTOR ALIVE ===");
    // One-shot diagnostic: report whether the Tauri event bus is reachable from
    // this (possibly remote-origin) window. If this logs "MISSING", the orb will
    // never react because no event leaves this window.
    const __t = (window as any).__TAURI__;
    console.log(`[AuraRTC] event bus: ${__t && __t.event ? 'REACHABLE' : 'MISSING'} (origin=${location.origin})`);

    // 2. Configuration — injected by Tauri, fallback to generic defaults
    const config: AppConfig = (window as any).__AURARTC_CONFIG__
        ? { ...emptyConfig(), ...(window as any).__AURARTC_CONFIG__ }
        : emptyConfig();

    // 3. Dependencies
    const ipc = new TauriIPCAdapter();
    const dom = new DebouncedDOMObserver();
    const micManager = new MicManager(ipc);
    const webrtc = new WebRTCMonkeyPatch(micManager, config.vad);

    // 4. State
    let state = CallStatus.DISCONNECTED;

    // Acoustic-echo guard: when the remote participant speaks, their voice leaks
    // into the local mic (speakers → mic). To stop the orb from flickering to
    // gold (double-talk) on that echo, we gate local speech emission while the
    // remote is active, with a short hold-off so a genuine interruption can still
    // register once it clearly persists past the echo window.
    let remoteActive = false;
    let remoteReleaseAt = 0;
    const ECHO_GATE_MS = 450;

    // 5. Voice Activity Detection (VAD) — local microphone
    webrtc.onVoiceActivity(() => {
        if (remoteActive && Date.now() < remoteReleaseAt) return; // suppress echo
        ipc.emit('user-speaking', {});
    });
    webrtc.onSilence(() => {
        ipc.emit('user-silent', {});
    });
    webrtc.hookGetUserMedia((stream) => {
        webrtc.startAnalysis(stream);
    });

    // 5b. Remote (incoming WebRTC) VAD — drives the orb's "remote speaking" state.
    // Site-agnostic: taps RTCPeerConnection inbound tracks + <audio>/<video>.
    // The payload carries the speaking track's color for multi-party tinting.
    webrtc.onRemoteVoiceActivity((p) => {
        remoteActive = true;
        remoteReleaseAt = Date.now() + ECHO_GATE_MS;
        ipc.emit('remote-speaking', p);
    });
    webrtc.onRemoteSilence((p) => {
        remoteActive = false;
        // Keep the gate armed briefly after the remote stops, so the echo tail
        // doesn't immediately trigger a spurious "user speaking".
        remoteReleaseAt = Date.now() + ECHO_GATE_MS;
        ipc.emit('remote-silent', p);
    });
    webrtc.hookRemoteAudio();

    // 6. DOM Watchdog Orchestrator — uses configurable selectors
    dom.startWatching(() => {
        // Dismiss modals first
        if (dom.findAndClick(config.selectors.dismiss)) {
            console.log("[AuraRTC] Modal dismissed.");
            return;
        }

        const isHangupVisible = dom.findExists(config.selectors.hangup);

        if (state === CallStatus.DISCONNECTED) {
            if (isHangupVisible) {
                console.log("[AuraRTC] Call started (Hangup visible)");
                state = CallStatus.CONNECTED;
                ipc.emit('connected', {});
            } else if (config.auto_call_enabled) {
                if (dom.findAndClick(config.selectors.bot)) {
                    console.log("[AuraRTC] Bot button found! Connecting...");
                }
            }
        } else if (state === CallStatus.CONNECTED) {
            if (!isHangupVisible) {
                console.log("[AuraRTC] Call ended (Hangup disappeared)");
                state = CallStatus.DISCONNECTED;
                ipc.emit('disconnected', {});
            }
        }
    });

    console.log(`[AuraRTC] Injector loaded for: ${config.site_name} (${config.target_url})`);
})();

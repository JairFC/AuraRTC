import { TauriIPCAdapter } from "./infrastructure/adapters/TauriIPCAdapter";
import { DebouncedDOMObserver } from "./infrastructure/adapters/DebouncedDOMObserver";
import { WebRTCMonkeyPatch } from "./infrastructure/adapters/WebRTCMonkeyPatch";
import { MicManager } from "./infrastructure/adapters/MicManager";
import { AppConfig, emptyConfig } from "./domain/models/AppConfig";
import { CallStatus } from "./domain/models/CallStatus";

(function() {
    // 1. CORS / Iframe check
    if (window.self !== window.top && !navigator.mediaDevices) {
        console.warn("[AuraRTC] Sub-frame sin acceso a mediaDevices. Abortando inyección.");
        return;
    }

    console.log("=== AURARTC INJECTOR ALIVE ===");

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

    // 5. Voice Activity Detection (VAD)
    webrtc.onVoiceActivity(() => {
        ipc.emit('user-speaking', {});
    });
    webrtc.onSilence(() => {
        ipc.emit('user-silent', {});
    });
    webrtc.hookGetUserMedia((stream) => {
        webrtc.startAnalysis(stream);
    });

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

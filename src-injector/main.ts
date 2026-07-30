import { TauriIPCAdapter } from "./infrastructure/adapters/TauriIPCAdapter";
import { DebouncedDOMObserver } from "./infrastructure/adapters/DebouncedDOMObserver";
import { WebRTCMonkeyPatch } from "./infrastructure/adapters/WebRTCMonkeyPatch";
import { AppConfig } from "./domain/models/AppConfig";
import { CallStatus } from "./domain/models/CallStatus";

(function() {
    // 1. CORS / Iframe check
    if (window.self !== window.top && !navigator.mediaDevices) {
        console.warn("[AuraRTC] Sub-frame sin acceso a mediaDevices. Abortando inyección.");
        return;
    }

    console.log("=== AURARTC INJECTOR ALIVE ===");

    // 2. Dependencias
    const ipc = new TauriIPCAdapter();
    const dom = new DebouncedDOMObserver();
    const webrtc = new WebRTCMonkeyPatch();

    // 3. Estado y Configuración Base
    let state = CallStatus.DISCONNECTED;
    
    const config: AppConfig = (window as any).__AURARTC_CONFIG__ || {
        targetUrl: window.location.href,
        autoCallEnabled: true,
        selectors: {
            hangup: ['hang up', 'colgar', 'terminar', 'end call', 'leave'],
            bot: ['maya', 'maya-button', 'reconnect', 'continue session', 'try again', 'retry'],
            dismiss: ['skip', 'close', 'done', 'not now', 'cerrar', 'omitir', 'rate', 'dismiss', 'maybe later']
        }
    };

    // 4. Lógica de Audio (VAD)
    webrtc.onVoiceActivity(() => {
        ipc.emit('user-speaking', {});
    });
    webrtc.onSilence(() => {
        ipc.emit('user-silent', {});
    });
    webrtc.hookGetUserMedia((stream) => {
        webrtc.startAnalysis(stream);
    });

    // 5. Lógica del DOM (Watchdog Orchestrator)
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
            } else if (config.autoCallEnabled) {
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

    console.log("[AuraRTC] Clean Architecture Injector Loaded successfully.");
})();

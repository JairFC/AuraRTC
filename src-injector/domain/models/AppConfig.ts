/**
 * Application configuration injected by Tauri via window.__AURARTC_CONFIG__.
 * Mirrors the Rust AuraConfig struct — all fields are user-configurable.
 */
export interface SelectorConfig {
    hangup: string[];
    bot: string[];
    dismiss: string[];
}

export interface VadConfig {
    noise_floor_max: number;
    speaking_threshold: number;
    speaking_offset: number;
    analysis_interval_ms: number;
}

export interface AppConfig {
    site_name: string;
    target_url: string;
    auto_call_enabled: boolean;
    selectors: SelectorConfig;
    vad: VadConfig;
    orb_style: string;
}

/** Returns a safe empty config with generic defaults (no site-specific values). */
export function emptyConfig(): AppConfig {
    return {
        site_name: "My Voice App",
        target_url: window.location.href,
        auto_call_enabled: false,
        selectors: {
            hangup: ["hang up", "end call", "disconnect", "leave"],
            bot: ["connect", "start", "call", "join", "reconnect", "try again", "retry"],
            dismiss: ["skip", "close", "done", "not now", "dismiss", "maybe later", "rate"],
        },
        vad: {
            noise_floor_max: 40.0,
            speaking_threshold: 12.0,
            speaking_offset: 10.0,
            analysis_interval_ms: 30,
        },
        orb_style: "aurora",
    };
}

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Selectors used by the injector to find interactive elements in the target site.
/// Each field is a list of text patterns matched against button labels, aria-labels, etc.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SelectorConfig {
    /// Patterns that identify the "hang up" / "end call" button
    pub hangup: Vec<String>,
    /// Patterns that identify the "connect" / "start call" button
    pub bot: Vec<String>,
    /// Patterns that identify dismissible modals (rating screens, popups)
    pub dismiss: Vec<String>,
}

impl Default for SelectorConfig {
    fn default() -> Self {
        Self {
            hangup: vec![
                "hang up".to_string(),
                "end call".to_string(),
                "disconnect".to_string(),
                "leave".to_string(),
            ],
            bot: vec![
                "connect".to_string(),
                "start".to_string(),
                "call".to_string(),
                "join".to_string(),
                "reconnect".to_string(),
                "try again".to_string(),
                "retry".to_string(),
            ],
            dismiss: vec![
                "skip".to_string(),
                "close".to_string(),
                "done".to_string(),
                "not now".to_string(),
                "dismiss".to_string(),
                "maybe later".to_string(),
                "rate".to_string(),
            ],
        }
    }
}

/// Voice Activity Detection tuning parameters.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VadConfig {
    /// Maximum adaptive noise floor (dB-like). Default: 40.0
    pub noise_floor_max: f32,
    /// Minimum average amplitude to consider as speech. Default: 12.0
    pub speaking_threshold: f32,
    /// Offset above noise floor to trigger speech detection. Default: 10.0
    pub speaking_offset: f32,
    /// Milliseconds between VAD analysis frames. Default: 30
    pub analysis_interval_ms: u32,
}

impl Default for VadConfig {
    fn default() -> Self {
        Self {
            noise_floor_max: 40.0,
            speaking_threshold: 12.0,
            speaking_offset: 10.0,
            analysis_interval_ms: 30,
        }
    }
}

/// Main application configuration. Persisted to `aurartc.json` in AppData.
/// All fields are fully configurable — no site-specific defaults.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuraConfig {
    /// Human-readable name for the target site (shown in tray/title)
    pub site_name: String,
    /// URL to load in the main WebView
    pub target_url: String,
    /// Whether to automatically click the "connect" button on page load
    pub auto_call_enabled: bool,
    /// DOM selectors for the injector
    pub selectors: SelectorConfig,
    /// Voice Activity Detection parameters
    pub vad: VadConfig,
}

impl Default for AuraConfig {
    fn default() -> Self {
        Self {
            site_name: "My Voice App".to_string(),
            target_url: "https://example.com".to_string(),
            auto_call_enabled: false,
            selectors: SelectorConfig::default(),
            vad: VadConfig::default(),
        }
    }
}

impl AuraConfig {
    /// Returns true if the config is still using the placeholder default URL,
    /// meaning the user hasn't configured it yet.
    pub fn is_unconfigured(&self) -> bool {
        self.target_url == "https://example.com" || self.target_url.is_empty()
    }
}

pub fn get_config_path(app: &tauri::AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    fs::create_dir_all(&path).ok();
    path.push("aurartc.json");
    path
}

pub fn load_config(app: &tauri::AppHandle) -> AuraConfig {
    let path = get_config_path(app);
    if let Ok(content) = fs::read_to_string(path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        AuraConfig::default()
    }
}

pub fn save_config(app: &tauri::AppHandle, config: &AuraConfig) {
    let path = get_config_path(app);
    if let Ok(content) = serde_json::to_string_pretty(config) {
        let _ = fs::write(path, content);
    }
}


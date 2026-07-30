use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuraConfig {
    pub target_url: String,
    pub auto_call_enabled: bool,
}

impl Default for AuraConfig {
    fn default() -> Self {
        Self {
            target_url: "https://app.sesame.com/".to_string(), // Fallback
            auto_call_enabled: true,
        }
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
    if let Ok(content) = serde_json::to_string(config) {
        let _ = fs::write(path, content);
    }
}

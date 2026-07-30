use tauri::Manager;
use crate::domain::config::{self, AuraConfig};

#[tauri::command]
pub async fn resizeorb(app: tauri::AppHandle, size: f64) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("orb") {
        if let Ok(true) = window.is_maximized() {
            let _ = window.unmaximize();
        }
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(size, size)));
    }
    Ok(())
}

#[tauri::command]
pub async fn logdom(app: tauri::AppHandle, dom: String) -> Result<(), String> {
    let path = config::get_config_path(&app).with_file_name("aurartc_dom.html");
    std::thread::spawn(move || {
        let _ = std::fs::write(path, dom);
        println!("[AuraRTC] DOM snapshot saved for debugging.");
    });
    Ok(())
}

#[tauri::command]
pub async fn get_config(app: tauri::AppHandle) -> Result<AuraConfig, String> {
    Ok(config::load_config(&app))
}

#[tauri::command]
pub async fn save_config_cmd(app: tauri::AppHandle, config_data: AuraConfig) -> Result<(), String> {
    config::save_config(&app, &config_data);
    println!("[AuraRTC] Config saved. Restart to apply changes.");
    Ok(())
}

#[tauri::command]
pub async fn get_config_path_cmd(app: tauri::AppHandle) -> Result<String, String> {
    Ok(config::get_config_path(&app).to_string_lossy().to_string())
}

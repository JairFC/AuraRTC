use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use crate::domain::config::{self, AuraConfig};
use crate::infrastructure::tray::{update_mics_internal, UpdateMicsPayload};

// The injector bundle is compiled into the binary at build time.
// Only the config JSON prefix changes at runtime.
const INJECTOR_BUNDLE: &str = include_str!("../injector.bundle.js");

pub fn build_init_script(config: &AuraConfig) -> String {
    format!(
        "window.__AURARTC_CONFIG__ = {};\n{}",
        serde_json::to_string(config).unwrap_or_else(|_| "{}".to_string()),
        INJECTOR_BUNDLE
    )
}

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
    println!("[AuraRTC] Config saved.");
    Ok(())
}

#[tauri::command]
pub async fn get_config_path_cmd(app: tauri::AppHandle) -> Result<String, String> {
    Ok(config::get_config_path(&app).to_string_lossy().to_string())
}

/// Hot-applies the current config: saves to disk, then destroys and recreates
/// the main WebView window with the new URL + injected config.
/// The binary does NOT need to be recompiled or restarted.
#[tauri::command]
pub async fn apply_config(app: tauri::AppHandle, config_data: AuraConfig) -> Result<(), String> {
    // 1. Save to disk first
    config::save_config(&app, &config_data);
    println!("[AuraRTC] Config saved. Applying hot-reload...");

    let new_config = config_data.clone();
    let app_handle = app.clone();

    // 2. Spawn on main thread — window operations must happen on the main thread
    tauri::async_runtime::spawn_blocking(move || {
        // Close the existing main window
        if let Some(old_window) = app_handle.get_webview_window("main") {
            let _ = old_window.destroy();
        }

        // Small delay to let the window fully destroy
        std::thread::sleep(std::time::Duration::from_millis(250));

        // Rebuild the init script with the new config
        let init_script = build_init_script(&new_config);
        let window_title = format!("AuraRTC — {}", new_config.site_name);

        let url = match new_config.target_url.parse::<tauri::Url>() {
            Ok(u) => u,
            Err(e) => {
                eprintln!("[AuraRTC] Invalid URL in config: {}", e);
                return;
            }
        };

        // Recreate the main window with the new config
        match WebviewWindowBuilder::new(
            &app_handle,
            "main",
            WebviewUrl::External(url),
        )
        .title(&window_title)
        .inner_size(800.0, 600.0)
        .initialization_script(&init_script)
        .build()
        {
            Ok(w) => {
                let _ = w.show();
                println!("[AuraRTC] Main window hot-reloaded with new config.");
            }
            Err(e) => {
                eprintln!("[AuraRTC] Failed to recreate main window: {}", e);
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn update_mics_cmd(app: tauri::AppHandle, payload: UpdateMicsPayload) -> Result<(), String> {
    update_mics_internal(app, payload);
    Ok(())
}


pub mod domain;
pub mod infrastructure;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, Listener};
use domain::config::{load_config, save_config};
use domain::state::{AppState, AppStateWrapper};
use infrastructure::tray::{build_tray, update_mics_internal, UpdateMicsPayload};
use infrastructure::ipc::{logdom, resizeorb, get_config, save_config_cmd, get_config_path_cmd, apply_config, build_init_script, update_mics_cmd};
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![resizeorb, logdom, get_config, save_config_cmd, get_config_path_cmd, apply_config, update_mics_cmd])
        .setup(|app| {
            // 1. Inicializar Estado
            app.manage(AppStateWrapper(std::sync::Mutex::new(AppState::default())));

            // 2. Cargar Configuración (crear archivo si es la primera vez)
            let config = load_config(app.handle());
            if config.is_unconfigured() {
                // First run — save default config so the user can edit aurartc.json
                save_config(app.handle(), &config);
                println!("[AuraRTC] First run detected. Edit aurartc.json to configure your target site.");
            }

            // 3. Fallback listener for update_mics_event (emitted from injector when invoke fails)
            let app_handle_mics = app.handle().clone();
            app.listen_any("update_mics_event", move |event| {
                let payload_str = event.payload();
                println!("[AuraRTC] update_mics_event received: {}", payload_str);
                if let Ok(payload) = serde_json::from_str::<UpdateMicsPayload>(payload_str) {
                    update_mics_internal(app_handle_mics.clone(), payload);
                } else {
                    println!("[AuraRTC] Failed to parse update_mics_event payload: {}", payload_str);
                }
            });

            // 4. Event bridge: relay VAD + call events from injector (main window) → orb window
            // The injector emits these events via window.__TAURI__.event.emit().
            // We catch them in Rust and eval JS in the orb to update its animation state.
            let app_speaking = app.handle().clone();
            app.listen_any("user-speaking", move |_| {
                if let Some(orb) = app_speaking.get_webview_window("orb") {
                    let _ = orb.eval("window.isUserSpeaking = true;");
                }
            });

            let app_silent = app.handle().clone();
            app.listen_any("user-silent", move |_| {
                if let Some(orb) = app_silent.get_webview_window("orb") {
                    let _ = orb.eval("window.isUserSpeaking = false;");
                }
            });

            let app_connected = app.handle().clone();
            app.listen_any("connected", move |_| {
                println!("[AuraRTC] Call connected — orb switching to active mode.");
                if let Some(orb) = app_connected.get_webview_window("orb") {
                    let _ = orb.eval("window.isDisconnected = false; window.isRemoteSpeaking = false;");
                }
            });

            let app_disconnected = app.handle().clone();
            app.listen_any("disconnected", move |_| {
                println!("[AuraRTC] Call disconnected — orb switching to red mode.");
                if let Some(orb) = app_disconnected.get_webview_window("orb") {
                    let _ = orb.eval("window.isDisconnected = true; window.isUserSpeaking = false; window.isRemoteSpeaking = false;");
                }
            });

            // 4. Build injector bundle with config injected at the front
            let init_script = build_init_script(&config);

            // 5. Instanciar Ventana Principal
            let window_title = format!("AuraRTC — {}", config.site_name);
            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(config.target_url.parse().unwrap())
            )
            .title(&window_title)
            .inner_size(800.0, 600.0)
            .initialization_script(&init_script)
            .build()?;

            #[cfg(debug_assertions)]
            window.open_devtools();

            // 6. Instanciar el Orbe
            let _orb = WebviewWindowBuilder::new(
                app,
                "orb",
                WebviewUrl::App("orb.html".into())
            )
            .title("AuraRTC Orb")
            .inner_size(175.0, 175.0)
            .transparent(true)
            .decorations(false)
            .shadow(false)
            .always_on_top(true)
            .build()?;

            // 7. Instanciar el Tray
            build_tray(app.handle(), &config).unwrap();

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == "settings" {
                    // Settings window can close normally
                    return;
                }
                // Main and Orb windows hide instead of closing
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

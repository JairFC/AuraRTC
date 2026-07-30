pub mod domain;
pub mod infrastructure;

use std::sync::Mutex;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, Listener};
use domain::config::{load_config, save_config};
use domain::state::{AppState, AppStateWrapper};
use infrastructure::tray::{build_tray, update_mics_internal, UpdateMicsPayload};
use infrastructure::ipc::{logdom, resizeorb};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![resizeorb, logdom])
        .setup(|app| {
            // 1. Inicializar Estado
            app.manage(AppStateWrapper(Mutex::new(AppState::default())));

            // 2. Cargar Configuración (crear archivo si es la primera vez)
            let config = load_config(app.handle());
            if config.is_unconfigured() {
                // First run — save default config so the user can edit aurartc.json
                save_config(app.handle(), &config);
                println!("[AuraRTC] First run detected. Edit aurartc.json to configure your target site.");
            }

            // 3. Registrar Listeners de Rust (Eventos IPC Web -> Rust)
            let app_handle_mics = app.handle().clone();
            app.listen_any("update_mics_event", move |event| {
                let payload_str = event.payload();
                if let Ok(payload) = serde_json::from_str::<UpdateMicsPayload>(payload_str) {
                    update_mics_internal(app_handle_mics.clone(), payload);
                } else {
                    println!("[AuraRTC] Failed to parse update_mics_event payload.");
                }
            });

            // 4. Construir el Bundle Inyector
            let init_script = format!(
                "window.__AURARTC_CONFIG__ = {};\n{}",
                serde_json::to_string(&config).unwrap_or_else(|_| "{}".to_string()),
                include_str!("injector.bundle.js")
            );

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
                // Prevenir que se cierre el programa. Ocultar la ventana en su lugar.
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

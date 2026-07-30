use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder, Emitter, Listener
};
use std::fs;
use std::path::PathBuf;

fn get_settings_path(app: &tauri::AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    fs::create_dir_all(&path).ok();
    path.push("autocall.txt");
    path
}

fn is_autocall_enabled(app: &tauri::AppHandle) -> bool {
    let path = get_settings_path(app);
    if let Ok(content) = fs::read_to_string(path) {
        content.trim() == "true"
    } else {
        false
    }
}

fn set_autocall_enabled(app: &tauri::AppHandle, enabled: bool) {
    let path = get_settings_path(app);
    let _ = fs::write(path, if enabled { "true" } else { "false" });
}

#[tauri::command]
fn resizeorb(app: tauri::AppHandle, size: f64) {
    if let Some(window) = app.get_webview_window("orb") {
        // En Windows, si el usuario hace doble clic en un área de "drag",
        // la ventana se maximiza automáticamente. Una ventana maximizada
        // ignora los comandos de set_size. Por lo tanto, la desmaximizamos primero.
        if let Ok(true) = window.is_maximized() {
            let _ = window.unmaximize();
        }
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(size, size)));
    }
}

#[tauri::command]
fn logdom(app: tauri::AppHandle, dom: String) {
    let path = get_settings_path(&app).with_file_name("sesame_dom.html");
    let _ = fs::write(path, dom);
    println!("[Rust] Recibido DOM de la página para depurar.");
}


#[derive(serde::Deserialize)]
struct UpdateMicsPayload {
    mics: Vec<String>,
    #[serde(rename = "selectedIdx")]
    selected_idx: usize,
}

fn update_mics_internal(app: tauri::AppHandle, mics: Vec<String>, selected_idx: usize) {
    let auto_call = is_autocall_enabled(&app);
    
    // Reconstruir el menú del Tray dinámicamente
    let show_i = MenuItemBuilder::with_id("show", "Show / Hide Web").build(&app).unwrap();
    let show_orb_i = CheckMenuItemBuilder::with_id("show_orb", "Show Orb Gadget")
        .checked(true)
        .build(&app).unwrap();
    let autocall_i = CheckMenuItemBuilder::with_id("autocall", "Auto-Call on Start")
        .checked(auto_call)
        .build(&app).unwrap();
    let quit_i = MenuItemBuilder::with_id("quit", "Quit").build(&app).unwrap();

    let mut mic_submenu = SubmenuBuilder::new(&app, "🎙️ Micrófono");
    if mics.is_empty() {
        let item = MenuItemBuilder::with_id("mic_loading", "No se detectaron micrófonos").enabled(false).build(&app).unwrap();
        mic_submenu = mic_submenu.item(&item);
    } else {
        for (i, mic) in mics.iter().enumerate() {
            let item = CheckMenuItemBuilder::with_id(format!("mic_{}", i), mic)
                .checked(i == selected_idx)
                .build(&app).unwrap();
            mic_submenu = mic_submenu.item(&item);
        }
    }
    let mic_submenu = mic_submenu.build().unwrap();

    let menu = MenuBuilder::new(&app)
        .item(&show_i)
        .item(&show_orb_i)
        .item(&autocall_i)
        .item(&mic_submenu)
        .separator()
        .item(&quit_i)
        .build().unwrap();

    if let Some(tray) = app.tray_by_id("main_tray") {
        let _ = tray.set_menu(Some(menu));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![resizeorb, logdom])
        .setup(|app| {
            let auto_call = is_autocall_enabled(app.handle());
            let app_handle_clone = app.handle().clone();
            
            app.listen_any("syncstatus", move |event| {
                let payload_str = event.payload();
                println!("[Rust] Received EVENT syncstatus: {}", payload_str);
                if let Some(orb_win) = app_handle_clone.get_webview_window("orb") {
                    if payload_str.contains("maya-speaking") {
                        let _ = orb_win.eval("if (!window.isDisconnected) window.isMayaSpeaking = true;");
                    } else if payload_str.contains("maya-silent") {
                        let _ = orb_win.eval("window.isMayaSpeaking = false;");
                    } else if payload_str.contains("user-speaking") {
                        let _ = orb_win.eval("if (!window.isDisconnected) window.isUserSpeaking = true;");
                    } else if payload_str.contains("user-silent") {
                        let _ = orb_win.eval("window.isUserSpeaking = false;");
                    } else if payload_str.contains("disconnected") {
                        let _ = orb_win.eval("window.isDisconnected = true; window.isMayaSpeaking = false; window.isUserSpeaking = false;");
                    } else if payload_str.contains("connected") {
                        let _ = orb_win.eval("window.isDisconnected = false;");
                    }
                }
            });
            
            let app_handle_mics = app.handle().clone();
            app.listen_any("update_mics_event", move |event| {
                let payload_str = event.payload();
                println!("[Rust] Received EVENT update_mics_event: {}", payload_str);
                if let Ok(payload) = serde_json::from_str::<UpdateMicsPayload>(payload_str) {
                    update_mics_internal(app_handle_mics.clone(), payload.mics, payload.selected_idx);
                } else {
                    println!("[Rust] Failed to parse update_mics_event payload.");
                }
            });
            // Inyectamos la variable inicial en el script global
            let init_script = format!(
                "window.__AUTO_CALL_ENABLED = {};\n{}",
                auto_call,
                include_str!("injector.js")
            );

            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("https://app.sesame.com/".parse().unwrap())
            )
            .title("Sesame Companion")
            .inner_size(800.0, 600.0)
            .initialization_script(&init_script)
            .build()?;

            #[cfg(debug_assertions)]
            window.open_devtools();

            let _orb = WebviewWindowBuilder::new(
                app,
                "orb",
                WebviewUrl::App("orb.html".into())
            )
            .title("Sesame Orb")
            .inner_size(175.0, 175.0) // Aumentado a 175 para más espacio
            .transparent(true)
            .decorations(false)
            .shadow(false)
            .always_on_top(true)
            .build()?;

            // Title-based CSP Evasion Loop removed in favor of direct Native IPC Events.

            // Menú
            let show_i = MenuItemBuilder::with_id("show", "Show / Hide Web").build(app)?;
            let show_orb_i = CheckMenuItemBuilder::with_id("show_orb", "Show Orb Gadget")
                .checked(true)
                .build(app)?;
            let autocall_i = CheckMenuItemBuilder::with_id("autocall", "Auto-Call on Start")
                .checked(auto_call)
                .build(app)?;
            let quit_i = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let mic_submenu = SubmenuBuilder::new(app, "🎙️ Micrófono");
            let item = MenuItemBuilder::with_id("mic_loading", "Buscando... (Requiere permisos)").enabled(false).build(app)?;
            let mic_submenu = mic_submenu.item(&item).build()?;

            let menu = MenuBuilder::new(app)
                .item(&show_i)
                .item(&show_orb_i)
                .item(&autocall_i)
                .item(&mic_submenu)
                .separator()
                .item(&quit_i)
                .build()?;

            // Tray
            let _tray = TrayIconBuilder::with_id("main_tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    "show_orb" => {
                        if let Some(window) = app.get_webview_window("orb") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                            }
                        }
                    }
                    "autocall" => {
                        // Toggle logic
                        let current = is_autocall_enabled(app);
                        let new_state = !current;
                        set_autocall_enabled(app, new_state);
                        
                        // Pass new state to frontend
                        if let Some(window) = app.get_webview_window("main") {
                            let script = format!("if (window.setAutoCall) window.setAutoCall({});", new_state);
                            let _ = window.eval(&script);
                        }
                    }
                    id if id.starts_with("mic_") => {
                        if let Some(idx_str) = id.strip_prefix("mic_") {
                            if let Ok(idx) = idx_str.parse::<usize>() {
                                let _ = app.emit("change_mic", idx);
                            }
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // If the user clicks the X button on the web window, hide it instead of closing
                if window.label() == "main" {
                    window.hide().unwrap();
                    api.prevent_close();
                } else if window.label() == "orb" {
                    window.hide().unwrap();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

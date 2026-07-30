use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Emitter,
};
use crate::domain::config::{load_config, save_config, AuraConfig};
use crate::domain::state::AppStateWrapper;

#[derive(serde::Deserialize)]
pub struct UpdateMicsPayload {
    pub mics: Vec<String>,
    #[serde(rename = "selectedIdx")]
    pub selected_idx: usize,
}

pub fn build_tray(app: &tauri::AppHandle, config: &AuraConfig) -> Result<(), Box<dyn std::error::Error>> {
    let show_i = MenuItemBuilder::with_id("show", "Show / Hide Web").build(app)?;
    let show_orb_i = CheckMenuItemBuilder::with_id("show_orb", "Show Orb Gadget")
        .checked(true)
        .build(app)?;
    let autocall_i = CheckMenuItemBuilder::with_id("autocall", "Auto-Call on Start")
        .checked(config.auto_call_enabled)
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

    {
        let state_mutex = app.state::<AppStateWrapper>();
        let mut state = state_mutex.0.lock().unwrap();
        state.tray_menu = Some(menu.clone());
    }

    let app_clone = app.clone();
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
                let mut current_config = load_config(app);
                current_config.auto_call_enabled = !current_config.auto_call_enabled;
                save_config(app, &current_config);
                
                if let Some(window) = app.get_webview_window("main") {
                    let script = format!("if (window.setAutoCall) window.setAutoCall({});", current_config.auto_call_enabled);
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
        .on_tray_icon_event(move |_tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } => {
                if let Some(window) = app_clone.get_webview_window("main") {
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
}

pub fn update_mics_internal(app: tauri::AppHandle, payload: UpdateMicsPayload) {
    let state_mutex = app.state::<AppStateWrapper>();
    let mut state = state_mutex.0.lock().unwrap();

    let mics_changed = state.mics != payload.mics;
    let selected_changed = state.selected_idx != payload.selected_idx;

    if !mics_changed && !selected_changed {
        return; // Nothing to do
    }

    state.mics = payload.mics.clone();
    state.selected_idx = payload.selected_idx;

    if let Some(tray) = app.tray_by_id("main_tray") {
        if mics_changed {
            let config = load_config(&app);
            
            let show_i = MenuItemBuilder::with_id("show", "Show / Hide Web").build(&app).unwrap();
            let show_orb_i = CheckMenuItemBuilder::with_id("show_orb", "Show Orb Gadget")
                .checked(true)
                .build(&app).unwrap();
            let autocall_i = CheckMenuItemBuilder::with_id("autocall", "Auto-Call on Start")
                .checked(config.auto_call_enabled)
                .build(&app).unwrap();
            let quit_i = MenuItemBuilder::with_id("quit", "Quit").build(&app).unwrap();

            let mut mic_submenu = SubmenuBuilder::new(&app, "🎙️ Micrófono");
            if payload.mics.is_empty() {
                let item = MenuItemBuilder::with_id("mic_loading", "No se detectaron micrófonos").enabled(false).build(&app).unwrap();
                mic_submenu = mic_submenu.item(&item);
            } else {
                for (i, mic) in payload.mics.iter().enumerate() {
                    let item = CheckMenuItemBuilder::with_id(format!("mic_{}", i), mic)
                        .checked(i == payload.selected_idx)
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

            let _ = tray.set_menu(Some(menu.clone()));
            state.tray_menu = Some(menu);
            println!("[AuraRTC] Menú del tray reconstruido por cambio en lista de micrófonos.");
        } else if selected_changed {
            // Differential update
            if let Some(menu) = &state.tray_menu {
                for i in 0..payload.mics.len() {
                    if let Some(item) = menu.get(&format!("mic_{}", i)) {
                        if let Some(check_item) = item.as_check_menuitem() {
                            let _ = check_item.set_checked(i == payload.selected_idx);
                        }
                    }
                }
                println!("[AuraRTC] Diferencial: Selección de micrófono actualizada en tray sin reconstruir.");
            }
        }
    }
}

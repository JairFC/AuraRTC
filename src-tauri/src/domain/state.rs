use std::sync::Mutex;
use tauri::menu::Menu;

pub struct AppState {
    pub mics: Vec<String>,
    pub selected_idx: usize,
    pub tray_menu: Option<Menu<tauri::Wry>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            mics: Vec::new(),
            selected_idx: 0,
            tray_menu: None,
        }
    }
}

pub struct AppStateWrapper(pub Mutex<AppState>);

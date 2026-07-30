use tauri::Manager;

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
    let path = crate::domain::config::get_config_path(&app).with_file_name("sesame_dom.html");
    std::thread::spawn(move || {
        let _ = std::fs::write(path, dom);
        println!("[AuraRTC] Recibido DOM de la página para depurar.");
    });
    Ok(())
}

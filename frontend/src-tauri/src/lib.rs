use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    Manager,
};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Build macOS menu bar
            let app_menu = SubmenuBuilder::new(app, "Aether")
                .item(&PredefinedMenuItem::about(app, Some("About Aether"), None)?)
                .separator()
                .item(
                    &MenuItemBuilder::with_id("settings", "Settings")
                        .accelerator("CmdOrCtrl+,")
                        .build(app)?,
                )
                .separator()
                .item(&PredefinedMenuItem::hide(app, None)?)
                .item(&PredefinedMenuItem::hide_others(app, None)?)
                .item(&PredefinedMenuItem::show_all(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None)?)
                .build()?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(
                    &MenuItemBuilder::with_id("new_note", "New Note")
                        .accelerator("CmdOrCtrl+N")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("save_link", "Capture Link")
                        .accelerator("CmdOrCtrl+L")
                        .build(app)?,
                )
                .separator()
                .item(&PredefinedMenuItem::close_window(app, None)?)
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(
                    &MenuItemBuilder::with_id("nav_home", "Dashboard")
                        .accelerator("CmdOrCtrl+1")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("nav_vault", "Vault")
                        .accelerator("CmdOrCtrl+2")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("nav_graph", "Knowledge Graph")
                        .accelerator("CmdOrCtrl+3")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("nav_entities", "Entities")
                        .accelerator("CmdOrCtrl+4")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("nav_chat", "Aether AI")
                        .accelerator("CmdOrCtrl+5")
                        .build(app)?,
                )
                .separator()
                .item(&PredefinedMenuItem::fullscreen(app, None)?)
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Window")
                .item(&PredefinedMenuItem::minimize(app, None)?)
                .item(&PredefinedMenuItem::maximize(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::close_window(app, None)?)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&window_menu)
                .build()?;

            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(move |app_handle, event| {
                let id = event.id().as_ref();
                let route = match id {
                    "settings" => Some("/settings"),
                    "new_note" => Some("/vault/new"),
                    "save_link" => Some("/share"),
                    "nav_home" => Some("/vault"),
                    "nav_vault" => Some("/vault/list"),
                    "nav_graph" => Some("/vault/graph"),
                    "nav_entities" => Some("/entities"),
                    "nav_chat" => Some("/chat"),
                    _ => None,
                };

                if let Some(route) = route {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.eval(&format!(
                            "window.__TAURI_NAVIGATE__ && window.__TAURI_NAVIGATE__('{}')",
                            route
                        ));
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Aether");
}

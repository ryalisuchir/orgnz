// Entry point for the macOS desktop shell. Tauri loads the Expo web export
// (see build.frontendDist in tauri.conf.json, produced by `npm run web:build`)
// into a native webview — the React/Expo Router code itself is untouched,
// it just runs in this window instead of a mobile app or browser tab.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error while running orgnz");
}

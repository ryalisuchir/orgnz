// Wraps @tauri-apps/plugin-notification so the rest of the app can just call
// `desktopNotify(...)` without caring whether it's running inside the Tauri
// macOS shell, a mobile app, or a plain browser tab.
//
// expo-notifications (used everywhere else in the app) only talks to
// Apple/Google push services and does nothing useful inside a Tauri webview,
// so the desktop build needs this separate path for local notifications.

import { Platform } from 'react-native';

// Tauri injects this global into the webview; it's absent in Expo Go, a
// bare mobile build, or a normal browser tab, so it's a safe runtime check.
export function isTauriDesktop(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let permissionChecked = false;
let permissionGranted = false;

export async function ensureDesktopNotificationPermission(): Promise<boolean> {
  if (!isTauriDesktop()) return false;
  if (permissionChecked) return permissionGranted;
  const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
  let granted = await isPermissionGranted();
  if (!granted) {
    const result = await requestPermission();
    granted = result === 'granted';
  }
  permissionChecked = true;
  permissionGranted = granted;
  return granted;
}

export async function sendDesktopNotification(title: string, body: string): Promise<boolean> {
  if (!isTauriDesktop()) return false;
  const granted = await ensureDesktopNotificationPermission();
  if (!granted) return false;
  const { sendNotification } = await import('@tauri-apps/plugin-notification');
  sendNotification({ title, body });
  return true;
}

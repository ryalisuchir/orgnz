import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase, bootstrapSession } from '../lib/supabase';
import { listTasks, listEvents } from '../lib/data';
import { isTauriDesktop, sendDesktopNotification } from '../lib/desktopNotify';
import { LoadingScreen } from '../components/ui';
import { color } from '../lib/theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  // 1. Silently restore session from SecureStore/Keychain on launch — this
  //    is what makes trusted devices skip the login screen entirely.
  useEffect(() => {
    (async () => {
      const session = await bootstrapSession();
      setHasSession(!!session);
      setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // 2. Optional local biometric gate, independent of the Supabase session —
  //    controlled by user_settings.face_id_lock (toggled in Settings).
  useEffect(() => {
    if (!ready || !hasSession) return;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const { data: settings, error: settingsErr } = await supabase
          .from('user_settings')
          .select('face_id_lock')
          .eq('user_id', data.user?.id)
          .maybeSingle();

        // PGRST205: table hasn't been created yet (migrations not applied)
        if (settingsErr && (settingsErr as any).code === 'PGRST205') {
          setUnlocked(true);
          return;
        }

        if (!settings?.face_id_lock || Platform.OS === 'web') {
          setUnlocked(true);
          return;
        }
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        if (!hasHardware) {
          setUnlocked(true);
          return;
        }
        const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock orgnz' });
        setUnlocked(result.success);
      } catch {
        setUnlocked(true);
      }
    })();
  }, [ready, hasSession]);

  useEffect(() => {
    if (!ready) return;
    // Defer to next tick so the Stack navigator has a chance to mount.
    // Without this, router.replace() fires before the navigator exists
    // (because the component just transitioned from LoadingScreen to Stack)
    // and throws "Attempted to navigate before mounting the Root Layout."
    if (!segments[0]) return; // navigator hasn't resolved routes yet
    const timer = setTimeout(() => {
      const inAuthGroup = segments[0] === 'login' || segments[0] === 'reset-password';
      if (!hasSession && !inAuthGroup) router.replace('/login');
      if (hasSession && segments[0] === 'login') router.replace('/');
    }, 0);
    return () => clearTimeout(timer);
  }, [ready, hasSession, segments]);

  // 3. Desktop-only morning digest: expo-notifications has no push channel
  //    inside a Tauri webview, so while the app is open we poll once a
  //    minute and fire a local notification once we cross the user's
  //    configured digest time (mirrors what the morning-digest edge
  //    function does server-side for mobile via Expo push).
  useEffect(() => {
    if (!ready || !hasSession || !unlocked || !isTauriDesktop()) return;
    let lastFiredDate: string | null = null;

    async function checkAndFire() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      try {
        const { data: settings, error: settingsErr } = await supabase
          .from('user_settings')
          .select('morning_digest_enabled, morning_digest_time')
          .eq('user_id', uid)
          .maybeSingle();
        if (settingsErr || !settings?.morning_digest_enabled) return;

        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const configuredHHMM = (settings.morning_digest_time ?? '07:30:00').slice(0, 5);
        if (nowHHMM !== configuredHHMM || lastFiredDate === todayStr) return;

        const [tasks, events] = await Promise.all([
          listTasks(),
          listEvents({ from: todayStr, to: todayStr }),
        ]);
        const taskCount = tasks.filter((t) => t.due_date === todayStr && t.status !== 'done').length;
        const eventCount = events.length;
        if (taskCount === 0 && eventCount === 0) return;

        const body = [
          taskCount ? `${taskCount} task${taskCount === 1 ? '' : 's'} due` : null,
          eventCount ? `${eventCount} event${eventCount === 1 ? '' : 's'} today` : null,
        ]
          .filter(Boolean)
          .join(' · ');

        await sendDesktopNotification('Today in orgnz', body);
        lastFiredDate = todayStr;
      } catch {}
    }

    checkAndFire();
    const interval = setInterval(checkAndFire, 60_000);
    return () => clearInterval(interval);
  }, [ready, hasSession, unlocked]);

  if (!ready) return <LoadingScreen />;
  if (hasSession && !unlocked) return <LoadingScreen />;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: color.bg },
          headerTintColor: color.ink,
          headerTitleStyle: { color: color.ink },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: color.bg },
          animation: 'slide_from_right',
          animationDuration: 280,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="reset-password" options={{ headerShown: true, title: 'Reset password', animation: 'slide_from_right' }} />
        <Stack.Screen name="add-task" options={{ presentation: 'modal', headerShown: true, title: 'New task', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="day-review" options={{ presentation: 'modal', headerShown: true, title: "Today's review", animation: 'slide_from_bottom' }} />
        <Stack.Screen name="task/[id]" options={{ headerShown: true, title: '', animation: 'slide_from_right' }} />
        <Stack.Screen name="class/[id]" options={{ headerShown: true, title: '', animation: 'slide_from_right' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
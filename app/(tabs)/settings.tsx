import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Switch, StyleSheet, Alert, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { color, space, radius, type } from '../../lib/theme';
import { SectionLabel, SecondaryButton, PrimaryButton } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { listNotionDatabases } from '../../lib/notion';
import { isTauriDesktop, ensureDesktopNotificationPermission } from '../../lib/desktopNotify';

type NotionDatabase = { id: string; title: string; url: string };

export default function Settings() {
  const [userId, setUserId] = useState<string | null>(null);
  const [notionDatabaseId, setNotionDatabaseId] = useState('');
  const [notionConnected, setNotionConnected] = useState<boolean | null>(null); // null = loading
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [digestTime, setDigestTime] = useState('07:30');
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [faceIdLock, setFaceIdLock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushRegistered, setPushRegistered] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;

      try {
        const { data: settings, error: settingsErr } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle();

        // PGRST205: table doesn't exist in schema cache — Supabase project
        // migrations haven't been applied yet. Fall back to defaults silently.
        if (settingsErr) {
          if ((settingsErr as any).code === 'PGRST205') {
            console.warn('user_settings table not found — run supabase db push');
            setNotionConnected(false);
            return;
          }
          throw settingsErr;
        }

        if (settings) {
          setNotionDatabaseId(settings.notion_database_id ?? '');
          setNotionConnected(!!settings.notion_access_token);
          setDigestTime((settings.morning_digest_time ?? '07:30:00').slice(0, 5));
          setDigestEnabled(settings.morning_digest_enabled ?? true);
          setFaceIdLock(settings.face_id_lock ?? false);
        } else {
          // No settings row yet — user hasn't configured anything
          setNotionConnected(false);
        }
      } catch (e: any) {
        console.warn('Failed to load settings:', e?.message ?? e);
        setNotionConnected(false);
      }
    })();

    // Handle the orgnz://settings?notion=connected deep link fired by the
    // notion-oauth-callback edge function after a successful OAuth exchange.
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('notion=connected')) {
        setNotionConnected(true);
        // Auto-fetch databases after the token is saved (brief timeout for DB write)
        setTimeout(() => fetchDatabases(), 800);
      }
    });
    return () => sub.remove();
  }, []);

  async function save() {
    if (!userId) return;
    setSaving(true);
    try {
      await supabase.from('user_settings').upsert({
        user_id: userId,
        notion_database_id: notionDatabaseId.trim() || null,
        morning_digest_time: `${digestTime}:00`,
        morning_digest_enabled: digestEnabled,
        face_id_lock: faceIdLock,
      });
      Alert.alert('Saved');
    } catch (e: any) {
      if ((e as any).code === 'PGRST205') {
        Alert.alert('Not available', 'Run supabase db push to create the user_settings table first.');
      } else {
        Alert.alert('Save failed', e?.message ?? String(e));
      }
    } finally {
      setSaving(false);
    }
  }

  async function connectNotion() {
    // See lib/notion.ts#buildNotionAuthUrl — requires NOTION_CLIENT_ID and
    // a redirect URI pointing at the notion-oauth-callback edge function,
    // both configured once when you set up the Notion integration.
    const clientId = process.env.EXPO_PUBLIC_NOTION_CLIENT_ID;
    const redirectUri = process.env.EXPO_PUBLIC_NOTION_REDIRECT_URI;
    if (!clientId || !redirectUri || !userId) {
      Alert.alert('Notion not configured', 'Set EXPO_PUBLIC_NOTION_CLIENT_ID and EXPO_PUBLIC_NOTION_REDIRECT_URI (see README).');
      return;
    }
    const { buildNotionAuthUrl } = await import('../../lib/notion');
    // Encode the platform-specific return URL in state so the edge function
    // can redirect back correctly: web → http://localhost:8081, mobile → orgnz://
    const returnUrl = Linking.createURL('settings');
    const state = JSON.stringify({ userId, returnUrl });
    const url = buildNotionAuthUrl(clientId, redirectUri, state);
    Linking.openURL(url);
  }

  async function fetchDatabases() {
    setLoadingDatabases(true);
    const result = await listNotionDatabases();
    setLoadingDatabases(false);
    if (result.error) {
      Alert.alert('Could not list databases', result.error);
      return;
    }
    setDatabases(result.databases ?? []);
    // Auto-select if there's exactly one database and user hasn't set one yet
    if (result.databases?.length === 1 && !notionDatabaseId) {
      setNotionDatabaseId(result.databases[0].id);
    }
  }

  async function registerForPush() {
    if (isTauriDesktop()) {
      // Desktop has no push service to register with — the morning digest
      // is instead delivered by a local check while the app is open (see
      // RootLayout's digest-polling effect), fired through Tauri's native
      // notification API. We just need OS permission for it here.
      const granted = await ensureDesktopNotificationPermission();
      if (!granted) {
        Alert.alert('Permission denied', 'Enable notifications for orgnz in macOS System Settings → Notifications.');
        return;
      }
      setPushRegistered(true);
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert('Not available on web', 'Push notifications require the iOS or desktop app.');
      return;
    }
    const perm = await Notifications.requestPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission denied', 'Enable notifications in system settings to get the morning digest.');
      return;
    }
    const token = await Notifications.getExpoPushTokenAsync();
    await supabase.from('push_tokens').upsert(
      { user_id: userId, expo_push_token: token.data, device_label: Platform.OS },
      { onConflict: 'expo_push_token' }
    );
    setPushRegistered(true);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 100 }}>
        <Text style={type.display}>Settings</Text>

        <SectionLabel>Notion</SectionLabel>
        <View style={styles.notionCard}>
          <View style={styles.notionCardHeader}>
            <Text style={styles.notionIcon}>📋</Text>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontWeight: '700', color: color.ink }]}>Notion Integration</Text>
              <Text style={[type.caption, { marginTop: 2 }]}>
                Sync tasks to a Notion database, then drag them onto your calendar.
              </Text>
            </View>
            {notionConnected === null ? (
              <View style={styles.notionDisconnectedBadge}>
                <ActivityIndicator size="small" color={color.inkFaint} />
              </View>
            ) : notionConnected ? (
              <View style={styles.notionConnectedBadge}>
                <Text style={styles.notionConnectedBadgeText}>✓ Connected</Text>
              </View>
            ) : (
              <View style={styles.notionDisconnectedBadge}>
                <Text style={styles.notionDisconnectedBadgeText}>Disconnected</Text>
              </View>
            )}
          </View>

          {notionConnected === null ? (
            <View style={{ padding: space.md, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={color.accent} />
            </View>
          ) : !notionConnected ? (
            <>
              <View style={styles.notionDivider} />
              <Pressable
                style={({ pressed }) => [
                  styles.notionConnectButton,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}
                onPress={connectNotion}
              >
                <Text style={styles.notionConnectButtonText}>🔗  Connect Notion Workspace</Text>
                <Text style={[type.caption, { color: color.inkSoft, marginTop: 4 }]}>
                  You'll be redirected to Notion to authorize access
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.notionDivider} />
              <View style={{ padding: space.md }}>
                {loadingDatabases ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm }}>
                    <ActivityIndicator size="small" color={color.accent} />
                    <Text style={[type.caption, { color: color.inkSoft }]}>Loading your databases…</Text>
                  </View>
                ) : databases.length > 0 ? (
                  <>
                    <Text style={[type.caption, { marginBottom: space.sm, color: color.inkSoft }]}>
                      Default / fallback database for tasks without a class database:
                    </Text>
                    {databases.map((db) => (
                      <Pressable
                        key={db.id}
                        style={({ pressed }) => [
                          styles.dbOption,
                          notionDatabaseId === db.id && styles.dbOptionSelected,
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() => setNotionDatabaseId(db.id)}
                      >
                        <Text style={[type.body, { color: notionDatabaseId === db.id ? color.accent : color.ink }]}>
                          📊 {db.title}
                        </Text>
                        {notionDatabaseId === db.id && (
                          <Text style={{ color: color.accent, fontSize: 16 }}>✓</Text>
                        )}
                      </Pressable>
                    ))}
                  </>
                ) : (
                  <>
                    <Text style={[type.caption, { marginBottom: space.sm, color: color.inkSoft }]}>
                      No databases found. Make sure you've added the integration to a database in Notion (••• → Add connections).
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={notionDatabaseId}
                      onChangeText={setNotionDatabaseId}
                      placeholder="Or paste a database ID manually"
                      placeholderTextColor={color.inkFaint}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </>
                )}
                <Pressable
                  style={({ pressed }) => [
                    styles.notionRefreshButton,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={fetchDatabases}
                >
                  <Text style={[type.caption, { color: color.accent }]}>
                    {loadingDatabases ? 'Loading…' : '↻ Refresh database list'}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.notionDivider} />
              <Pressable
                style={({ pressed }) => [
                  styles.notionReconnectButton,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={connectNotion}
              >
                <Text style={[type.caption, { color: color.accent }]}>↻ Reconnect a different workspace</Text>
              </Pressable>
            </>
          )}
        </View>

        <SectionLabel>Morning digest</SectionLabel>
        <View style={styles.rowBetween}>
          <Text style={type.body}>Send a daily summary push</Text>
          <Switch value={digestEnabled} onValueChange={setDigestEnabled} trackColor={{ true: color.accent, false: color.line }} ios_backgroundColor={color.line} />
        </View>
        <TextInput
          style={[styles.input, { marginTop: space.sm }]}
          value={digestTime}
          onChangeText={setDigestTime}
          placeholder="07:30"
          placeholderTextColor={color.inkFaint}
        />
        <View style={{ marginTop: space.sm }}>
          <SecondaryButton
            title={pushRegistered ? 'Notifications enabled on this device' : 'Enable notifications on this device'}
            onPress={registerForPush}
            disabled={pushRegistered}
          />
        </View>

        <SectionLabel>Security</SectionLabel>
        <View style={styles.rowBetween}>
          <Text style={type.body}>Require Face ID / Touch ID to open orgnz</Text>
          <Switch value={faceIdLock} onValueChange={setFaceIdLock} trackColor={{ true: color.accent, false: color.line }} ios_backgroundColor={color.line} />
        </View>
        <Text style={type.caption}>Your Supabase session itself stays signed in — this just adds a local lock screen.</Text>

        <View style={{ marginTop: space.xl }}>
          <PrimaryButton title={saving ? 'Saving…' : 'Save settings'} onPress={save} disabled={saving} />
        </View>

        <View style={{ marginTop: space.xxl }}>
          <SecondaryButton title="Sign out" onPress={signOut} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 15,
    color: color.ink,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.sm,
  },
  // Notion connection card
  notionCard: {
    marginTop: space.sm,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  notionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    gap: space.md,
  },
  notionIcon: {
    fontSize: 28,
  },
  notionConnectedBadge: {
    backgroundColor: color.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  notionConnectedBadgeText: {
    color: color.success,
    fontSize: 12,
    fontWeight: '700',
  },
  notionDisconnectedBadge: {
    backgroundColor: color.lineSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  notionDisconnectedBadgeText: {
    color: color.inkFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  notionDivider: {
    height: 1,
    backgroundColor: color.lineSoft,
  },
  notionConnectButton: {
    margin: space.md,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.accent,
    alignItems: 'center',
  },
  notionConnectButtonText: {
    color: color.white,
    fontSize: 15,
    fontWeight: '700',
  },
  notionReconnectButton: {
    marginTop: space.sm,
    paddingVertical: 6,
    alignSelf: 'flex-end',
  },
  notionRefreshButton: {
    marginTop: space.sm,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  dbOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    marginBottom: space.xs,
  },
  dbOptionSelected: {
    borderColor: color.accent,
    backgroundColor: color.accentSoft,
  },
});

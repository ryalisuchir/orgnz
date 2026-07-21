import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { color, space, radius, type } from '../lib/theme';
import { PrimaryButton } from '../components/ui';
import { supabase } from '../lib/supabase';

// Reached via the link Supabase emails from resetPasswordForEmail (see
// login.tsx). supabase-js's client has detectSessionInUrl on by default, so
// by the time this screen mounts it's already parsed the recovery tokens out
// of the URL and established a temporary session — updateUser() below then
// just sets the new password on that session.
export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Give supabase-js a moment to finish parsing the recovery token from
    // the URL before we check for a session.
    supabase.auth.getSession().then(() => setReady(true));
  }, []);

  async function submit() {
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      setDone(true);
      setTimeout(() => router.replace('/'), 1500);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.container}>
          <Text style={type.display}>New password</Text>
          <Text style={[type.subtitle, { marginBottom: space.xxl }]}>
            {done ? "You're all set — redirecting…" : 'Choose a new password for your orgnz account.'}
          </Text>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={[type.body, { color: color.danger, fontSize: 13.5 }]}>{error}</Text>
            </View>
          )}

          {!done && (
            <>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="New password"
                placeholderTextColor={color.inkFaint}
                secureTextEntry
              />
              <TextInput
                style={[styles.input, { marginTop: space.sm }]}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Confirm new password"
                placeholderTextColor={color.inkFaint}
                secureTextEntry
              />
              <View style={{ marginTop: space.lg }}>
                <PrimaryButton
                  title={busy ? 'Saving…' : 'Save new password'}
                  onPress={submit}
                  disabled={busy || !ready || !password || !confirm}
                />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xl },
  input: {
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    fontSize: 15,
    color: color.ink,
  },
  errorBanner: {
    borderWidth: 1,
    borderColor: color.danger,
    backgroundColor: color.dangerSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
});
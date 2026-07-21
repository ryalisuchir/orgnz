import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { color, space, radius, type } from '../lib/theme';
import { PrimaryButton, SecondaryButton } from '../components/ui';
import { supabase } from '../lib/supabase';

// Maps Supabase's auth error codes/messages to plain-English copy shown
// directly on the screen. Relying on Alert.alert for this was the bug:
// react-native-web doesn't reliably surface Alert on every browser, so
// failures could look like "nothing happened" instead of an actual error.
function friendlyAuthError(error: any): string {
  const code = error?.code ?? '';
  const msg = (error?.message ?? '').toLowerCase();

  if (code === 'user_already_exists' || msg.includes('already registered')) {
    return "An account with this email already exists — try signing in instead.";
  }
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return "That email or password isn't right. Double check them, or reset your password below.";
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'Check your inbox — confirm your email before signing in.';
  }
  if (code === 'weak_password' || msg.includes('password')) {
    return 'Password must be at least 6 characters.';
  }
  if (code === 'over_email_send_rate_limit' || msg.includes('rate limit')) {
    return 'Too many attempts — wait a minute and try again.';
  }
  if (code === 'signup_disabled') {
    return 'Sign-ups are currently turned off for this project.';
  }
  return error?.message ?? 'Something went wrong. Please try again.';
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign_in' | 'sign_up' | 'forgot'>('sign_in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { error: authError } =
        mode === 'sign_in'
          ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
          : await supabase.auth.signUp({ email: email.trim(), password });
      if (authError) throw authError;
      // Successful sign-in updates the session; RootLayout's onAuthStateChange
      // listener picks it up and redirects automatically. Session persists
      // via SecureStore/Keychain from here on — no repeat login on this device.
    } catch (e: any) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendResetLink() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError('Enter your email above first.');
      return;
    }
    setBusy(true);
    try {
      const redirectTo = Linking.createURL('/reset-password');
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (authError) throw authError;
      setNotice(`Reset link sent to ${email.trim()} — check your inbox.`);
    } catch (e: any) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.container}>
          <Text style={type.display}>orgnz</Text>
          <Text style={[type.subtitle, { marginBottom: space.xxl }]}>
            {mode === 'sign_in' ? 'Welcome back.' : mode === 'sign_up' ? 'Create your account.' : 'Reset your password.'}
          </Text>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={[type.body, { color: color.danger, fontSize: 13.5 }]}>{error}</Text>
            </View>
          )}
          {notice && (
            <View style={styles.noticeBanner}>
              <Text style={[type.body, { color: color.success, fontSize: 13.5 }]}>{notice}</Text>
            </View>
          )}

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@school.edu"
            placeholderTextColor={color.inkFaint}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {mode !== 'forgot' && (
            <TextInput
              style={[styles.input, { marginTop: space.sm }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={color.inkFaint}
              secureTextEntry
            />
          )}

          <View style={{ marginTop: space.lg }}>
            {mode === 'forgot' ? (
              <PrimaryButton title={busy ? 'Sending…' : 'Send reset link'} onPress={sendResetLink} disabled={busy || !email} />
            ) : (
              <PrimaryButton
                title={busy ? 'Please wait…' : mode === 'sign_in' ? 'Sign in' : 'Sign up'}
                onPress={submit}
                disabled={busy || !email || !password}
              />
            )}
          </View>

          {mode === 'sign_in' && (
            <View style={{ marginTop: space.md, alignItems: 'center' }}>
              <Text
                style={[type.caption, { color: color.accent, fontWeight: '700' }]}
                onPress={() => {
                  setError(null);
                  setNotice(null);
                  setMode('forgot');
                }}
              >
                Forgot password?
              </Text>
            </View>
          )}

          <View style={{ marginTop: space.sm }}>
            <SecondaryButton
              title={
                mode === 'forgot'
                  ? 'Back to sign in'
                  : mode === 'sign_in'
                  ? 'Need an account? Sign up'
                  : 'Have an account? Sign in'
              }
              onPress={() => {
                setError(null);
                setNotice(null);
                setMode((m) => (m === 'forgot' ? 'sign_in' : m === 'sign_in' ? 'sign_up' : 'sign_in'));
              }}
            />
          </View>

          <Text style={[type.caption, { marginTop: space.xxl, textAlign: 'center' }]}>
            You'll only need to do this once per device — orgnz keeps you signed in.
          </Text>
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
  noticeBanner: {
    borderWidth: 1,
    borderColor: color.success,
    backgroundColor: color.successSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
});
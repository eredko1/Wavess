import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';

type EmailStep = 'idle' | 'code' | 'password';

export default function SignInScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [googleLoading, setGoogleLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [emailStep, setEmailStep] = useState<EmailStep>('idle');
  const [emailLoading, setEmailLoading] = useState(false);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      const redirectTo = makeRedirectUri({ scheme: 'village', path: 'auth-callback' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) {
        Alert.alert('Sign-in failed', error?.message ?? 'Could not start sign-in.');
        return;
      }
      await WebBrowser.openBrowserAsync(data.url);
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    setEmailLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email: trimmed });
    setEmailLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setEmailStep('code');
  }

  async function handleVerifyCode() {
    const trimmed = otpCode.trim();
    if (trimmed.length < 4) {
      Alert.alert('Invalid code', 'Enter the 6-digit code from your email.');
      return;
    }
    setEmailLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: trimmed,
      type: 'email',
    });
    setEmailLoading(false);
    if (error) Alert.alert('Invalid code', "That code didn't work. Check your email and try again.");
  }

  async function handlePasswordSignIn() {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!password) {
      Alert.alert('Missing password', 'Please enter your password.');
      return;
    }
    setEmailLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    setEmailLoading(false);
    if (error) Alert.alert('Sign-in failed', error.message);
  }

  const cardMaxWidth = isTablet ? 440 : undefined;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient colors={['#6366F1', '#8B5CF6', 'transparent']} style={styles.blob} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} />
      <ScrollView contentContainerStyle={[styles.scroll, isTablet && styles.scrollTablet]} keyboardShouldPersistTaps="handled">
        <View style={[styles.inner, cardMaxWidth ? { maxWidth: cardMaxWidth, alignSelf: 'center', width: '100%' } : null]}>
          <Text style={styles.logo}>🏘️</Text>
          <Text style={styles.title}>Village</Text>
          <Text style={styles.tagline}>Family, simplified.</Text>

          <View style={styles.card}>
            <Text style={styles.subtitle}>Sign in or create an account to get started.</Text>

            <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleSignIn} disabled={googleLoading} activeOpacity={0.85}>
              {googleLoading ? <ActivityIndicator color="#1a1a1a" /> : <Text style={styles.googleBtnText}>Continue with Google</Text>}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {emailStep === 'idle' && (
              <>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  placeholderTextColor="#636366"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={[styles.emailBtn, emailLoading && styles.btnDisabled]} onPress={handleSendCode} disabled={emailLoading} activeOpacity={0.85}>
                  {emailLoading ? <ActivityIndicator color="#818CF8" /> : <Text style={styles.emailBtnText}>Continue with email</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setEmailStep('password'); }} style={{ alignItems: 'center', marginTop: 4 }}>
                  <Text style={styles.switchText}>Sign in with password instead</Text>
                </TouchableOpacity>
              </>
            )}

            {emailStep === 'code' && (
              <>
                <View style={styles.sentNote}>
                  <Text style={styles.sentNoteText}>📬  Check your inbox — we sent a 6-digit code to</Text>
                  <Text style={[styles.sentNoteText, { color: '#FFFFFF', marginTop: 2 }]}>{email}</Text>
                </View>
                <TextInput
                  style={[styles.input, { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '700' }]}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  placeholder="000000"
                  placeholderTextColor="#636366"
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
                <TouchableOpacity style={[styles.emailBtn, emailLoading && styles.btnDisabled]} onPress={handleVerifyCode} disabled={emailLoading} activeOpacity={0.85}>
                  {emailLoading ? <ActivityIndicator color="#818CF8" /> : <Text style={styles.emailBtnText}>Verify code</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setEmailStep('idle'); setOtpCode(''); }} style={{ alignItems: 'center', marginTop: 4 }}>
                  <Text style={styles.switchText}>Use a different email</Text>
                </TouchableOpacity>
              </>
            )}

            {emailStep === 'password' && (
              <>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  placeholderTextColor="#636366"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor="#636366"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={[styles.emailBtn, emailLoading && styles.btnDisabled]} onPress={handlePasswordSignIn} disabled={emailLoading} activeOpacity={0.85}>
                  {emailLoading ? <ActivityIndicator color="#818CF8" /> : <Text style={styles.emailBtnText}>Sign in</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setEmailStep('idle'); setPassword(''); }} style={{ alignItems: 'center', marginTop: 4 }}>
                  <Text style={styles.switchText}>Use magic link instead</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <Text style={styles.hint}>New to Village? You'll set up your family after signing in.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  blob: { position: 'absolute', top: -120, left: -80, width: 420, height: 420, borderRadius: 210, opacity: 0.35 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 60 },
  scrollTablet: { paddingHorizontal: 48 },
  inner: { gap: 0 },
  logo: { fontSize: 56, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 34, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', letterSpacing: -0.5 },
  tagline: { fontSize: 16, color: '#8E8E93', textAlign: 'center', marginTop: 6, marginBottom: 32 },
  card: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 14 },
  subtitle: { color: '#8E8E93', fontSize: 14, textAlign: 'center' },
  googleBtn: { backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  googleBtnText: { color: '#1a1a1a', fontSize: 16, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerText: { color: '#636366', fontSize: 12 },
  input: { backgroundColor: '#2C2C2E', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, color: '#FFFFFF', fontSize: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  emailBtn: { borderRadius: 12, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(99,102,241,0.5)', backgroundColor: 'rgba(99,102,241,0.1)' },
  emailBtnText: { color: '#818CF8', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  sentNote: { backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 10, padding: 12 },
  sentNoteText: { color: '#8E8E93', fontSize: 13, textAlign: 'center' },
  switchText: { color: '#636366', fontSize: 13 },
  hint: { color: '#636366', fontSize: 13, textAlign: 'center', marginTop: 20 },
});

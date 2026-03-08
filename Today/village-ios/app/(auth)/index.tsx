import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const [loading, setLoading] = useState(false);

  async function handleGoogleSignIn() {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'village://auth-callback',
          skipBrowserRedirect: true,
        },
      });

      if (error || !data.url) {
        Alert.alert('Sign-in failed', error?.message ?? 'Could not start sign-in. Please try again.');
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, 'village://auth-callback');

      if (result.type === 'success') {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        if (code) {
          // PKCE flow — exchange code for session
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) Alert.alert('Sign-in failed', exchangeError.message);
        } else {
          // Implicit flow fallback — tokens arrive in URL fragment
          const hash = new URLSearchParams(url.hash.replace('#', ''));
          const accessToken = hash.get('access_token');
          const refreshToken = hash.get('refresh_token');
          if (accessToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken ?? '',
            });
            if (sessionError) Alert.alert('Sign-in failed', sessionError.message);
          }
        }
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#6366F1', '#8B5CF6', 'transparent']}
        style={styles.blob}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
      />

      <View style={styles.content}>
        <Text style={styles.logo}>🏘️</Text>
        <Text style={styles.title}>Village</Text>
        <Text style={styles.tagline}>Family, simplified.</Text>

        <View style={styles.card}>
          <Text style={styles.subtitle}>
            Sign in or create an account to get started.
          </Text>

          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#1a1a1a" />
            ) : (
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          New to Village? You&apos;ll set up your family after signing in.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  blob: {
    position: 'absolute',
    top: -120,
    left: -80,
    width: 420,
    height: 420,
    borderRadius: 210,
    opacity: 0.35,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 60,
  },
  logo: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 40,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 16,
  },
  subtitle: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
  },
  googleBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtnText: {
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    color: '#636366',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20,
  },
});

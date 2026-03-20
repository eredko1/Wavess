import 'react-native-url-polyfill/auto';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { ShareIntentProvider } from 'expo-share-intent';
import ShareIntentHandler from '@/components/ShareIntentHandler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { LOCAL_API_BASE } from '@/lib/config';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerPushToken(session: Session) {
  if (!Device.isDevice) return; // simulators don't get real tokens
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  const finalStatus = existing === 'granted'
    ? existing
    : (await Notifications.requestPermissionsAsync()).status;

  if (finalStatus !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  if (!expoPushToken) return;

  // Save token to the server
  await fetch(`${LOCAL_API_BASE}/api/push/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ push_token: expoPushToken }),
  }).catch(() => {}); // best-effort
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  // Handle notification taps → navigate to event
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, string>;
      if (data?.event_id) router.push(`/event/${data.event_id}` as any);
      else if (data?.screen === 'loop') router.push('/(tabs)/loop' as any);
    });

    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, string>;
      if (data?.event_id) router.push(`/event/${data.event_id}` as any);
      else if (data?.screen === 'loop') router.push('/(tabs)/loop' as any);
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) registerPushToken(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) registerPushToken(session);
    });

    // Handle Google OAuth deep link — fires here because _layout is mounted
    // before auth-callback.tsx, so the Linking event is always captured.
    async function handleOAuthUrl(url: string) {
      if (!url.startsWith('village://auth-callback')) return;
      WebBrowser.dismissBrowser();
      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get('code');
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
          // onAuthStateChange above fires → setSession → routing to /(tabs)
          return;
        }
        // Implicit flow fallback (hash fragment)
        const hash = new URLSearchParams(parsed.hash.replace('#', ''));
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        if (accessToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' });
        }
      } catch { /* malformed URL */ }
    }

    // Warm start: app already running when Intent fires
    const linkSub = Linking.addEventListener('url', ({ url }) => handleOAuthUrl(url));

    // Cold start: app launched by the Intent
    Linking.getInitialURL().then(url => { if (url) handleOAuthUrl(url); });

    return () => {
      subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  useEffect(() => {
    if (session === undefined) return; // still loading

    const inAuth = segments[0] === '(auth)';

    if (!session && !inAuth) {
      router.replace('/(auth)');
    } else if (session && inAuth) {
      router.replace('/(tabs)');
    }
  }, [session, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <AuthGate>
            <Stack screenOptions={{ headerShown: false }} />
          </AuthGate>
        </SafeAreaProvider>
      </GestureHandlerRootView>
      <ShareIntentHandler />
    </ShareIntentProvider>
  );
}

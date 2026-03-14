import 'react-native-url-polyfill/auto';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import ShareIntentHandler from '@/components/ShareIntentHandler';
import * as Linking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { LOCAL_API_BASE } from '@/lib/config';
import WelcomeModal from '@/components/WelcomeModal';

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

type FamilyStatus = 'loading' | 'setup_needed' | 'ready';

function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [familyStatus, setFamilyStatus] = useState<FamilyStatus>('loading');
  const [showWelcome, setShowWelcome] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  async function checkFamily(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('family_id')
      .eq('id', userId)
      .maybeSingle();
    setFamilyStatus(data?.family_id ? 'ready' : 'setup_needed');
  }

  // Handle notification taps → navigate to event
  useEffect(() => {
    // App opened from a notification (backgrounded or killed)
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
      if (data.session) {
        registerPushToken(data.session);
        checkFamily(data.session.user.id);
      } else {
        setFamilyStatus('ready'); // no session — routing handled below
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess) {
        registerPushToken(sess);
        checkFamily(sess.user.id);
      } else {
        setFamilyStatus('ready');
      }
    });

    // Android: Chrome Custom Tabs fires an Intent for village:// rather than
    // returning to openAuthSessionAsync, so we catch it here as a fallback.
    const linkSub = Linking.addEventListener('url', async ({ url }) => {
      if (!url.startsWith('village://auth-callback')) return;
      const code = new URL(url).searchParams.get('code');
      if (code) await supabase.auth.exchangeCodeForSession(code);
    });

    return () => {
      subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  useEffect(() => {
    if (session === undefined || familyStatus === 'loading') return;

    const inAuth = segments[0] === '(auth)';
    const inSetup = segments[0] === '(setup)';

    if (!session) {
      if (!inAuth) router.replace('/(auth)');
      return;
    }

    if (familyStatus === 'setup_needed') {
      if (!inSetup) router.replace('/(setup)');
    } else {
      if (inAuth || inSetup) {
        router.replace('/(tabs)');
      } else {
        // Check if we should show the welcome modal (first-time, no children)
        async function checkWelcome() {
          const { data: userData } = await supabase
            .from('users')
            .select('family_id')
            .eq('id', session!.user.id)
            .maybeSingle();
          if (userData?.family_id) {
            const welcomed = await AsyncStorage.getItem('village_welcomed');
            if (!welcomed) {
              const { count } = await supabase
                .from('children')
                .select('id', { count: 'exact', head: true })
                .eq('family_id', userData.family_id);
              if ((count ?? 0) === 0) setShowWelcome(true);
            }
          }
        }
        checkWelcome();
      }
    }
  }, [session, familyStatus, segments]);

  return (
    <>
      {children}
      <WelcomeModal
        visible={showWelcome}
        onDismiss={() => {
          AsyncStorage.setItem('village_welcomed', '1');
          setShowWelcome(false);
        }}
      />
    </>
  );
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

import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code: string }>();

  useEffect(() => {
    if (code) {
      supabase.auth.exchangeCodeForSession(code);
      // onAuthStateChange in _layout.tsx handles redirect to tabs on success
    }
  }, [code]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#6366F1" size="large" />
    </View>
  );
}

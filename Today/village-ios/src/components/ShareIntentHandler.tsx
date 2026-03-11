import { useEffect, useState } from 'react';
import { Modal, View, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useShareIntentContext } from 'expo-share-intent';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { LOCAL_API_BASE } from '@/lib/config';
import * as FileSystem from 'expo-file-system';

export default function ShareIntentHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [processing, setProcessing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!hasShareIntent || !shareIntent) return;
    handleShared();
  }, [hasShareIntent]);

  async function handleShared() {
    const files = (shareIntent as any)?.files;
    const imageFile = files?.find((f: any) => f.mimeType?.startsWith('image/'));

    if (!imageFile) {
      resetShareIntent();
      return;
    }

    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Sign in required', 'Please sign in to Village first.');
        resetShareIntent();
        setProcessing(false);
        return;
      }

      const base64 = await FileSystem.readAsStringAsync(imageFile.path, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const res = await fetch(`${LOCAL_API_BASE}/api/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          image_base64: base64,
          mime_type: imageFile.mimeType ?? 'image/jpeg',
          source: 'share_sheet',
        }),
      });

      const data = await res.json();
      resetShareIntent();
      setProcessing(false);

      if (res.ok && data.parsed?.length) {
        router.push('/(tabs)');
        Alert.alert(
          `Found ${data.parsed.length} event${data.parsed.length !== 1 ? 's' : ''}! 🎉`,
          'Check your Timeline — tap any event to review and confirm it.',
        );
      } else {
        Alert.alert(
          'No events found',
          "We couldn't find any events in that image. Try adding an event manually from the Timeline tab.",
        );
      }
    } catch {
      Alert.alert('Something went wrong', 'Could not process the image. Please try again.');
      resetShareIntent();
      setProcessing(false);
    }
  }

  if (!processing) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ActivityIndicator color="#6366F1" size="large" style={{ marginBottom: 12 }} />
          <Text style={styles.title}>Scanning for events...</Text>
          <Text style={styles.sub}>Village AI is reading your screenshot</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: 280,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  sub: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
  },
});

import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { LOCAL_API_BASE } from '@/lib/config';

type Step = 'name' | 'children' | 'done';

interface ChildRow {
  name: string;
  ageYears: string;
}

export default function SetupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [step, setStep] = useState<Step>('name');
  const [familyId, setFamilyId] = useState('');

  // Step 1
  const [displayName, setDisplayName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [step1Loading, setStep1Loading] = useState(false);

  // Join with code alternative
  const [joinMode, setJoinMode] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);

  // Step 2
  const [children, setChildren] = useState<ChildRow[]>([{ name: '', ageYears: '' }]);
  const [step2Loading, setStep2Loading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const name = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '';
      if (name) setDisplayName(name);
    });
  }, []);

  async function handleCreateFamily() {
    if (!displayName.trim()) { Alert.alert('Required', 'Please enter your name.'); return; }
    if (!familyName.trim()) { Alert.alert('Required', 'Please enter a family name.'); return; }
    setStep1Loading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LOCAL_API_BASE}/api/setup/family`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ displayName: displayName.trim(), familyName: familyName.trim(), zipCode: zipCode.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { Alert.alert('Error', json.error ?? 'Could not create family.'); return; }
      setFamilyId(json.familyId ?? '');
      setStep('children');
    } catch {
      Alert.alert('Error', 'Network error — check your connection.');
    } finally {
      setStep1Loading(false);
    }
  }

  async function handleJoinWithCode() {
    const clean = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 6) { Alert.alert('Invalid code', 'Enter the 6-character code.'); return; }
    setJoinLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LOCAL_API_BASE}/api/family/join-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ code: clean }),
      });
      const json = await res.json();
      if (!res.ok) {
        Alert.alert('Error', json.error === 'Invalid code' ? 'Code not found. Check with whoever shared it.' : (json.error ?? 'Failed to join.'));
        return;
      }
      router.replace('/(tabs)');
    } catch {
      Alert.alert('Error', 'Network error — check your connection.');
    } finally {
      setJoinLoading(false);
    }
  }

  async function handleAddChildren() {
    const valid = children.filter(c => c.name.trim());
    if (valid.length === 0) { setStep('done'); return; }
    setStep2Loading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const parsed = valid.map(c => ({ name: c.name.trim(), ageYears: parseInt(c.ageYears, 10) || 0 }));
      const res = await fetch(`${LOCAL_API_BASE}/api/setup/children`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ familyId, children: parsed }),
      });
      if (!res.ok) { const j = await res.json(); Alert.alert('Error', j.error ?? 'Could not save.'); return; }
    } catch {
      Alert.alert('Error', 'Network error — check your connection.');
    } finally {
      setStep2Loading(false);
    }
    setStep('done');
  }

  const maxW = isTablet ? 480 : undefined;
  const steps: Step[] = ['name', 'children'];
  const stepIdx = steps.indexOf(step);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient colors={['#6366F1', '#8B5CF6', 'transparent']} style={styles.blob} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }, isTablet && styles.scrollTablet]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.inner, maxW ? { maxWidth: maxW, alignSelf: 'center', width: '100%' } : null]}>
          <View style={styles.header}>
            <Text style={styles.logo}>🏘️</Text>
            <Text style={styles.title}>Village</Text>
          </View>

          {step !== 'done' && (
            <View style={styles.progressRow}>
              {steps.map((s, i) => (
                <View key={s} style={[styles.dot, { width: step === s ? 24 : 8, backgroundColor: i < stepIdx ? '#6366F1' : i === stepIdx ? '#818CF8' : 'rgba(255,255,255,0.15)' }]} />
              ))}
            </View>
          )}

          {/* ── Step 1: Create or join ── */}
          {step === 'name' && (
            <View style={styles.card}>
              {!joinMode ? (
                <>
                  <Text style={styles.stepLabel}>Step 1 of 2 — Your family</Text>
                  <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Your name" placeholderTextColor="#636366" autoCapitalize="words" />
                  <TextInput style={styles.input} value={familyName} onChangeText={setFamilyName} placeholder="Family name (e.g. The Johnsons)" placeholderTextColor="#636366" autoCapitalize="words" />
                  <TextInput style={styles.input} value={zipCode} onChangeText={t => setZipCode(t.replace(/\D/g, '').slice(0, 5))} placeholder="ZIP code (optional)" placeholderTextColor="#636366" keyboardType="numeric" />
                  <TouchableOpacity style={[styles.primaryBtn, step1Loading && styles.btnDisabled]} onPress={handleCreateFamily} disabled={step1Loading} activeOpacity={0.85}>
                    {step1Loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Continue →</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setJoinMode(true)} style={{ alignItems: 'center', marginTop: 4 }}>
                    <Text style={styles.linkText}>Have a code? Join an existing family →</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.stepLabel}>Join with a code</Text>
                  <Text style={styles.hintText}>Enter the 6-character code from your co-parent's settings.</Text>
                  <TextInput
                    style={[styles.input, { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '700' }]}
                    value={joinCode}
                    onChangeText={t => setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                    placeholder="ABC123"
                    placeholderTextColor="#636366"
                    autoCapitalize="characters"
                    maxLength={6}
                    autoFocus
                  />
                  <TouchableOpacity style={[styles.primaryBtn, joinLoading && styles.btnDisabled]} onPress={handleJoinWithCode} disabled={joinLoading} activeOpacity={0.85}>
                    {joinLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Join family →</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setJoinMode(false)} style={{ alignItems: 'center', marginTop: 4 }}>
                    <Text style={styles.linkText}>← Create a new family instead</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* ── Step 2: Children ── */}
          {step === 'children' && (
            <View style={styles.card}>
              <Text style={styles.stepLabel}>Step 2 of 2 — Children</Text>
              <Text style={styles.hintText}>Add your kids so Village can personalise their events.</Text>
              {children.map((c, i) => (
                <View key={i} style={styles.childRow}>
                  <TextInput style={[styles.input, { flex: 1 }]} value={c.name} onChangeText={t => setChildren(prev => prev.map((ch, j) => j === i ? { ...ch, name: t } : ch))} placeholder="Name" placeholderTextColor="#636366" autoCapitalize="words" />
                  <TextInput style={[styles.input, { width: 72 }]} value={c.ageYears} onChangeText={t => setChildren(prev => prev.map((ch, j) => j === i ? { ...ch, ageYears: t.replace(/\D/g, '') } : ch))} placeholder="Age" placeholderTextColor="#636366" keyboardType="number-pad" />
                  {children.length > 1 && (
                    <TouchableOpacity onPress={() => setChildren(prev => prev.filter((_, j) => j !== i))}>
                      <Ionicons name="close-circle" size={22} color="#636366" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity onPress={() => setChildren(prev => [...prev, { name: '', ageYears: '' }])}>
                <Text style={[styles.linkText, { textAlign: 'left' }]}>+ Add another child</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, step2Loading && styles.btnDisabled]} onPress={handleAddChildren} disabled={step2Loading} activeOpacity={0.85}>
                {step2Loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Continue →</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep('done')} style={{ alignItems: 'center', marginTop: 4 }}>
                <Text style={[styles.linkText, { color: '#636366' }]}>Skip for now</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <View style={[styles.card, { alignItems: 'center', paddingVertical: 32 }]}>
              <Text style={{ fontSize: 56, marginBottom: 12 }}>🎉</Text>
              <Text style={[styles.title, { marginBottom: 8 }]}>You're all set!</Text>
              <Text style={styles.hintText}>
                Your family is ready. Snap photos of event flyers or forward school emails — Village will add them to your calendar automatically.
              </Text>
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 20, width: '100%' }]} onPress={() => router.replace('/(tabs)')} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>Open my calendar →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  blob: { position: 'absolute', top: -120, left: -80, width: 420, height: 420, borderRadius: 210, opacity: 0.35 },
  scroll: { flexGrow: 1, paddingHorizontal: 20 },
  scrollTablet: { paddingHorizontal: 48 },
  inner: {},
  header: { alignItems: 'center', marginBottom: 24 },
  logo: { fontSize: 48, marginBottom: 6 },
  title: { fontSize: 30, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.5, textAlign: 'center' },
  progressRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 20 },
  dot: { height: 6, borderRadius: 3 },
  card: { backgroundColor: '#1C1C1E', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 12 },
  stepLabel: { color: '#8E8E93', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  input: { backgroundColor: '#2C2C2E', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, color: '#FFFFFF', fontSize: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  primaryBtn: { backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  linkText: { color: '#818CF8', fontSize: 13, textAlign: 'center' },
  hintText: { color: '#8E8E93', fontSize: 14, lineHeight: 20 },
  childRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});

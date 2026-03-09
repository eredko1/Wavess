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

  const [step, setStep] = useState<Step>('name');
  const [familyId, setFamilyId] = useState('');
  const [familyNameValue, setFamilyNameValue] = useState('');
  const [isCoParent, setIsCoParent] = useState(false);

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

  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    // Pre-fill name from Google metadata
    supabase.auth.getUser().then(({ data: { user } }) => {
      const googleName =
        user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '';
      if (googleName) setDisplayName(googleName);
    });
  }, []);

  async function handleCreateFamily() {
    if (!displayName.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }
    if (!familyName.trim()) {
      Alert.alert('Required', 'Please enter a family name.');
      return;
    }
    setStep1Loading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LOCAL_API_BASE}/api/setup/family`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          familyName: familyName.trim(),
          zipCode: zipCode.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        Alert.alert('Error', json.error ?? 'Failed to create family.');
        return;
      }
      setFamilyId(json.familyId);
      setFamilyNameValue(familyName.trim());
      if (json.alreadySetUp) {
        // Co-parent who was pre-assigned to a family via invite — skip to done
        setIsCoParent(true);
        setStep('done');
      } else {
        setStep('children');
      }
    } catch {
      Alert.alert('Error', 'Network error — check your connection.');
    } finally {
      setStep1Loading(false);
    }
  }

  async function handleSaveChildren() {
    const valid = children.filter(
      (c) => c.name.trim() && c.ageYears !== '' && !isNaN(Number(c.ageYears))
    );
    if (valid.length === 0) {
      setStep('done');
      return;
    }

    setStep2Loading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${LOCAL_API_BASE}/api/setup/children`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          familyId,
          children: valid.map((c) => ({
            name: c.name.trim(),
            ageYears: parseFloat(c.ageYears),
          })),
        }),
      });
    } catch {
      // Non-blocking — they can add children later
    } finally {
      setStep2Loading(false);
      setStep('done');
    }
  }

  function addChildRow() {
    setChildren((prev) => [...prev, { name: '', ageYears: '' }]);
  }

  function updateChild(index: number, field: keyof ChildRow, value: string) {
    setChildren((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  }

  function removeChild(index: number) {
    setChildren((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleJoinWithCode() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      Alert.alert('Invalid code', 'Enter your 6-character family code.');
      return;
    }
    setJoinLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LOCAL_API_BASE}/api/family/join-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) {
        Alert.alert('Error', json.error === 'Invalid code' ? 'Code not found. Check with whoever shared it.' : (json.error ?? 'Could not join family.'));
        return;
      }
      setIsCoParent(true);
      setFamilyNameValue(json.family_name ?? '');
      setStep('done');
    } catch {
      Alert.alert('Error', 'Network error — check your connection.');
    } finally {
      setJoinLoading(false);
    }
  }

  function handleDone() {
    router.replace('/(tabs)');
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={['#6366F1', '#8B5CF6', 'transparent']}
        style={styles.blob}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.logo}>🏘️</Text>
        <Text style={styles.title}>Village</Text>

        {step !== 'done' && (
          <>
            <View style={styles.progressRow}>
              {(['name', 'children'] as const).map((s, i) => (
                <View
                  key={s}
                  style={[
                    styles.progressDot,
                    step === s && styles.progressDotActive,
                    (step === 'children' && s === 'name') && styles.progressDotDone,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.stepLabel}>
              {step === 'name' ? 'Step 1 of 2 — Your family' : 'Step 2 of 2 — Children'}
            </Text>
          </>
        )}

        {/* ── Step 1: Family info ── */}
        {step === 'name' && (
          <>
            {joinMode ? (
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>FAMILY CODE</Text>
                <TextInput
                  style={[styles.input, { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '700' }]}
                  value={joinCode}
                  onChangeText={(v) => setJoinCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder="ABC123"
                  placeholderTextColor="#636366"
                  autoCapitalize="characters"
                  keyboardType="default"
                  returnKeyType="done"
                  onSubmitEditing={handleJoinWithCode}
                  autoFocus
                  maxLength={6}
                />
                <Text style={{ color: '#636366', fontSize: 12, marginTop: 4, marginBottom: 16 }}>
                  Enter the 6-character code from your co-parent's settings screen.
                </Text>

                <TouchableOpacity
                  style={[styles.primaryBtn, joinLoading && styles.btnDisabled]}
                  onPress={handleJoinWithCode}
                  disabled={joinLoading}
                  activeOpacity={0.85}
                >
                  {joinLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Join family →</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setJoinMode(false)} style={styles.skipBtn}>
                  <Text style={styles.skipText}>← Create a new family instead</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>YOUR NAME</Text>
                <TextInput
                  ref={nameRef}
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="e.g. Sarah"
                  placeholderTextColor="#636366"
                  autoCapitalize="words"
                  returnKeyType="next"
                  autoFocus
                />

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>FAMILY NAME</Text>
                <TextInput
                  style={styles.input}
                  value={familyName}
                  onChangeText={setFamilyName}
                  placeholder="e.g. The Johnson Family"
                  placeholderTextColor="#636366"
                  autoCapitalize="words"
                  returnKeyType="next"
                />

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                  ZIP CODE{' '}
                  <Text style={{ color: '#636366', fontWeight: '400', fontSize: 11 }}>
                    — optional
                  </Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={zipCode}
                  onChangeText={(v) => setZipCode(v.replace(/\D/g, '').slice(0, 5))}
                  placeholder="e.g. 10001"
                  placeholderTextColor="#636366"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  maxLength={5}
                />

                <TouchableOpacity
                  style={[styles.primaryBtn, step1Loading && styles.btnDisabled]}
                  onPress={handleCreateFamily}
                  disabled={step1Loading}
                  activeOpacity={0.85}
                >
                  {step1Loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Continue →</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setJoinMode(true)} style={styles.skipBtn}>
                  <Text style={styles.skipText}>Have a code? Join an existing family →</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* ── Step 2: Children ── */}
        {step === 'children' && (
          <View style={styles.card}>
            <Text style={styles.hintText}>
              Add your kids so Village can track their events. You can always add more later.
            </Text>

            {children.map((child, i) => (
              <View key={i} style={styles.childRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={child.name}
                  onChangeText={(v) => updateChild(i, 'name', v)}
                  placeholder="Name"
                  placeholderTextColor="#636366"
                  autoCapitalize="words"
                />
                <TextInput
                  style={[styles.input, { width: 64, marginBottom: 0, textAlign: 'center' }]}
                  value={child.ageYears}
                  onChangeText={(v) => updateChild(i, 'ageYears', v)}
                  placeholder="Age"
                  placeholderTextColor="#636366"
                  keyboardType="decimal-pad"
                  maxLength={3}
                />
                {children.length > 1 && (
                  <TouchableOpacity onPress={() => removeChild(i)} style={styles.removeBtn}>
                    <Ionicons name="close" size={16} color="#636366" />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <TouchableOpacity onPress={addChildRow} style={styles.addChildBtn}>
              <Ionicons name="add" size={14} color="#6366F1" />
              <Text style={styles.addChildText}>Add another child</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, step2Loading && styles.btnDisabled, { marginTop: 20 }]}
              onPress={handleSaveChildren}
              disabled={step2Loading}
              activeOpacity={0.85}
            >
              {step2Loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Continue →</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setStep('done')} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <View style={styles.card}>
            <Text style={styles.doneEmoji}>🎉</Text>
            <Text style={styles.doneTitle}>You're all set!</Text>
            <Text style={styles.doneText}>
              {isCoParent
                ? "You've joined your family on Village. Everything is shared — events, children, and the timeline."
                : `${familyNameValue} is ready. Invite your co-parent from Settings so you can share the calendar.`}
            </Text>

            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 24 }]}
              onPress={handleDone}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Open my calendar →</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
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
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  logo: { fontSize: 52, textAlign: 'center', marginBottom: 8 },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 32,
  },
  progressRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  progressDot: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressDotActive: { width: 24, backgroundColor: '#818CF8' },
  progressDotDone: { backgroundColor: '#6366F1' },
  stepLabel: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  fieldLabel: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 4,
  },
  primaryBtn: {
    marginTop: 8,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  hintText: { color: '#8E8E93', fontSize: 13, lineHeight: 18, marginBottom: 16 },
  childRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChildBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  addChildText: { color: '#6366F1', fontSize: 14, fontWeight: '500' },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipText: { color: '#636366', fontSize: 14 },
  doneEmoji: { fontSize: 56, textAlign: 'center', marginBottom: 12 },
  doneTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  doneText: {
    color: '#8E8E93',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});

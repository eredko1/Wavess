import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import type { Child } from '@/types/database';

const INTEREST_CATEGORIES = [
  { key: 'sports', label: 'Sports', emoji: '⚽' },
  { key: 'arts', label: 'Arts & Crafts', emoji: '🎨' },
  { key: 'music', label: 'Music', emoji: '🎵' },
  { key: 'stem', label: 'STEM & Coding', emoji: '🔬' },
  { key: 'nature', label: 'Nature & Outdoors', emoji: '🌿' },
  { key: 'dance', label: 'Dance', emoji: '💃' },
  { key: 'library', label: 'Library & Reading', emoji: '📖' },
  { key: 'swimming', label: 'Swimming', emoji: '🏊' },
  { key: 'martial_arts', label: 'Martial Arts', emoji: '🥋' },
  { key: 'theater', label: 'Theater & Drama', emoji: '🎭' },
  { key: 'fitness', label: 'Fitness & Health', emoji: '🏃' },
  { key: 'community', label: 'Community Programs', emoji: '🏘️' },
  { key: 'school', label: 'School & Academic', emoji: '📚' },
];

interface Props {
  visible: boolean;
  child: Child | null; // null = add mode
  familyId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function ChildModal({ visible, child, familyId, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [dob, setDob] = useState(''); // YYYY-MM-DD
  const [notes, setNotes] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (child) {
      setName(child.name);
      setDob(child.dob ?? '');
      setNotes(child.notes ?? '');
      setSelectedInterests(child.interests ?? []);
    } else {
      setName('');
      setDob('');
      setNotes('');
      setSelectedInterests([]);
    }
  }, [child, visible]);

  function toggleInterest(key: string) {
    setSelectedInterests((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a name.');
      return;
    }

    if (dob) {
      const parsed = new Date(dob);
      if (isNaN(parsed.getTime())) {
        Alert.alert('Invalid date', 'Enter date as YYYY-MM-DD.');
        return;
      }
      if (parsed > new Date()) {
        Alert.alert('Invalid date', 'Date of birth cannot be in the future.');
        return;
      }
    }

    setSaving(true);
    const payload = {
      name: name.trim(),
      dob: dob || null,
      notes: notes.trim() || null,
      interests: selectedInterests,
      family_id: familyId,
    };

    if (child) {
      const { error } = await supabase
        .from('children')
        .update(payload)
        .eq('id', child.id);
      if (error) {
        Alert.alert('Error', error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from('children').insert(payload);
      if (error) {
        Alert.alert('Error', error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!child) return;
    Alert.alert(
      'Delete Child',
      `Remove ${child.name} from your family? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('children').delete().eq('id', child.id);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              onSaved();
              onClose();
            }
          },
        },
      ]
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <Text style={styles.title}>{child ? 'Edit Child' : 'Add Child'}</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 10 }}>
            <Ionicons name="close" size={22} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Mia"
            placeholderTextColor="#636366"
            autoFocus={!child}
          />

          <Text style={styles.label}>Date of Birth</Text>
          <TextInput
            style={styles.input}
            value={dob}
            onChangeText={setDob}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#636366"
            keyboardType="numbers-and-punctuation"
          />

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Allergies, preferences…"
            placeholderTextColor="#636366"
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>Interests</Text>
          <View style={styles.pillsWrap}>
            {INTEREST_CATEGORIES.map((cat) => {
              const on = selectedInterests.includes(cat.key);
              return (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => toggleInterest(cat.key)}
                  style={[styles.pill, on ? styles.pillOn : styles.pillOff]}
                  activeOpacity={0.75}
                >
                  <Text style={styles.pillEmoji}>{cat.emoji}</Text>
                  <Text style={[styles.pillLabel, on ? styles.pillLabelOn : styles.pillLabelOff]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>

          {child && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#48484A',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  label: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  multiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    margin: 3,
  },
  pillOff: {
    backgroundColor: '#2C2C2E',
  },
  pillOn: {
    backgroundColor: 'rgba(99,102,241,0.25)',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  pillEmoji: {
    fontSize: 14,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  pillLabelOff: {
    color: '#8E8E93',
  },
  pillLabelOn: {
    color: '#818CF8',
  },
  footer: {
    padding: 20,
    gap: 10,
  },
  saveBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  deleteBtnText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
});

import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import type { Child } from '@/types/database';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddEventSheet({ visible, onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [actions, setActions] = useState('');
  const [childId, setChildId] = useState<string | null>(null);
  const [children, setChildren] = useState<Pick<Child, 'id' | 'name'>[]>([]);
  const [showChildPicker, setShowChildPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (visible) {
      // Default date to today
      const today = new Date().toISOString().slice(0, 10);
      setDate(today);
      loadChildren();
    }
  }, [visible]);

  async function loadChildren() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: user } = await supabase
      .from('users')
      .select('family_id')
      .eq('id', session.user.id)
      .maybeSingle();
    if (!user) return;
    const { data: kids } = await supabase
      .from('children')
      .select('id, name')
      .eq('family_id', user.family_id)
      .order('name', { ascending: true });
    setChildren(kids ?? []);
  }

  function reset() {
    setTitle('');
    setDate('');
    setTime('');
    setLocation('');
    setActions('');
    setNotes('');
    setChildId(null);
    setShowChildPicker(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter an event title.');
      return;
    }
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format.');
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data: user } = await supabase
        .from('users')
        .select('family_id')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!user) throw new Error('User not found');

      const hasTime = !!(time && !time.match(/^0*:?0*$/));
      const startAt = hasTime
        ? new Date(`${date}T${time}:00`).toISOString()
        : `${date}T00:00:00.000Z`;
      const allDay = !hasTime;
      const requiredActions = actions
        .split('\n')
        .map(a => a.trim())
        .filter(Boolean);

      const { error } = await supabase.from('events').insert({
        family_id: user.family_id,
        child_id: childId,
        title: title.trim(),
        start_at: startAt,
        all_day: allDay,
        location: location.trim() || null,
        required_actions: requiredActions,
        description: notes.trim() || null,
        status: 'confirmed',
        source: 'manual',
      });

      if (error) throw error;
      handleClose();
      onSaved();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save event.');
    } finally {
      setSaving(false);
    }
  }

  const selectedChildName = children.find(c => c.id === childId)?.name ?? 'Unassigned';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.handle]} />

        <View style={styles.headerRow}>
          <Text style={styles.title}>Add Event</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={22} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Soccer practice"
            placeholderTextColor="#636366"
            autoFocus
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Date *</Text>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#636366"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.label}>Time</Text>
              <TextInput
                style={styles.input}
                value={time}
                onChangeText={setTime}
                placeholder="HH:MM"
                placeholderTextColor="#636366"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Community Park"
            placeholderTextColor="#636366"
          />

          {children.length > 0 && (
            <>
              <Text style={styles.label}>Child</Text>
              <TouchableOpacity
                style={styles.picker}
                onPress={() => setShowChildPicker(!showChildPicker)}
              >
                <Text style={styles.pickerText}>{selectedChildName}</Text>
                <Ionicons name="chevron-down" size={16} color="#8E8E93" />
              </TouchableOpacity>
              {showChildPicker && (
                <View style={styles.pickerDropdown}>
                  <TouchableOpacity
                    style={styles.pickerOption}
                    onPress={() => { setChildId(null); setShowChildPicker(false); }}
                  >
                    <Text style={styles.pickerOptionText}>Unassigned</Text>
                  </TouchableOpacity>
                  {children.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.pickerOption}
                      onPress={() => { setChildId(c.id); setShowChildPicker(false); }}
                    >
                      <Text style={styles.pickerOptionText}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          <Text style={styles.label}>Required Actions</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={actions}
            onChangeText={setActions}
            placeholder={'Sign permission slip\nBring $5'}
            placeholderTextColor="#636366"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <Text style={styles.hint}>One action per line</Text>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any extra details…"
            placeholderTextColor="#636366"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Event'}</Text>
          </TouchableOpacity>
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
    marginBottom: 4,
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
  row: {
    flexDirection: 'row',
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
  hint: {
    color: '#636366',
    fontSize: 11,
    marginTop: 4,
  },
  picker: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pickerText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  pickerDropdown: {
    backgroundColor: '#3A3A3C',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pickerOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  pickerOptionText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  footer: {
    padding: 20,
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
});

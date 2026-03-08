import { useState } from 'react';
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
import { LOCAL_API_BASE } from '@/lib/config';

const TAGS = [
  { key: 'school',       label: 'School',      emoji: '📚' },
  { key: 'sports',       label: 'Sports',       emoji: '⚽' },
  { key: 'dance',        label: 'Dance',        emoji: '💃' },
  { key: 'arts',         label: 'Arts & Crafts',emoji: '🎨' },
  { key: 'library',      label: 'Library',      emoji: '📖' },
  { key: 'music',        label: 'Music',        emoji: '🎵' },
  { key: 'stem',         label: 'STEM',         emoji: '🔬' },
  { key: 'nature',       label: 'Outdoors',     emoji: '🌿' },
  { key: 'martial_arts', label: 'Martial Arts', emoji: '🥋' },
  { key: 'swimming',     label: 'Swimming',     emoji: '🏊' },
  { key: 'theater',      label: 'Theater',      emoji: '🎭' },
  { key: 'community',    label: 'Community',    emoji: '🏘️' },
  { key: 'fitness',      label: 'Fitness',      emoji: '🏃' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function SubmitEventSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [organizer, setOrganizer] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venueName, setVenueName] = useState('');
  const [address, setAddress] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [ageMin, setAgeMin] = useState('0');
  const [ageMax, setAgeMax] = useState('18');
  const [cost, setCost] = useState('0');
  const [regUrl, setRegUrl] = useState('');
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setOrganizer(''); setOrgEmail(''); setTitle(''); setDescription('');
    setVenueName(''); setAddress(''); setZipCode('');
    setStartDate(''); setStartTime(''); setEndTime('');
    setAgeMin('0'); setAgeMax('18'); setCost('0'); setRegUrl('');
    setTags(new Set());
  }

  function handleClose() { reset(); onClose(); }

  function toggleTag(key: string) {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleSubmit() {
    if (!title.trim()) { Alert.alert('Required', 'Please enter an event title.'); return; }
    if (!/^\d{5}$/.test(zipCode.trim())) { Alert.alert('Required', 'Enter a valid 5-digit ZIP code.'); return; }
    if (!startDate.match(/^\d{4}-\d{2}-\d{2}$/)) { Alert.alert('Invalid date', 'Use YYYY-MM-DD format (e.g. 2026-04-15).'); return; }

    const start_at = startTime ? `${startDate}T${startTime}:00` : `${startDate}T00:00:00`;
    const end_at = endTime ? `${startDate}T${endTime}:00` : null;

    setSubmitting(true);
    try {
      const res = await fetch(`${LOCAL_API_BASE}/api/events/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          organizer: organizer.trim() || null,
          venue_name: venueName.trim() || null,
          address: address.trim() || null,
          zip_code: zipCode.trim(),
          start_at,
          end_at,
          age_min: parseFloat(ageMin) || 0,
          age_max: parseFloat(ageMax) || 18,
          tags: Array.from(tags),
          cost_cents: Math.round((parseFloat(cost) || 0) * 100),
          registration_url: regUrl.trim() || null,
          organizer_email: orgEmail.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        Alert.alert('Error', json.error ?? 'Submission failed.');
        return;
      }
      Alert.alert(
        'Event Submitted!',
        'Thanks! Your event is under review and will appear in Village Loop once approved — usually within 24 hours.',
        [{ text: 'Done', onPress: handleClose }]
      );
    } catch {
      Alert.alert('Network Error', 'Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

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
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Post Your Event</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={22} color="#8E8E93" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSub}>
          Reach local families with kids. Events are reviewed within 24 hours.
        </Text>

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Organization */}
          <SectionHeader>Your Organization</SectionHeader>
          <Label>Business / Org Name</Label>
          <TextInput style={styles.input} value={organizer} onChangeText={setOrganizer}
            placeholder="e.g. Riverside Dance Academy" placeholderTextColor="#636366" autoCapitalize="words" />
          <Label>Contact Email</Label>
          <TextInput style={styles.input} value={orgEmail} onChangeText={setOrgEmail}
            placeholder="you@example.com" placeholderTextColor="#636366"
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />

          {/* Event details */}
          <SectionHeader>Event Details</SectionHeader>
          <Label>Event Title *</Label>
          <TextInput style={styles.input} value={title} onChangeText={setTitle}
            placeholder="e.g. Summer Dance Workshop" placeholderTextColor="#636366" autoCapitalize="words" />
          <Label>Description</Label>
          <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription}
            placeholder="Tell families what to expect…" placeholderTextColor="#636366"
            multiline numberOfLines={3} textAlignVertical="top" />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Label>Date * (YYYY-MM-DD)</Label>
              <TextInput style={styles.input} value={startDate} onChangeText={setStartDate}
                placeholder="2026-04-15" placeholderTextColor="#636366" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Label>Cost ($)</Label>
              <TextInput style={styles.input} value={cost} onChangeText={setCost}
                placeholder="0" placeholderTextColor="#636366" keyboardType="decimal-pad" />
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Label>Start Time (HH:MM)</Label>
              <TextInput style={styles.input} value={startTime} onChangeText={setStartTime}
                placeholder="10:00" placeholderTextColor="#636366" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Label>End Time (HH:MM)</Label>
              <TextInput style={styles.input} value={endTime} onChangeText={setEndTime}
                placeholder="12:00" placeholderTextColor="#636366" keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          <Label>Registration URL</Label>
          <TextInput style={styles.input} value={regUrl} onChangeText={setRegUrl}
            placeholder="https://…" placeholderTextColor="#636366"
            keyboardType="url" autoCapitalize="none" autoCorrect={false} />

          {/* Location */}
          <SectionHeader>Location</SectionHeader>
          <Label>Venue Name</Label>
          <TextInput style={styles.input} value={venueName} onChangeText={setVenueName}
            placeholder="e.g. Community Center" placeholderTextColor="#636366" autoCapitalize="words" />
          <Label>Street Address</Label>
          <TextInput style={styles.input} value={address} onChangeText={setAddress}
            placeholder="123 Main St" placeholderTextColor="#636366" autoCapitalize="words" />
          <Label>ZIP Code *</Label>
          <TextInput style={styles.input} value={zipCode}
            onChangeText={(v) => setZipCode(v.replace(/\D/g, '').slice(0, 5))}
            placeholder="10001" placeholderTextColor="#636366" keyboardType="number-pad" maxLength={5} />

          {/* Age range */}
          <SectionHeader>Age Range (years)</SectionHeader>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Label>Min Age</Label>
              <TextInput style={styles.input} value={ageMin} onChangeText={setAgeMin}
                placeholder="0" placeholderTextColor="#636366" keyboardType="decimal-pad" />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Label>Max Age</Label>
              <TextInput style={styles.input} value={ageMax} onChangeText={setAgeMax}
                placeholder="18" placeholderTextColor="#636366" keyboardType="decimal-pad" />
            </View>
          </View>

          {/* Categories */}
          <SectionHeader>Categories</SectionHeader>
          <Text style={styles.tagHint}>Tap to select — helps families find your event</Text>
          <View style={styles.tagWrap}>
            {TAGS.map((tag) => {
              const on = tags.has(tag.key);
              return (
                <TouchableOpacity
                  key={tag.key}
                  style={[styles.tagChip, on && styles.tagChipOn]}
                  onPress={() => toggleTag(tag.key)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.tagEmoji}>{tag.emoji}</Text>
                  <Text style={[styles.tagLabel, on && styles.tagLabelOn]}>{tag.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
            <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Submit for Review'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionHeader}>{children}</Text>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1C1C1E' },
  handle: { width: 36, height: 4, backgroundColor: '#48484A', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 4 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#8E8E93', fontSize: 13, paddingHorizontal: 20, marginBottom: 16, lineHeight: 18 },
  scroll: { flex: 1, paddingHorizontal: 20 },
  sectionHeader: { color: '#818CF8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 20, marginBottom: 10 },
  label: { color: '#8E8E93', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#2C2C2E', borderRadius: 12, padding: 13, color: '#FFFFFF', fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  multiline: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  tagHint: { color: '#636366', fontSize: 12, marginBottom: 10 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, backgroundColor: '#2C2C2E', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tagChipOn: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  tagEmoji: { fontSize: 13 },
  tagLabel: { color: '#8E8E93', fontSize: 13, fontWeight: '500' },
  tagLabelOn: { color: '#FFFFFF' },
  footer: { padding: 20 },
  submitBtn: { backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});

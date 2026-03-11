import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { LOCAL_API_BASE } from '@/lib/config';
import ChildCard from '@/components/ChildCard';
import ChildModal from '@/components/ChildModal';
import EmptyState from '@/components/EmptyState';
import type { ChildWithNextEvent } from '@/types/database';

const CATEGORIES = [
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

function InterestsPicker({
  selected,
  onToggle,
  onSave,
  saving,
  saved,
}: {
  selected: Set<string>;
  onToggle: (key: string) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <View style={iStyles.root}>
      <View style={iStyles.header}>
        <View>
          <Text style={iStyles.title}>Family Interests</Text>
          <Text style={iStyles.subtitle}>
            What are your kids into? We&apos;ll show matching events in Loop.
          </Text>
        </View>
        <TouchableOpacity
          style={[iStyles.saveBtn, saving && iStyles.saveBtnDisabled]}
          onPress={onSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={iStyles.saveBtnText}>
            {saving ? '…' : saved ? '✓ Saved' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={iStyles.chips}
      >
        {CATEGORIES.map((cat) => {
          const on = selected.has(cat.key);
          return (
            <TouchableOpacity
              key={cat.key}
              style={[iStyles.chip, on && iStyles.chipOn]}
              onPress={() => onToggle(cat.key)}
              activeOpacity={0.8}
            >
              <Text style={iStyles.chipEmoji}>{cat.emoji}</Text>
              <Text style={[iStyles.chipLabel, on && iStyles.chipLabelOn]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function ChildrenScreen() {
  const insets = useSafeAreaInsets();
  const [children, setChildren] = useState<ChildWithNextEvent[]>([]);
  const [familyId, setFamilyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedChild, setSelectedChild] = useState<ChildWithNextEvent | null>(null);

  // Interests state
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [interestsSaved, setInterestsSaved] = useState(false);
  const [interestsSaving, setInterestsSaving] = useState(false);

  async function fetchData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: user } = await supabase
      .from('users')
      .select('family_id')
      .eq('id', session.user.id)
      .maybeSingle();

    if (!user) return;
    setFamilyId(user.family_id);

    const [kidsResult, familyResult] = await Promise.all([
      supabase
        .from('children')
        .select('*')
        .eq('family_id', user.family_id)
        .order('dob', { ascending: true }),
      supabase
        .from('families')
        .select('interests')
        .eq('id', user.family_id)
        .maybeSingle(),
    ]);

    // Fetch upcoming events
    const now = new Date().toISOString();
    const { data: upcoming } = await supabase
      .from('events')
      .select('id, title, start_at, child_id')
      .eq('family_id', user.family_id)
      .eq('status', 'confirmed')
      .gte('start_at', now)
      .order('start_at', { ascending: true });

    const nextEventMap = new Map<string, { id: string; title: string; start_at: string }>();
    for (const ev of (upcoming ?? [])) {
      if (ev.child_id && !nextEventMap.has(ev.child_id)) {
        nextEventMap.set(ev.child_id, { id: ev.id, title: ev.title, start_at: ev.start_at });
      }
    }

    const enriched: ChildWithNextEvent[] = (kidsResult.data ?? []).map((child) => ({
      ...child,
      next_event: nextEventMap.get(child.id) ?? null,
    }));

    setChildren(enriched);
    setInterests(new Set(familyResult.data?.interests ?? []));
  }

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;

    async function subscribe() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: user } = await supabase
        .from('users')
        .select('family_id')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!user) return;

      channel = supabase
        .channel(`children:${user.family_id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'children',
            filter: `family_id=eq.${user.family_id}`,
          },
          () => { fetchData(); }
        )
        .subscribe();
    }

    subscribe();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, []);

  function toggleInterest(key: string) {
    setInterests((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setInterestsSaved(false);
  }

  async function saveInterests() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setInterestsSaving(true);
    try {
      const res = await fetch(`${LOCAL_API_BASE}/api/family/interests`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ interests: Array.from(interests) }),
      });
      if (res.ok) setInterestsSaved(true);
      else Alert.alert('Error', 'Could not save interests.');
    } catch {
      Alert.alert('Error', 'Network error.');
    } finally {
      setInterestsSaving(false);
    }
  }

  function openAdd() {
    setSelectedChild(null);
    setModalVisible(true);
  }

  function openEdit(child: ChildWithNextEvent) {
    setSelectedChild(child);
    setModalVisible(true);
  }

  function handleLongPress(child: ChildWithNextEvent) {
    Alert.alert(
      `Delete ${child.name}?`,
      'This will remove them from your family. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('children').delete().eq('id', child.id);
            if (error) { Alert.alert('Error', error.message); return; }
            await fetchData();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={children}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />
        }
        ListHeaderComponent={
          <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
            <Text style={styles.pageTitle}>Children</Text>
            <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="No children added yet"
            subtitle="Add your children to get personalized activity ideas and event reminders."
            ctaLabel="Add Child"
            onCta={openAdd}
          />
        }
        ListFooterComponent={
          <InterestsPicker
            selected={interests}
            onToggle={toggleInterest}
            onSave={saveInterests}
            saving={interestsSaving}
            saved={interestsSaved}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={{ flex: 1 }}
            onLongPress={() => handleLongPress(item)}
            delayLongPress={600}
            activeOpacity={0.9}
          >
            <ChildCard child={item} onEdit={openEdit} />
          </TouchableOpacity>
        )}
      />

      <ChildModal
        visible={modalVisible}
        child={selectedChild}
        familyId={familyId}
        onClose={() => setModalVisible(false)}
        onSaved={onRefresh}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  pageTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    paddingHorizontal: 10,
  },
});

const iStyles = StyleSheet.create({
  root: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  subtitle: {
    color: '#8E8E93',
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  saveBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  chips: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#2C2C2E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipOn: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },
  chipLabelOn: {
    color: '#FFFFFF',
  },
});

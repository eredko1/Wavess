import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Share,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import EventCard from '@/components/EventCard';
import IngestSheet from '@/components/IngestSheet';
import AddEventSheet from '@/components/AddEventSheet';
import EmptyState from '@/components/EmptyState';
import type { EventWithChild, Family } from '@/types/database';

interface Section {
  title: string;
  data: EventWithChild[];
  hasConflict: boolean;
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function formatSectionTitle(dateKey: string): string {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const tomorrowKey = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

  if (dateKey === todayKey) return 'Today';
  if (dateKey === tomorrowKey) return 'Tomorrow';

  const d = new Date(dateKey + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupIntoSections(events: EventWithChild[]): Section[] {
  const map = new Map<string, EventWithChild[]>();

  for (const e of events) {
    const key = toDateKey(e.start_at);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => ({
      title: formatSectionTitle(key),
      data,
      hasConflict: data.length > 1,
    }));
}

export default function TimelineScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>([]);
  const [filterChildren, setFilterChildren] = useState<{ id: string; name: string }[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [familyName, setFamilyName] = useState('');
  const [members, setMembers] = useState<{ id: string; display_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPast, setShowPast] = useState(false);

  async function fetchData(past = false) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Get user's family
    const { data: user } = await supabase
      .from('users')
      .select('family_id, families(name)')
      .eq('id', session.user.id)
      .maybeSingle();

    if (!user) return;

    const familyId = user.family_id;
    const family = user.families as unknown as Family | null;
    if (family) setFamilyName(family.name);

    const now = new Date();
    let query = supabase
      .from('events')
      .select('*, children(id, name, age_in_months)')
      .eq('family_id', familyId)
      .eq('status', 'confirmed');

    // Use start-of-today so all-day events for today appear in Upcoming, not Past
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (past) {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      query = query
        .lt('start_at', todayStart.toISOString())
        .gte('start_at', thirtyDaysAgo.toISOString())
        .order('start_at', { ascending: false });
    } else {
      query = query
        .gte('start_at', todayStart.toISOString())
        .order('start_at', { ascending: true });
    }

    const { data: events } = await query.limit(500);
    const evts = (events ?? []) as EventWithChild[];
    setSections(groupIntoSections(evts));

    // Fetch family members for header avatars
    const { data: membersData } = await supabase
      .from('users')
      .select('id, display_name')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true });
    setMembers((membersData ?? []) as { id: string; display_name: string }[]);

    // Collect unique children from fetched events for filter chips
    const seen = new Set<string>();
    const kids: { id: string; name: string }[] = [];
    for (const e of evts) {
      if (e.child_id && e.children && !seen.has(e.child_id)) {
        seen.add(e.child_id);
        kids.push({ id: e.child_id, name: e.children.name });
      }
    }
    setFilterChildren(kids);
  }

  useEffect(() => {
    fetchData(showPast).finally(() => setLoading(false));
  }, [showPast]);

  // Realtime: re-fetch when events change for this family
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
        .channel(`events:${user.family_id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'events',
            filter: `family_id=eq.${user.family_id}`,
          },
          () => { fetchData(showPast); }
        )
        .subscribe();
    }

    subscribe();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [showPast]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(showPast);
    setRefreshing(false);
  }, [showPast]);

  async function handleLongPress(item: EventWithChild) {
    Alert.alert(item.title, undefined, [
      {
        text: 'Share',
        onPress: () => {
          const lines = [item.title, item.start_at.slice(0, 10)];
          if (item.location) lines.push(`📍 ${item.location}`);
          Share.share({ message: lines.join('\n') });
        },
      },
      {
        text: 'Duplicate',
        onPress: async () => {
          await supabase.from('events').insert({
            family_id: item.family_id,
            child_id: item.child_id,
            title: item.title + ' (copy)',
            description: item.description,
            start_at: item.start_at,
            end_at: item.end_at,
            all_day: item.all_day,
            location: item.location,
            required_actions: item.required_actions,
            status: 'confirmed',
            source: 'manual',
          });
          await fetchData(showPast);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete event?', `"${item.title}" will be permanently removed.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await supabase.from('events').delete().eq('id', item.id).eq('family_id', item.family_id);
                await fetchData(showPast);
              },
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const displaySections = (() => {
    let result = selectedChildId
      ? sections
          .map(s => ({ ...s, data: s.data.filter(e => e.child_id === selectedChildId), hasConflict: false }))
          .filter(s => s.data.length > 0)
      : sections;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result
        .map(s => ({
          ...s,
          data: s.data.filter(e =>
            e.title.toLowerCase().includes(q) ||
            (e.location ?? '').toLowerCase().includes(q) ||
            (e.children?.name ?? '').toLowerCase().includes(q)
          ),
        }))
        .filter(s => s.data.length > 0);
    }
    return result;
  })();

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SectionList
        sections={displaySections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        ListHeaderComponent={
          <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
            <View style={styles.titleRow}>
              <View>
                <Text style={styles.familyName}>{familyName}</Text>
                <Text style={styles.pageTitle}>Timeline</Text>
              </View>
              <View style={styles.titleRowRight}>
                {members.length > 1 && (
                  <View style={styles.memberAvatars}>
                    {members.slice(0, 3).map((m, i) => (
                      <View
                        key={m.id}
                        style={[styles.memberAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: members.length - i }]}
                      >
                        <Text style={styles.memberAvatarText}>
                          {(m.display_name ?? '?')[0].toUpperCase()}
                        </Text>
                      </View>
                    ))}
                    {members.length > 3 && (
                      <View style={[styles.memberAvatar, { marginLeft: -8, backgroundColor: '#2C2C2E' }]}>
                        <Text style={[styles.memberAvatarText, { color: '#636366' }]}>
                          +{members.length - 3}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
                <TouchableOpacity style={styles.addBtn} onPress={() => setAddOpen(true)}>
                  <Ionicons name="add" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
            {/* Past / Upcoming toggle */}
            <View style={styles.toggle}>
              <TouchableOpacity
                style={[styles.toggleBtn, !showPast && styles.toggleBtnActive]}
                onPress={() => setShowPast(false)}
              >
                <Text style={[styles.toggleText, !showPast && styles.toggleTextActive]}>Upcoming</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, showPast && styles.toggleBtnActive]}
                onPress={() => setShowPast(true)}
              >
                <Text style={[styles.toggleText, showPast && styles.toggleTextActive]}>Past 30 days</Text>
              </TouchableOpacity>
            </View>

            {/* Child filter chips */}
            {filterChildren.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 10 }}
                contentContainerStyle={{ gap: 6 }}
              >
                <TouchableOpacity
                  style={[styles.chip, !selectedChildId && styles.chipActive]}
                  onPress={() => setSelectedChildId(null)}
                >
                  <Text style={[styles.chipText, !selectedChildId && styles.chipTextActive]}>All</Text>
                </TouchableOpacity>
                {filterChildren.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.chip, selectedChildId === c.id && styles.chipActive]}
                    onPress={() => setSelectedChildId(selectedChildId === c.id ? null : c.id)}
                  >
                    <Text style={[styles.chipText, selectedChildId === c.id && styles.chipTextActive]}>
                      {c.name.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <View style={styles.searchRow}>
              <Ionicons name="search" size={14} color="#636366" />
              <TextInput
                style={styles.searchText}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search events…"
                placeholderTextColor="#636366"
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={14} color="#636366" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="calendar-outline"
            title="No upcoming events"
            subtitle="Forward a screenshot, scan a flyer, or add events manually."
            ctaLabel="Add Event"
            onCta={() => setAddOpen(true)}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.hasConflict && (
              <View style={styles.conflictPill}>
                <Text style={styles.conflictPillText}>⚠️ Conflict</Text>
              </View>
            )}
          </View>
        )}
        renderItem={({ item, section }) => (
          <EventCard
            event={item}
            showConflict={section.hasConflict && section.data.length > 1}
            onPress={() => router.push(`/event/${item.id}` as never)}
            onLongPress={() => handleLongPress(item)}
          />
        )}
        stickySectionHeadersEnabled={false}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: 60 + insets.bottom }]}
        onPress={() => setIngestOpen(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="sparkles" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      <IngestSheet
        visible={ingestOpen}
        onClose={() => setIngestOpen(false)}
        onSaved={onRefresh}
      />

      <AddEventSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
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
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  titleRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  memberAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  memberAvatarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    padding: 3,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#2C2C2E',
  },
  toggleText: {
    color: '#636366',
    fontSize: 13,
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  chipText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  familyName: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  pageTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  conflictPill: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  conflictPillText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
});

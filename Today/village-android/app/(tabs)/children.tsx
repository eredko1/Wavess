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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import ChildCard from '@/components/ChildCard';
import ChildModal from '@/components/ChildModal';
import type { ChildWithNextEvent } from '@/types/database';

export default function ChildrenScreen() {
  const insets = useSafeAreaInsets();
  const [children, setChildren] = useState<ChildWithNextEvent[]>([]);
  const [familyId, setFamilyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedChild, setSelectedChild] = useState<ChildWithNextEvent | null>(null);

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

    const { data: kids } = await supabase
      .from('children')
      .select('*')
      .eq('family_id', user.family_id)
      .order('dob', { ascending: true });

    if (!kids) return;

    // Fetch all upcoming events in one query, then group by child
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

    const enriched: ChildWithNextEvent[] = kids.map((child) => ({
      ...child,
      next_event: nextEventMap.get(child.id) ?? null,
    }));

    setChildren(enriched);
  }

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, []);

  // Realtime: re-fetch when children change
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
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👶</Text>
            <Text style={styles.emptyText}>No children yet</Text>
            <Text style={styles.emptyHint}>Tap + to add your first child.</Text>
          </View>
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
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyHint: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
  },
});

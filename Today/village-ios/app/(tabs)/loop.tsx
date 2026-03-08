import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { LOCAL_API_BASE } from '@/lib/config';
import LoopCard from '@/components/LoopCard';
import type { ThemeWithActivities, LocalEvent, Child } from '@/types/database';

interface AISuggestion {
  title: string;
  description: string;
  category: string;
  emoji: string;
}

function getNextWeekend(): { sat: string; sun: string } {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 6=Sat
  const daysToSat = day === 6 ? 0 : 6 - day;
  const sat = new Date(today);
  sat.setDate(today.getDate() + daysToSat);
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return {
    sat: sat.toISOString().slice(0, 10),
    sun: sun.toISOString().slice(0, 10),
  };
}

export default function LoopScreen() {
  const insets = useSafeAreaInsets();
  const [themes, setThemes] = useState<ThemeWithActivities[]>([]);
  const [localEvents, setLocalEvents] = useState<LocalEvent[]>([]);
  const [isWeekendFree, setIsWeekendFree] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: user } = await supabase
        .from('users')
        .select('family_id')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!user) return;

      const familyId = user.family_id;
      const { sat, sun } = getNextWeekend();
      const satStart = `${sat}T00:00:00`;
      const sunEnd = `${sun}T23:59:59`;

      // Check if weekend is free
      const { data: weekendEvents } = await supabase
        .from('events')
        .select('id')
        .eq('family_id', familyId)
        .gte('start_at', satStart)
        .lte('start_at', sunEnd)
        .limit(1);

      setIsWeekendFree(!weekendEvents || weekendEvents.length === 0);

      // Get children to determine age ranges
      const { data: kids } = await supabase
        .from('children')
        .select('age_in_months')
        .eq('family_id', familyId);

      const ages = (kids ?? [])
        .map((k: Pick<Child, 'age_in_months'>) => k.age_in_months)
        .filter((a): a is number => a !== null);

      const minAge = ages.length > 0 ? Math.min(...ages) : 0;
      const maxAge = ages.length > 0 ? Math.max(...ages) : 144;

      // Fetch themes matching any child's age
      const { data: themesData } = await supabase
        .from('themes')
        .select('*, theme_activities(*)')
        .lte('age_min_months', maxAge)
        .gte('age_max_months', minAge)
        .limit(10);

      setThemes((themesData ?? []) as ThemeWithActivities[]);

      // Fetch local events (use family zip code + interests if available)
      const { data: familyData } = await supabase
        .from('families')
        .select('zip_code, interests')
        .eq('id', familyId)
        .maybeSingle();

      const zip = familyData?.zip_code;
      const familyInterests: string[] = familyData?.interests ?? [];

      let localQuery = supabase
        .from('local_events')
        .select('*')
        .eq('is_active', true)
        .gte('start_at', new Date().toISOString())
        .order('start_at', { ascending: true })
        .limit(10);

      if (zip) {
        localQuery = localQuery.eq('zip_code', zip);
      }
      if (familyInterests.length > 0) {
        localQuery = localQuery.overlaps('tags', familyInterests);
      }

      const { data: localData } = await localQuery;
      setLocalEvents((localData ?? []) as LocalEvent[]);

      // Fetch AI suggestions in parallel — non-blocking
      fetch(`${LOCAL_API_BASE}/api/loop/suggestions`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => r.json())
        .then((data) => setAiSuggestions(data.suggestions ?? []))
        .catch(() => {})
        .finally(() => setAiLoading(false));
    }

    fetchData().finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.pageTitle}>Loop</Text>
          <Text style={styles.pageSubtitle}>Ideas for your family this weekend</Text>
        </View>

        {/* Free day banner */}
        {isWeekendFree && (
          <View style={styles.section}>
            <LinearGradient
              colors={['rgba(99,102,241,0.3)', 'rgba(139,92,246,0.15)']}
              style={styles.freeBanner}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.freeBannerInner}>
                <Text style={styles.freeEmoji}>🎉</Text>
                <View>
                  <Text style={styles.freeBannerTitle}>Weekend is free!</Text>
                  <Text style={styles.freeBannerSub}>No events scheduled — try a Village Loop.</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        )}

        {/* AI suggestions */}
        {(aiLoading || aiSuggestions.length > 0) && (
          <View style={styles.section}>
            <View style={styles.aiHeader}>
              <Text style={styles.sectionTitle}>AI Pick for You</Text>
              <Text style={styles.aiLabel}>✦ Gemini</Text>
            </View>
            {aiLoading ? (
              <View style={{ paddingHorizontal: 16, gap: 10 }}>
                {[1, 2].map((i) => (
                  <View key={i} style={styles.aiSkeleton} />
                ))}
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, gap: 10 }}>
                {aiSuggestions.map((s, i) => (
                  <View key={i} style={styles.aiCard}>
                    <Text style={styles.aiEmoji}>{s.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={styles.aiCardHeader}>
                        <Text style={styles.aiCardTitle}>{s.title}</Text>
                        <View style={styles.aiCategoryPill}>
                          <Text style={styles.aiCategoryText}>{s.category}</Text>
                        </View>
                      </View>
                      <Text style={styles.aiCardDesc}>{s.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Local events */}
        {localEvents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Near You</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.localScroll}
            >
              {localEvents.map((ev) => (
                <TouchableOpacity
                  key={ev.id}
                  style={styles.localPill}
                  onPress={() => ev.registration_url && Linking.openURL(ev.registration_url)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.localPillTitle} numberOfLines={2}>{ev.title}</Text>
                  <Text style={styles.localPillDate}>
                    {new Date(ev.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  {ev.cost_cents === 0 && (
                    <View style={styles.freePill}>
                      <Text style={styles.freePillText}>Free</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Weekend themes */}
        {themes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Weekend Themes</Text>
            {themes.map((theme) => (
              <LoopCard key={theme.id} theme={theme} />
            ))}
          </View>
        )}

        {themes.length === 0 && localEvents.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✨</Text>
            <Text style={styles.emptyText}>No suggestions yet</Text>
            <Text style={styles.emptyHint}>Add your children's ages to get personalized activity ideas.</Text>
          </View>
        )}
      </ScrollView>
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
  pageTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  freeBanner: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
  },
  freeBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
  },
  freeEmoji: {
    fontSize: 32,
  },
  freeBannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  freeBannerSub: {
    color: '#8E8E93',
    fontSize: 13,
  },
  localScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  localPill: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 14,
    width: 150,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  localPillTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 18,
  },
  localPillDate: {
    color: '#8E8E93',
    fontSize: 12,
  },
  freePill: {
    backgroundColor: 'rgba(52,199,89,0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  freePillText: {
    color: '#34C759',
    fontSize: 10,
    fontWeight: '600',
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  aiLabel: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '600',
  },
  aiSkeleton: {
    height: 72,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
  },
  aiCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  aiEmoji: {
    fontSize: 26,
    lineHeight: 30,
  },
  aiCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  aiCardTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  aiCategoryPill: {
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  aiCategoryText: {
    color: '#818CF8',
    fontSize: 10,
    fontWeight: '600',
  },
  aiCardDesc: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 18,
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
    lineHeight: 20,
  },
});

import { useState, useEffect, useMemo } from 'react';
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
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { LOCAL_API_BASE } from '@/lib/config';
import LoopCard from '@/components/LoopCard';
import EmptyState from '@/components/EmptyState';
import type { ThemeWithActivities, LocalEvent, Child } from '@/types/database';

interface AISuggestion {
  title: string;
  description: string;
  category: string;
  emoji: string;
}

type FeedItem =
  | { type: 'free_banner' }
  | { type: 'ai_skeleton'; key: string }
  | { type: 'ai_suggestion'; data: AISuggestion; key: string }
  | { type: 'local_event'; data: LocalEvent }
  | { type: 'theme'; data: ThemeWithActivities }
  | { type: 'business_promo' };

function getNextWeekend(): { sat: string; sun: string } {
  const today = new Date();
  const day = today.getDay();
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
  const router = useRouter();
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

      const { data: weekendEvents } = await supabase
        .from('events')
        .select('id')
        .eq('family_id', familyId)
        .gte('start_at', `${sat}T00:00:00`)
        .lte('start_at', `${sun}T23:59:59`)
        .limit(1);
      setIsWeekendFree(!weekendEvents || weekendEvents.length === 0);

      const { data: kids } = await supabase
        .from('children')
        .select('age_in_months, interests')
        .eq('family_id', familyId);

      const ages = (kids ?? [])
        .map((k: Pick<Child, 'age_in_months'>) => k.age_in_months)
        .filter((a): a is number => a !== null);
      const allInterests: string[] = [
        ...new Set((kids ?? []).flatMap((k: any) => k.interests ?? [])),
      ];
      const minAge = ages.length > 0 ? Math.min(...ages) : 0;
      const maxAge = ages.length > 0 ? Math.max(...ages) : 144;

      const { data: themesData } = await supabase
        .from('themes')
        .select('*, theme_activities(*)')
        .limit(20);
      setThemes((themesData ?? []) as ThemeWithActivities[]);

      const { data: familyData } = await supabase
        .from('families')
        .select('zip_code, interests')
        .eq('id', familyId)
        .maybeSingle();

      const zip = familyData?.zip_code;
      const familyInterests: string[] = familyData?.interests ?? [];
      const activeInterests = allInterests.length > 0 ? allInterests : familyInterests;

      let localQuery = supabase
        .from('local_events')
        .select('*')
        .eq('is_active', true)
        .gte('start_at', new Date().toISOString())
        .order('start_at', { ascending: true })
        .limit(10);
      if (zip) localQuery = localQuery.eq('zip_code', zip);
      if (activeInterests.length > 0) localQuery = localQuery.overlaps('tags', activeInterests);

      const { data: localData } = await localQuery;
      setLocalEvents((localData ?? []) as LocalEvent[]);

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

  // Build the unified feed
  const feedItems = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];

    if (isWeekendFree) items.push({ type: 'free_banner' });

    // 1. Near You — local events first
    for (const ev of localEvents) {
      items.push({ type: 'local_event', data: ev });
    }

    // 2. For You — AI picks after local, feels personalized
    if (aiLoading) {
      items.push({ type: 'ai_skeleton', key: 'sk1' });
      items.push({ type: 'ai_skeleton', key: 'sk2' });
    } else {
      for (const s of aiSuggestions) {
        items.push({ type: 'ai_suggestion', data: s, key: s.title });
      }
    }

    // 3. Weekend Themes — cap at 4 before the business promo
    for (const theme of themes.slice(0, 4)) {
      items.push({ type: 'theme', data: theme });
    }

    items.push({ type: 'business_promo' });
    return items;
  }, [isWeekendFree, aiLoading, aiSuggestions, themes, localEvents]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  const isEmpty =
    !loading &&
    !aiLoading &&
    themes.length === 0 &&
    localEvents.length === 0 &&
    aiSuggestions.length === 0;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.pageTitle}>Loop</Text>
          <Text style={styles.pageSubtitle}>Weekend ideas for your family</Text>
        </View>

        {isEmpty ? (
          <EmptyState
            icon="sparkles-outline"
            title="No ideas yet"
            subtitle="Add your children's ages and family interests to get personalized weekend ideas."
            ctaLabel="Set Interests"
            onCta={() => router.push('/(tabs)/children')}
          />
        ) : (
          feedItems.map((item, idx) => {
            switch (item.type) {
              case 'free_banner':
                return (
                  <View key="free-banner" style={styles.feedItem}>
                    <LinearGradient
                      colors={['rgba(99,102,241,0.3)', 'rgba(139,92,246,0.15)']}
                      style={styles.freeBanner}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.freeEmoji}>🎉</Text>
                      <View>
                        <Text style={styles.freeBannerTitle}>Weekend is free!</Text>
                        <Text style={styles.freeBannerSub}>
                          No events scheduled — pick a Loop to try.
                        </Text>
                      </View>
                    </LinearGradient>
                  </View>
                );

              case 'ai_skeleton':
                return <View key={item.key} style={[styles.feedItem, styles.aiSkeleton]} />;

              case 'ai_suggestion':
                return (
                  <View key={item.key} style={styles.feedItem}>
                    <View style={styles.aiBadgeRow}>
                      <Text style={styles.aiBadge}>✦ AI Pick</Text>
                    </View>
                    <View style={styles.aiCard}>
                      <Text style={styles.aiEmoji}>{item.data.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={styles.aiCardHeader}>
                          <Text style={styles.aiCardTitle}>{item.data.title}</Text>
                          <View style={styles.aiCategoryPill}>
                            <Text style={styles.aiCategoryText}>{item.data.category}</Text>
                          </View>
                        </View>
                        <Text style={styles.aiCardDesc}>{item.data.description}</Text>
                      </View>
                    </View>
                  </View>
                );

              case 'local_event':
                return (
                  <View key={item.data.id} style={styles.feedItem}>
                    <View style={styles.sectionBadgeRow}>
                      <Ionicons name="location-outline" size={12} color="#8E8E93" />
                      <Text style={styles.sectionBadge}>Near You</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.localCard}
                      onPress={() =>
                        item.data.registration_url && Linking.openURL(item.data.registration_url)
                      }
                      activeOpacity={0.8}
                    >
                      <View style={styles.localCardMain}>
                        <Text style={styles.localCardTitle} numberOfLines={2}>
                          {item.data.title}
                        </Text>
                        {item.data.venue_name && (
                          <Text style={styles.localCardVenue}>📍 {item.data.venue_name}</Text>
                        )}
                        <Text style={styles.localCardDate}>
                          {new Date(item.data.start_at).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                          {item.data.cost_cents === 0
                            ? ' · Free'
                            : ` · $${(item.data.cost_cents / 100).toFixed(0)}`}
                        </Text>
                      </View>
                      {item.data.cost_cents === 0 && (
                        <View style={styles.freePill}>
                          <Text style={styles.freePillText}>Free</Text>
                        </View>
                      )}
                      {item.data.registration_url && (
                        <Ionicons name="chevron-forward" size={16} color="#636366" />
                      )}
                    </TouchableOpacity>
                  </View>
                );

              case 'theme':
                return (
                  <View key={item.data.id}>
                    <LoopCard theme={item.data} />
                  </View>
                );

              case 'business_promo':
                return (
                  <View key="biz-promo" style={[styles.feedItem, { alignItems: 'center', paddingVertical: 8 }]}>
                    <TouchableOpacity
                      onPress={() =>
                        Linking.openURL(
                          'https://village-eugred-1544s-projects.vercel.app/for-businesses'
                        ).catch(() => {})
                      }
                    >
                      <Text style={styles.bizLink}>
                        Are you a local business? List your events →
                      </Text>
                    </TouchableOpacity>
                  </View>
                );

              default:
                return null;
            }
          })
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
    paddingBottom: 20,
  },
  pageTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  pageSubtitle: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 2,
  },
  feedItem: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  // Free banner
  freeBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
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
  // AI cards
  aiBadgeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  aiBadge: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  aiSkeleton: {
    height: 80,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
  },
  aiCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
  },
  aiEmoji: {
    fontSize: 28,
    lineHeight: 34,
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
    fontSize: 15,
    fontWeight: '700',
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
  // Section badge
  sectionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  sectionBadge: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Local event card
  localCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  localCardMain: {
    flex: 1,
  },
  localCardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 20,
  },
  localCardVenue: {
    color: '#8E8E93',
    fontSize: 12,
    marginBottom: 3,
  },
  localCardDate: {
    color: '#636366',
    fontSize: 12,
  },
  freePill: {
    backgroundColor: 'rgba(52,199,89,0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  freePillText: {
    color: '#34C759',
    fontSize: 11,
    fontWeight: '700',
  },
  bizLink: {
    color: '#636366',
    fontSize: 13,
  },
});

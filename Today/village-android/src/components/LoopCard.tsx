import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeWithActivities, ThemeActivity } from '@/types/database';

interface Props {
  theme: ThemeWithActivities;
}

// Deterministic gradient per theme — hash theme.id into one of 8 palettes
const GRADIENTS: [string, string][] = [
  ['#6366F1', '#8B5CF6'], // indigo-violet
  ['#10B981', '#059669'], // emerald
  ['#F43F5E', '#E11D48'], // rose
  ['#F97316', '#EA580C'], // orange
  ['#3B82F6', '#2563EB'], // blue
  ['#8B5CF6', '#7C3AED'], // purple
  ['#EAB308', '#CA8A04'], // amber
  ['#06B6D4', '#0891B2'], // cyan
];

function themeGradient(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) & 0xffffff;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}

const CATEGORY_ICONS: Record<ThemeActivity['category'], React.ComponentProps<typeof Ionicons>['name']> = {
  watch: 'play-circle-outline',
  visit: 'map-outline',
  buy:   'bag-outline',
  make:  'construct-outline',
};

const CATEGORY_LABELS: Record<ThemeActivity['category'], string> = {
  watch: 'Watch',
  visit: 'Visit',
  buy:   'Buy',
  make:  'Make',
};

function ActivityRow({ activity }: { activity: ThemeActivity }) {
  const icon  = CATEGORY_ICONS[activity.category] ?? 'ellipse-outline';
  const label = CATEGORY_LABELS[activity.category] ?? activity.category;

  return (
    <TouchableOpacity
      style={styles.activityRow}
      onPress={() => activity.url && Linking.openURL(activity.url)}
      disabled={!activity.url}
      activeOpacity={0.7}
    >
      <View style={styles.activityIcon}>
        <Ionicons name={icon} size={15} color="#818CF8" />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityLabel}>{label}</Text>
        <Text style={styles.activityTitle} numberOfLines={2}>{activity.title}</Text>
        {activity.description && (
          <Text style={styles.activityDesc} numberOfLines={1}>{activity.description}</Text>
        )}
      </View>
      {activity.url && (
        <Ionicons name="arrow-forward" size={13} color="#48484A" />
      )}
    </TouchableOpacity>
  );
}

export default function LoopCard({ theme }: Props) {
  const [saved, setSaved] = useState(false);
  const sorted     = [...theme.theme_activities].sort((a, b) => a.sort_order - b.sort_order);
  const [colorA, colorB] = themeGradient(theme.id);

  return (
    <View style={styles.wrapper}>
      {/* Gradient header */}
      <LinearGradient
        colors={[colorA, colorB]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerTop}>
          <Text style={styles.emoji}>{theme.emoji ?? '✨'}</Text>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => setSaved((v) => !v)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={20}
              color={saved ? '#FF2D55' : 'rgba(255,255,255,0.7)'}
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>{theme.title}</Text>
        {theme.description && (
          <Text style={styles.headerDesc}>{theme.description}</Text>
        )}
        <View style={styles.countPill}>
          <Text style={styles.countText}>{sorted.length} ideas</Text>
        </View>
      </LinearGradient>

      {/* Activity list */}
      <View style={styles.body}>
        {sorted.map((a) => (
          <ActivityRow key={a.id} activity={a} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
  },
  header: {
    padding: 18,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  emoji: {
    fontSize: 42,
    lineHeight: 48,
  },
  saveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  headerDesc: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  countPill: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  countText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
  },
  body: {
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 4,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  activityIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityLabel: {
    color: '#636366',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  activityTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  activityDesc: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 1,
  },
});

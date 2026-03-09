import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeWithActivities, ThemeActivity } from '@/types/database';

interface Props {
  theme: ThemeWithActivities;
}

const CATEGORY_ICONS: Record<ThemeActivity['category'], React.ComponentProps<typeof Ionicons>['name']> = {
  watch: 'play-circle-outline',
  visit: 'map-outline',
  buy: 'bag-outline',
  make: 'construct-outline',
};

const CATEGORY_LABELS: Record<ThemeActivity['category'], string> = {
  watch: 'Watch',
  visit: 'Visit',
  buy: 'Buy',
  make: 'Make',
};

function ActivityRow({ activity }: { activity: ThemeActivity }) {
  const icon = CATEGORY_ICONS[activity.category];
  const label = CATEGORY_LABELS[activity.category];

  return (
    <TouchableOpacity
      style={styles.activityRow}
      onPress={() => activity.url && Linking.openURL(activity.url)}
      disabled={!activity.url}
      activeOpacity={0.7}
    >
      <View style={styles.activityIcon}>
        <Ionicons name={icon} size={16} color="#818CF8" />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityLabel}>{label}</Text>
        <Text style={styles.activityTitle} numberOfLines={2}>{activity.title}</Text>
        {activity.description && (
          <Text style={styles.activityDesc} numberOfLines={1}>{activity.description}</Text>
        )}
      </View>
      {activity.url && (
        <Ionicons name="chevron-forward" size={14} color="#48484A" />
      )}
    </TouchableOpacity>
  );
}

export default function LoopCard({ theme }: Props) {
  const sorted = [...theme.theme_activities].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={['#6366F1', '#8B5CF6']}
        style={styles.gradientBorder}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{theme.title}</Text>
          {theme.description && (
            <Text style={styles.description}>{theme.description}</Text>
          )}

          {theme.tags && theme.tags.length > 0 && (
            <View style={styles.tags}>
              {theme.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {sorted.length > 0 && (
            <View style={styles.activities}>
              {sorted.map((a) => (
                <ActivityRow key={a.id} activity={a} />
              ))}
            </View>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 17,
  },
  gradientBorder: {
    borderRadius: 17,
    padding: 1,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 18,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  description: {
    color: '#8E8E93',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  tag: {
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '500',
  },
  activities: {
    gap: 2,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  activityIcon: {
    width: 32,
    height: 32,
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
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  activityTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  activityDesc: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 1,
  },
});

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EventWithChild } from '@/types/database';

interface Props {
  event: EventWithChild;
  showConflict?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const CHILD_COLORS = [
  { bg: 'rgba(99,102,241,0.18)', border: 'rgba(99,102,241,0.35)', text: '#818CF8' },
  { bg: 'rgba(16,185,129,0.18)', border: 'rgba(16,185,129,0.35)', text: '#34D399' },
  { bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.35)', text: '#FCD34D' },
  { bg: 'rgba(239,68,68,0.18)', border: 'rgba(239,68,68,0.35)', text: '#FCA5A5' },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
}

export default function EventCard({ event, showConflict, onPress, onLongPress }: Props) {
  const d = new Date(event.start_at);
  const day = d.getUTCDate();
  const month = MONTHS[d.getUTCMonth()];
  const childName = event.children?.name?.split(' ')[0];

  // Assign stable color based on child id hash
  const childColor = event.child_id
    ? CHILD_COLORS[(event.child_id.charCodeAt(0) + event.child_id.charCodeAt(1)) % CHILD_COLORS.length]
    : null;

  const timeStr = event.all_day ? 'All day' : formatTime(event.start_at);
  const todayKey = new Date().toISOString().slice(0, 10);
  const eventKey = event.start_at.slice(0, 10);
  const daysUntil = Math.round((Date.parse(eventKey) - Date.parse(todayKey)) / 86400000);
  const daysLabel = daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tmrw' : daysUntil > 0 && daysUntil <= 30 ? `${daysUntil}d` : null;
  const hasActions = event.required_actions && event.required_actions.length > 0;

  const content = (
    <View style={[styles.card, showConflict && styles.cardConflict]}>
      {/* Date column */}
      <View style={[styles.dateCol, showConflict && styles.dateColConflict]}>
        <Text style={styles.dateMonth}>{month}</Text>
        <Text style={styles.dateDay}>{day}</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
          {childName && childColor && (
            <View style={[styles.childBadge, { backgroundColor: childColor.bg, borderColor: childColor.border }]}>
              <Text style={[styles.childBadgeText, { color: childColor.text }]}>{childName}</Text>
            </View>
          )}
        </View>

        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={12} color="#636366" />
          <Text style={styles.metaText}>{timeStr}</Text>
          {event.location ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Ionicons name="location-outline" size={12} color="#636366" />
              <Text style={styles.metaText} numberOfLines={1}>{event.location}</Text>
            </>
          ) : null}
        </View>

        {daysLabel && (
          <View style={[
            styles.daysChip,
            daysUntil === 0 && styles.daysChipToday,
          ]}>
            <Text style={[styles.daysChipText, daysUntil === 0 && styles.daysChipTextToday]}>
              {daysLabel}
            </Text>
          </View>
        )}

        {hasActions && (
          <View style={styles.actionsWrap}>
            {event.required_actions!.slice(0, 2).map((action, i) => (
              <View key={i} style={styles.actionRow}>
                <Ionicons name="alert-circle-outline" size={11} color="#F59E0B" />
                <Text style={styles.actionText} numberOfLines={1}>{action}</Text>
              </View>
            ))}
            {event.required_actions!.length > 2 && (
              <Text style={styles.moreActions}>+{event.required_actions!.length - 2} more</Text>
            )}
          </View>
        )}
      </View>

      <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.15)" style={styles.chevron} />
    </View>
  );

  if (onPress || onLongPress) {
    return (
      <TouchableOpacity onPress={onPress} onLongPress={onLongPress} delayLongPress={500} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  cardConflict: {
    borderColor: 'rgba(245,158,11,0.35)',
    backgroundColor: 'rgba(245,158,11,0.06)',
  },
  dateCol: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  dateColConflict: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRightColor: 'rgba(245,158,11,0.2)',
  },
  dateMonth: {
    color: '#636366',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  dateDay: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 5,
  },
  title: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  childBadge: {
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  childBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  metaText: {
    color: '#636366',
    fontSize: 12,
    flexShrink: 1,
  },
  metaDot: {
    color: '#3A3A3C',
    fontSize: 12,
  },
  actionsWrap: {
    marginTop: 7,
    gap: 3,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    color: '#F59E0B',
    fontSize: 11,
    flex: 1,
  },
  moreActions: {
    color: '#636366',
    fontSize: 11,
    marginLeft: 15,
  },
  chevron: {
    alignSelf: 'center',
    marginRight: 12,
  },
  daysChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 5,
  },
  daysChipToday: {
    backgroundColor: 'rgba(52,199,89,0.18)',
  },
  daysChipText: {
    color: '#636366',
    fontSize: 10,
    fontWeight: '700',
  },
  daysChipTextToday: {
    color: '#34C759',
  },
});

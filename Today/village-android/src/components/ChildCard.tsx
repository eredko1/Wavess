import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChildWithNextEvent } from '@/types/database';

interface Props {
  child: ChildWithNextEvent;
  onEdit: (child: ChildWithNextEvent) => void;
}

const AVATAR_COLORS = ['#4F46E5', '#0D9488', '#D97706', '#DC2626', '#7C3AED', '#0369A1'];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function avatarColor(id: string): string {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatAge(months: number | null): string {
  if (months === null) return '?';
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}y ${rem}mo` : `${years}y`;
}

function formatNextEvent(event: ChildWithNextEvent['next_event']): string | null {
  if (!event) return null;
  const d = new Date(event.start_at);
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${label} · ${event.title}`;
}

export default function ChildCard({ child, onEdit }: Props) {
  const initials = getInitials(child.name);
  const age = formatAge(child.age_in_months);
  const nextEvent = formatNextEvent(child.next_event);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(child)} hitSlop={8}>
        <Ionicons name="pencil" size={14} color="#636366" />
      </TouchableOpacity>

      <View style={[styles.avatar, { backgroundColor: avatarColor(child.id) }]}>
        <Text style={styles.initials}>{initials}</Text>
      </View>

      <Text style={styles.name}>{child.name}</Text>

      <View style={styles.ageBadge}>
        <Text style={styles.ageText}>{age}</Text>
      </View>

      {nextEvent && (
        <Text style={styles.nextEvent} numberOfLines={2}>{nextEvent}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    margin: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    minHeight: 160,
  },
  editBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  initials: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
  },
  ageBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  ageText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '500',
  },
  nextEvent: {
    color: '#6366F1',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
});

import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import type { EventWithChild, Child } from '@/types/database';

type Mode = 'view' | 'edit';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
}

function formatDate(iso: string): string {
  const d = new Date(iso.split('T')[0] + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function parseIso(iso: string) {
  const [date, timePart] = iso.split('T');
  const time = timePart ? timePart.slice(0, 5) : '';
  return { date, time };
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [event, setEvent] = useState<EventWithChild | null>(null);
  const [children, setChildren] = useState<Pick<Child, 'id' | 'name'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('view');
  const [saving, setSaving] = useState(false);
  const [completedActions, setCompletedActions] = useState<Set<number>>(new Set());

  // Tasks
  const familyIdRef = useRef<string>('');
  const [tasks, setTasks] = useState<{ id: string; title: string; is_complete: boolean; assigned_to: string | null }[]>([]);
  const [taskInput, setTaskInput] = useState('');
  const [members, setMembers] = useState<{ id: string; display_name: string }[]>([]);

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editChildId, setEditChildId] = useState<string | null>(null);
  const [editActions, setEditActions] = useState('');
  const [editAllDay, setEditAllDay] = useState(false);
  const [showChildPicker, setShowChildPicker] = useState(false);
  const [editAssigneeId, setEditAssigneeId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data: user } = await supabase
        .from('users')
        .select('family_id')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!user) { setLoading(false); return; }

      // Fetch event — verify family ownership
      const { data } = await supabase
        .from('events')
        .select('*, children(id, name, age_in_months)')
        .eq('id', id)
        .eq('family_id', user.family_id)
        .single();

      if (data) {
        const ev = data as EventWithChild;
        // Look up display name of assignee
        if (ev.assigned_to) {
          const { data: assigneeUser } = await supabase
            .from('users')
            .select('display_name')
            .eq('id', ev.assigned_to)
            .maybeSingle();
          ev.assigned_to_name = assigneeUser?.display_name ?? null;
        }
        setEvent(ev);
        populateEditFields(ev);
        // Initialize completed actions from DB
        setCompletedActions(new Set(ev.completed_actions ?? []));
      }

      familyIdRef.current = user.family_id;

      const { data: kids } = await supabase
        .from('children')
        .select('id, name')
        .eq('family_id', user.family_id);
      setChildren(kids ?? []);

      // Fetch family members for assignee picker
      const { data: memberData } = await supabase
        .from('users')
        .select('id, display_name')
        .eq('family_id', user.family_id);
      setMembers(memberData ?? []);

      // Load tasks for this event
      const { data: taskData } = await supabase
        .from('tasks')
        .select('id, title, is_complete, assigned_to')
        .eq('event_id', id)
        .order('created_at', { ascending: true });
      setTasks(taskData ?? []);

      setLoading(false);
    }
    load();
  }, [id]);

  function populateEditFields(e: EventWithChild) {
    const { date, time } = parseIso(e.start_at);
    const endTime = e.end_at ? parseIso(e.end_at).time : '';
    setEditTitle(e.title);
    setEditDate(date);
    setEditTime(e.all_day ? '' : time);
    setEditEndTime(endTime);
    setEditLocation(e.location ?? '');
    setEditDescription(e.description ?? '');
    setEditChildId(e.child_id);
    setEditActions((e.required_actions ?? []).join('\n'));
    setEditAllDay(e.all_day);
    setEditAssigneeId(e.assigned_to ?? null);
  }

  async function handleAddTask() {
    const title = taskInput.trim();
    if (!title || !event) return;
    setTaskInput('');
    const { data } = await supabase.from('tasks').insert({
      family_id: familyIdRef.current,
      event_id: event.id,
      title,
      is_complete: false,
    }).select('id, title, is_complete, assigned_to').single();
    if (data) setTasks(prev => [...prev, data]);
  }

  async function toggleTask(taskId: string, current: boolean) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_complete: !current } : t));
    await supabase.from('tasks').update({ is_complete: !current }).eq('id', taskId);
  }

  async function handleDuplicate() {
    if (!event) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.from('events').insert({
      family_id: event.family_id,
      child_id: event.child_id,
      title: event.title + ' (copy)',
      description: event.description,
      start_at: event.start_at,
      end_at: event.end_at,
      all_day: event.all_day,
      location: event.location,
      required_actions: event.required_actions,
      status: 'confirmed',
      source: 'manual',
    });
    if (error) { Alert.alert('Error', error.message); return; }
    router.back();
  }

  async function toggleAction(index: number) {
    const next = new Set(completedActions);
    if (next.has(index)) next.delete(index); else next.add(index);
    setCompletedActions(next);
    const arr = [...next];
    const { error } = await supabase
      .from('events')
      .update({ completed_actions: arr })
      .eq('id', event!.id)
      .eq('family_id', event!.family_id);
    if (error) {
      console.error('[toggleAction] update failed:', error.message);
    }
  }

  async function handleSave() {
    if (!event) return;
    if (!editTitle.trim()) {
      Alert.alert('Error', 'Title is required');
      return;
    }
    if (!editDate) {
      Alert.alert('Error', 'Date is required');
      return;
    }

    setSaving(true);
    const startAt = (!editAllDay && editTime)
      ? new Date(`${editDate}T${editTime}:00`).toISOString()
      : `${editDate}T00:00:00.000Z`;
    const endAt = (!editAllDay && editEndTime)
      ? new Date(`${editDate}T${editEndTime}:00`).toISOString()
      : null;
    const actions = editActions
      .split('\n')
      .map(a => a.trim())
      .filter(Boolean);

    const { error } = await supabase
      .from('events')
      .update({
        title: editTitle.trim(),
        start_at: startAt,
        end_at: endAt,
        all_day: editAllDay || !editTime,
        location: editLocation.trim() || null,
        description: editDescription.trim() || null,
        child_id: editChildId,
        required_actions: actions,
        assigned_to: editAssigneeId || null,
      })
      .eq('id', event.id);

    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setMode('view');
      router.back();
    }
  }

  function openGoogleCal() {
    if (!event) return;
    const fmt = (iso: string, allDay: boolean) =>
      allDay
        ? iso.slice(0, 10).replace(/-/g, '')
        : iso.replace(/[-:]/g, '').replace('.000Z', 'Z').slice(0, 15) + 'Z';
    const start = fmt(event.start_at, event.all_day);
    const end = event.end_at
      ? fmt(event.end_at, event.all_day)
      : event.all_day
        ? fmt(new Date(new Date(event.start_at).getTime() + 86400000).toISOString(), true)
        : fmt(new Date(new Date(event.start_at).getTime() + 3600000).toISOString(), false);
    const params = new URLSearchParams({ action: 'TEMPLATE', text: event.title, dates: `${start}/${end}` });
    if (event.location) params.set('location', event.location);
    if (event.description) params.set('details', event.description);
    Linking.openURL(`https://www.google.com/calendar/render?${params.toString()}`).catch(() =>
      Alert.alert('Could not open', 'Make sure Google Calendar is installed.')
    );
  }

  async function handleShare() {
    if (!event) return;
    const lines: string[] = [event.title];
    lines.push(formatDate(event.start_at));
    if (!event.all_day) {
      const time = formatTime(event.start_at);
      lines.push(event.end_at ? `${time} – ${formatTime(event.end_at)}` : time);
    }
    if (event.location) lines.push(`📍 ${event.location}`);
    if (event.required_actions?.length) {
      lines.push('');
      lines.push('Needed:');
      event.required_actions.forEach(a => lines.push(`• ${a}`));
    }
    await Share.share({ message: lines.join('\n'), title: event.title });
  }

  async function handleDelete() {
    Alert.alert(
      'Delete event?',
      `"${event?.title}" will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('events').delete().eq('id', id).eq('family_id', event!.family_id);
            router.back();
          },
        },
      ]
    );
  }

  function startEditing() {
    if (event) populateEditFields(event);
    setMode('edit');
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.errorText}>Event not found</Text>
      </View>
    );
  }

  const selectedChildName = children.find(c => c.id === editChildId)?.name ?? 'Unassigned';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#6366F1" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        {mode === 'view' ? (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={openGoogleCal} style={styles.editBtn}>
              <Ionicons name="calendar-outline" size={19} color="#6366F1" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={styles.editBtn}>
              <Ionicons name="share-outline" size={20} color="#6366F1" />
            </TouchableOpacity>
            <TouchableOpacity onPress={startEditing} style={styles.editBtn}>
              <Ionicons name="pencil-outline" size={18} color="#6366F1" />
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setMode('view')} style={styles.editBtn}>
            <Text style={[styles.editText, { color: '#8E8E93' }]}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {mode === 'view' ? (
          // ─── VIEW MODE ───────────────────────────────────────────────
          <View style={styles.viewSection}>
            <Text style={styles.viewTitle}>{event.title}</Text>

            {event.children && (
              <View style={styles.childBadge}>
                <Text style={styles.childBadgeText}>{event.children.name}</Text>
              </View>
            )}

            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={16} color="#8E8E93" />
              <Text style={styles.metaText}>
                {formatDate(event.start_at)}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={16} color="#8E8E93" />
              <Text style={styles.metaText}>
                {event.all_day
                  ? 'All day'
                  : `${formatTime(event.start_at)}${event.end_at ? ` – ${formatTime(event.end_at)}` : ''}`}
              </Text>
            </View>

            {event.location && (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={16} color="#8E8E93" />
                <Text style={styles.metaText}>{event.location}</Text>
              </View>
            )}

            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={16} color="#8E8E93" />
              <Text style={[styles.metaText, !event.assigned_to_name && { color: '#636366' }]}>
                {event.assigned_to_name ?? 'Unassigned'}
              </Text>
            </View>

            {event.description ? (
              <View style={styles.notesSection}>
                <Text style={styles.sectionLabel}>Notes</Text>
                <Text style={styles.notesText}>{event.description}</Text>
              </View>
            ) : null}

            {event.required_actions && event.required_actions.length > 0 && (
              <View style={styles.actionsSection}>
                <View style={styles.actionsSectionHeader}>
                  <Text style={styles.sectionLabel}>Required actions</Text>
                  {completedActions.size > 0 && (
                    <Text style={styles.actionProgress}>
                      {completedActions.size}/{event.required_actions.length}
                    </Text>
                  )}
                </View>
                {event.required_actions.map((action, i) => {
                  const done = completedActions.has(i);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={styles.actionRow}
                      onPress={() => toggleAction(i)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={done ? 'checkmark-circle' : 'checkmark-circle-outline'}
                        size={18}
                        color={done ? '#34C759' : '#F59E0B'}
                      />
                      <Text style={[styles.actionText, done && styles.actionTextDone]}>
                        {action}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Tasks */}
            <View style={styles.actionsSection}>
              <Text style={styles.sectionLabel}>Tasks</Text>
              {tasks.map(task => (
                <TouchableOpacity key={task.id} style={styles.actionRow} onPress={() => toggleTask(task.id, task.is_complete)} activeOpacity={0.7}>
                  <Ionicons name={task.is_complete ? 'checkmark-circle' : 'checkmark-circle-outline'} size={18} color={task.is_complete ? '#34C759' : '#636366'} />
                  <Text style={[styles.actionText, { color: task.is_complete ? '#636366' : '#EBEBF5' }, task.is_complete && styles.actionTextDone]}>{task.title}</Text>
                </TouchableOpacity>
              ))}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <TextInput
                  style={[styles.input, { flex: 1, paddingVertical: 8 }]}
                  value={taskInput}
                  onChangeText={setTaskInput}
                  placeholder="Add a task…"
                  placeholderTextColor="#636366"
                  onSubmitEditing={handleAddTask}
                  returnKeyType="done"
                />
                <TouchableOpacity onPress={handleAddTask} style={{ padding: 8 }}>
                  <Ionicons name="add-circle" size={22} color="#6366F1" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.deleteRow}>
              <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDuplicate} style={styles.duplicateBtn}>
                <Ionicons name="copy-outline" size={15} color="#8E8E93" />
                <Text style={styles.duplicateText}>Duplicate</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          // ─── EDIT MODE ───────────────────────────────────────────────
          <View style={styles.editSection}>
            <Text style={styles.editScreenTitle}>Edit Event</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Event title"
                placeholderTextColor="#636366"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Date *</Text>
                <TextInput
                  style={styles.input}
                  value={editDate}
                  onChangeText={setEditDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#636366"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={[styles.field, { flex: 1, marginLeft: 12 }]}>
                <Text style={styles.fieldLabel}>Time</Text>
                <TextInput
                  style={styles.input}
                  value={editTime}
                  onChangeText={setEditTime}
                  placeholder="HH:MM"
                  placeholderTextColor="#636366"
                  keyboardType="numbers-and-punctuation"
                  editable={!editAllDay}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>End time</Text>
              <TextInput
                style={styles.input}
                value={editEndTime}
                onChangeText={setEditEndTime}
                placeholder="HH:MM"
                placeholderTextColor="#636366"
                keyboardType="numbers-and-punctuation"
                editable={!editAllDay}
              />
            </View>

            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setEditAllDay(!editAllDay)}
            >
              <View style={[styles.checkbox, editAllDay && styles.checkboxChecked]}>
                {editAllDay && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <Text style={styles.checkLabel}>All day event</Text>
            </TouchableOpacity>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Location</Text>
              <TextInput
                style={styles.input}
                value={editLocation}
                onChangeText={setEditLocation}
                placeholder="Location"
                placeholderTextColor="#636366"
              />
            </View>

            {members.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Assigned to</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 2 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.chip, editAssigneeId === null && styles.chipSelected]}
                      onPress={() => setEditAssigneeId(null)}
                    >
                      <Text style={[styles.chipText, editAssigneeId === null && styles.chipTextSelected]}>
                        Unassigned
                      </Text>
                    </TouchableOpacity>
                    {members.map(m => (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.chip, editAssigneeId === m.id && styles.chipSelected]}
                        onPress={() => setEditAssigneeId(m.id)}
                      >
                        <Text style={[styles.chipText, editAssigneeId === m.id && styles.chipTextSelected]}>
                          {m.display_name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Any extra details…"
                placeholderTextColor="#636366"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {children.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Child</Text>
                <TouchableOpacity
                  style={styles.picker}
                  onPress={() => setShowChildPicker(!showChildPicker)}
                >
                  <Text style={styles.pickerText}>{selectedChildName}</Text>
                  <Ionicons name="chevron-down" size={16} color="#8E8E93" />
                </TouchableOpacity>
                {showChildPicker && (
                  <View style={styles.pickerDropdown}>
                    <TouchableOpacity
                      style={styles.pickerOption}
                      onPress={() => { setEditChildId(null); setShowChildPicker(false); }}
                    >
                      <Text style={styles.pickerOptionText}>Unassigned</Text>
                    </TouchableOpacity>
                    {children.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.pickerOption}
                        onPress={() => { setEditChildId(c.id); setShowChildPicker(false); }}
                      >
                        <Text style={styles.pickerOptionText}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Required actions</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={editActions}
                onChangeText={setEditActions}
                placeholder={'Sign permission slip\nBring $5'}
                placeholderTextColor="#636366"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              <Text style={styles.hint}>One action per line</Text>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
            </TouchableOpacity>
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
  errorText: {
    color: '#8E8E93',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    color: '#6366F1',
    fontSize: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editText: {
    color: '#6366F1',
    fontSize: 16,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  // View mode
  viewSection: {
    gap: 12,
  },
  viewTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  childBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.4)',
    marginBottom: 4,
  },
  childBadgeText: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  metaText: {
    color: '#EBEBF5',
    fontSize: 15,
    flex: 1,
    lineHeight: 20,
  },
  actionsSection: {
    marginTop: 8,
    gap: 8,
  },
  actionsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  actionProgress: {
    color: '#34C759',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 2,
  },
  actionText: {
    color: '#F59E0B',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  actionTextDone: {
    color: '#636366',
    textDecorationLine: 'line-through',
  },
  notesSection: {
    marginTop: 4,
    gap: 4,
  },
  notesText: {
    color: '#EBEBF5',
    fontSize: 14,
    lineHeight: 20,
  },
  deleteRow: {
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deleteText: {
    color: '#EF4444',
    fontSize: 15,
  },
  duplicateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  duplicateText: {
    color: '#8E8E93',
    fontSize: 15,
  },
  // Edit mode
  editSection: {
    gap: 16,
  },
  editScreenTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  textarea: {
    minHeight: 80,
    paddingTop: 12,
  },
  hint: {
    color: '#636366',
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
    gap: 0,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#636366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  checkLabel: {
    color: '#EBEBF5',
    fontSize: 15,
  },
  picker: {
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pickerText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  pickerDropdown: {
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pickerOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  pickerOptionText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  chipSelected: {
    backgroundColor: 'rgba(99,102,241,0.25)',
    borderColor: '#6366F1',
  },
  chipText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#818CF8',
  },
});

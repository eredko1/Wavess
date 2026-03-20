import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  Share,
  Platform,
  Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { LOCAL_API_BASE } from '@/lib/config';
import type { Child } from '@/types/database';

interface FamilyData {
  id: string;
  name: string;
  plan_tier: string;
  ingestion_count: number;
  zip_code: string | null;
}

interface FamilyMember {
  id: string;
  display_name: string;
  role: string;
}

function ageLabel(months: number | null): string {
  if (!months) return '—';
  if (months < 24) return `${months}mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y}yr ${m}mo` : `${y}yr`;
}

function StatCard({ icon, color, value, label }: { icon: string; color: string; value: number | string; label: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon as never} size={18} color={color} style={{ marginBottom: 6 }} />
      <Text style={styles.statNum}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [familyId, setFamilyId] = useState('');
  const [family, setFamily] = useState<FamilyData | null>(null);
  const [children, setChildren] = useState<Pick<Child, 'id' | 'name' | 'age_in_months'>[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [userPhone, setUserPhone] = useState('');
  const [userId, setUserId] = useState('');
  const [userRole, setUserRole] = useState('');
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Family name editing
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const nameInputRef = useRef<TextInput>(null);

  // Invite co-parent
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Family join code
  const [joinCode, setJoinCode] = useState<string | null>(null);

  // Calendar token for live subscription
  const [calToken, setCalToken] = useState<string | null>(null);

  async function fetchData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setUserPhone(session.user.phone || session.user.email || session.user.id);
    setUserId(session.user.id);

    const { data: user } = await supabase
      .from('users')
      .select('family_id, role')
      .eq('id', session.user.id)
      .maybeSingle();

    if (!user) return;
    setFamilyId(user.family_id);
    setUserRole(user.role ?? '');

    const [familyRes, childrenRes, eventsRes, membersRes] = await Promise.all([
      supabase
        .from('families')
        .select('id, name, plan_tier, ingestion_count, zip_code')
        .eq('id', user.family_id)
        .single(),
      supabase
        .from('children')
        .select('id, name, age_in_months')
        .eq('family_id', user.family_id)
        .order('dob', { ascending: false }),
      supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('family_id', user.family_id)
        .eq('status', 'confirmed')
        .gte('start_at', new Date().toISOString()),
      supabase
        .from('users')
        .select('id, display_name, role')
        .eq('family_id', user.family_id)
        .order('created_at', { ascending: true }),
    ]);

    const fam = familyRes.data as FamilyData | null;
    setFamily(fam);
    setNameValue(fam?.name ?? '');
    setChildren((childrenRes.data ?? []) as typeof children);
    setTotalEvents(eventsRes.count ?? 0);
    setMembers((membersRes.data ?? []) as FamilyMember[]);

    // Fetch calendar token for live subscription URLs
    const tokenRes = await fetch(`${LOCAL_API_BASE}/api/calendar/token`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (tokenRes.ok) {
      const json = await tokenRes.json();
      setCalToken(json.token);
    }

    // Fetch family join code
    const codeRes = await fetch(`${LOCAL_API_BASE}/api/family/join-code`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (codeRes.ok) {
      const json = await codeRes.json();
      setJoinCode(json.code ?? null);
    }
  }

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, []);

  // Cancel any in-progress name edit when navigating away
  useFocusEffect(
    useCallback(() => {
      return () => {
        setEditingName(false);
      };
    }, [])
  );

  async function handleSaveName() {
    if (!nameValue.trim() || !familyId) return;
    setNameSaving(true);
    const { error } = await supabase
      .from('families')
      .update({ name: nameValue.trim() })
      .eq('id', familyId);
    setNameSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setFamily(prev => prev ? { ...prev, name: nameValue.trim() } : prev);
      setEditingName(false);
    }
  }

  async function handleInvite() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }
    setInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LOCAL_API_BASE}/api/family/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        Alert.alert('Error', json.error ?? 'Failed to generate invite');
      } else {
        setInviteEmail('');
        const shareMsg = json.switching_family
          ? `Join my family on Village! Note: clicking this link will move you out of your current family.\n\n${json.invite_link}`
          : `Join my family on Village!\n\n${json.invite_link}`;
        await Share.share({ message: shareMsg, url: json.invite_link });
      }
    } catch {
      Alert.alert('Error', 'Network error — check your connection.');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    Alert.alert(
      'Remove Member',
      `Remove ${memberName} from the family? They will lose access to all shared data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const res = await fetch(`${LOCAL_API_BASE}/api/family/members/${memberId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
              });
              const json = await res.json();
              if (!res.ok) {
                Alert.alert('Error', json.error ?? 'Failed to remove member.');
              } else {
                setMembers(prev => prev.filter(m => m.id !== memberId));
              }
            } catch {
              Alert.alert('Error', 'Network error — check your connection.');
            }
          },
        },
      ]
    );
  }

  async function exportCalendar(childId?: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = childId
        ? `${LOCAL_API_BASE}/api/events/export?child=${childId}`
        : `${LOCAL_API_BASE}/api/events/export`;
      const filename = childId
        ? `village-${children.find(c => c.id === childId)?.name.split(' ')[0].toLowerCase() ?? 'child'}.ics`
        : 'village-calendar.ics';

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      if (!res.ok) {
        Alert.alert('Export failed', `Server returned ${res.status}.`);
        return;
      }
      const icsText = await res.text();
      const dest = FileSystem.cacheDirectory + filename;
      await FileSystem.writeAsStringAsync(dest, icsText, { encoding: FileSystem.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Not supported', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(dest, { mimeType: 'text/calendar', UTI: 'public.calendar' });
    } catch (err) {
      Alert.alert('Export failed', String(err));
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const res = await fetch(`${LOCAL_API_BASE}/api/account`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
              });
              if (res.ok) {
                await supabase.auth.signOut();
              } else {
                const json = await res.json();
                Alert.alert('Error', json.error ?? 'Failed to delete account.');
              }
            } catch {
              Alert.alert('Error', 'Network error — check your connection.');
            }
          },
        },
      ]
    );
  }

  const ingestLimit = family?.plan_tier === 'paid' ? '∞' : '10';

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
        <View style={[styles.pageHeader, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.pageTitle}>Settings</Text>
        </View>

        {/* Family card */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>FAMILY</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Name</Text>
                {editingName ? (
                  <TextInput
                    ref={nameInputRef}
                    value={nameValue}
                    onChangeText={setNameValue}
                    style={styles.nameInput}
                    autoFocus
                    onSubmitEditing={handleSaveName}
                    returnKeyType="done"
                  />
                ) : (
                  <Text style={styles.fieldValue}>{family?.name ?? '—'}</Text>
                )}
              </View>
              {editingName ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={handleSaveName} disabled={nameSaving}
                    style={[styles.iconBtn, { backgroundColor: 'rgba(52,199,89,0.15)' }]}>
                    <Ionicons name="checkmark" size={16} color="#34C759" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingName(false); setNameValue(family?.name ?? ''); }}
                    style={[styles.iconBtn, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                    <Ionicons name="close" size={16} color="#636366" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setEditingName(true)} style={styles.iconBtn}>
                  <Ionicons name="pencil" size={14} color="#636366" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.cardRow}>
              <Text style={styles.fieldLabel}>Plan</Text>
              <View style={[styles.planBadge, family?.plan_tier === 'paid' && styles.planBadgePaid]}>
                <Text style={[styles.planBadgeText, family?.plan_tier === 'paid' && styles.planBadgeTextPaid]}>
                  {family?.plan_tier === 'paid' ? 'Paid' : 'Free'}
                </Text>
              </View>
            </View>

            {family?.zip_code ? (
              <>
                <View style={styles.divider} />
                <View style={styles.cardRow}>
                  <Text style={styles.fieldLabel}>ZIP code</Text>
                  <Text style={styles.fieldValueRight}>{family.zip_code}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACTIVITY</Text>
          <View style={styles.statsRow}>
            <StatCard icon="calendar-outline" color="#6366F1" value={totalEvents} label="Upcoming" />
            <StatCard icon="people-outline" color="#34C759" value={children.length} label="Children" />
            <StatCard icon="sparkles-outline" color="#F59E0B" value={`${family?.ingestion_count ?? 0}/${ingestLimit}`} label="AI uses" />
          </View>
        </View>

        {/* Children */}
        {children.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CHILDREN</Text>
            <View style={styles.card}>
              {children.map((c, i) => (
                <View key={c.id}>
                  <View style={styles.cardRow}>
                    <View style={styles.childAvatar}>
                      <Text style={styles.childAvatarText}>{c.name[0]}</Text>
                    </View>
                    <Text style={[styles.fieldValue, { flex: 1 }]}>{c.name}</Text>
                    <Text style={styles.fieldValueRight}>{ageLabel(c.age_in_months)}</Text>
                  </View>
                  {i < children.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Family Members */}
        {members.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>FAMILY MEMBERS</Text>
            <View style={styles.card}>
              {members.map((m, i) => (
                <View key={m.id}>
                  <View style={styles.cardRow}>
                    <View style={styles.childAvatar}>
                      <Text style={styles.childAvatarText}>
                        {(m.display_name ?? '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldValue}>{m.display_name}</Text>
                      <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>
                        {m.role.replace('_', ' ')}
                        {m.id === userId ? ' · you' : ''}
                      </Text>
                    </View>
                    {userRole === 'owner' && m.id !== userId && m.role !== 'owner' && (
                      <TouchableOpacity
                        onPress={() => handleRemoveMember(m.id, m.display_name)}
                        style={[styles.iconBtn, { backgroundColor: 'rgba(255,59,48,0.1)' }]}
                      >
                        <Ionicons name="person-remove-outline" size={14} color="#FF453A" />
                      </TouchableOpacity>
                    )}
                  </View>
                  {i < members.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Family Join Code */}
        {joinCode && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>FAMILY CODE</Text>
            <View style={styles.card}>
              <View style={[styles.cardRow, { justifyContent: 'center', paddingVertical: 16, gap: 16 }]}>
                <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '700', letterSpacing: 8, fontVariant: ['tabular-nums'] }}>
                  {joinCode}
                </Text>
                <TouchableOpacity
                  onPress={() => Share.share({ message: `Join my family on Village with code: ${joinCode}` })}
                  style={[styles.iconBtn, { backgroundColor: 'rgba(99,102,241,0.2)', width: 'auto', paddingHorizontal: 12 }]}
                >
                  <Text style={{ color: '#818CF8', fontSize: 13, fontWeight: '600' }}>Share</Text>
                </TouchableOpacity>
              </View>
              <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                <Text style={{ color: '#636366', fontSize: 12, lineHeight: 16, textAlign: 'center' }}>
                  Share this code with your co-parent. They enter it in the app to join instantly.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Invite co-parent */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>INVITE CO-PARENT</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <TextInput
                style={[styles.nameInput, { flex: 1, fontSize: 15 }]}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="partner@email.com"
                placeholderTextColor="#636366"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                onSubmitEditing={handleInvite}
              />
              <TouchableOpacity
                onPress={handleInvite}
                disabled={inviting}
                style={[styles.iconBtn, { backgroundColor: 'rgba(99,102,241,0.2)', width: 'auto', paddingHorizontal: 12 }]}
              >
                <Text style={{ color: '#818CF8', fontSize: 13, fontWeight: '600' }}>
                  {inviting ? 'Working…' : 'Invite'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              <Text style={{ color: '#636366', fontSize: 12, lineHeight: 16 }}>
                You'll get a link to share with your co-parent via text or email.
              </Text>
            </View>
          </View>
        </View>

        {/* Calendar integrations */}
        {calToken && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CALENDAR INTEGRATIONS</Text>
            <View style={styles.card}>
              {/* Subscribe row for all children */}
              <View style={styles.exportRow}>
                <Ionicons name="calendar-outline" size={17} color="#6366F1" />
                <Text style={[styles.exportLabel, { color: '#EBEBF5', flex: 1 }]}>All children</Text>
                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    style={[styles.calBtn, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
                    onPress={() => Linking.openURL(`webcal://${LOCAL_API_BASE.replace(/^https?:\/\//, '')}/api/calendar/${familyId}?token=${calToken}`).catch(() => {})}
                  >
                    <Text style={styles.calBtnText}>🍎 Apple</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.calBtn, { backgroundColor: 'rgba(66,133,244,0.2)' }]}
                  onPress={() => {
                    const url = `${LOCAL_API_BASE}/api/calendar/${familyId}?token=${calToken}`;
                    Clipboard.setString(url);
                    Alert.alert(
                      'URL Copied',
                      'The calendar URL has been copied. In Google Calendar, go to Settings → Add calendar → From URL, then paste it.',
                      [
                        { text: 'Open Google Calendar', onPress: () => Linking.openURL(`https://calendar.google.com/calendar/r/settings/addbyurl?url=${encodeURIComponent(url)}`).catch(() => {}) },
                        { text: 'OK', style: 'cancel' },
                      ]
                    );
                  }}
                >
                  <Text style={[styles.calBtnText, { color: '#4285F4' }]}>Google</Text>
                </TouchableOpacity>
              </View>
              {children.map((c) => (
                <View key={c.id}>
                  <View style={styles.divider} />
                  <View style={styles.exportRow}>
                    <Ionicons name="calendar-outline" size={17} color="#636366" />
                    <Text style={[styles.exportLabel, { color: '#EBEBF5', flex: 1 }]}>{c.name.split(' ')[0]} only</Text>
                    {Platform.OS === 'ios' && (
                      <TouchableOpacity
                        style={[styles.calBtn, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
                        onPress={() => Linking.openURL(`webcal://${LOCAL_API_BASE.replace(/^https?:\/\//, '')}/api/calendar/${familyId}?token=${calToken}&child=${c.id}`).catch(() => {})}
                      >
                        <Text style={styles.calBtnText}>🍎 Apple</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.calBtn, { backgroundColor: 'rgba(66,133,244,0.2)' }]}
                      onPress={() => {
                        const url = `${LOCAL_API_BASE}/api/calendar/${familyId}?token=${calToken}&child=${c.id}`;
                        Clipboard.setString(url);
                        Alert.alert(
                          'URL Copied',
                          `${c.name.split(' ')[0]}'s calendar URL has been copied. In Google Calendar, go to Settings → Add calendar → From URL, then paste it.`,
                          [
                            { text: 'Open Google Calendar', onPress: () => Linking.openURL(`https://calendar.google.com/calendar/r/settings/addbyurl?url=${encodeURIComponent(url)}`).catch(() => {}) },
                            { text: 'OK', style: 'cancel' },
                          ]
                        );
                      }}
                    >
                      <Text style={[styles.calBtnText, { color: '#4285F4' }]}>Google</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {/* .ics one-time download still available */}
              <View style={styles.divider} />
              <TouchableOpacity style={styles.exportRow} onPress={() => exportCalendar()}>
                <Ionicons name="download-outline" size={15} color="#636366" />
                <Text style={[styles.exportLabel, { color: '#636366', fontSize: 13 }]}>One-time .ics download</Text>
                <Ionicons name="chevron-forward" size={14} color="#3A3A3C" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Google Calendar import */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>IMPORT FROM GOOGLE</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.exportRow}
              onPress={() => Linking.openURL(`${LOCAL_API_BASE}/api/calendar/google/connect`).catch(() =>
                Alert.alert('Error', 'Could not open browser.')
              )}
            >
              <Ionicons name="logo-google" size={17} color="#4285F4" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.exportLabel, { color: '#EBEBF5', fontSize: 15 }]}>Connect Google Calendar</Text>
                <Text style={{ color: '#636366', fontSize: 12 }}>Import events from your Google Calendar</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#3A3A3C" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.fieldLabel}>Signed in as</Text>
              <Text style={styles.fieldValueRight} numberOfLines={1}>{userPhone}</Text>
            </View>
          </View>
        </View>

        {/* Sign out */}
        <View style={[styles.section, { marginTop: 8 }]}>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={17} color="#FF453A" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Delete account */}
        <View style={[styles.section, { marginTop: 0 }]}>
          <TouchableOpacity onPress={handleDeleteAccount} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ color: '#636366', fontSize: 13 }}>Delete account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { justifyContent: 'center', alignItems: 'center' },
  pageHeader: { paddingHorizontal: 20, paddingBottom: 20 },
  pageTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  section: { marginBottom: 24, paddingHorizontal: 16 },
  sectionLabel: { color: '#636366', fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: '#1C1C1E', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.07)', marginLeft: 16 },
  fieldLabel: { color: '#8E8E93', fontSize: 13, marginBottom: 2 },
  fieldValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  fieldValueRight: { color: '#8E8E93', fontSize: 13, flexShrink: 1, textAlign: 'right' },
  nameInput: { color: '#FFFFFF', fontSize: 15, fontWeight: '500', borderBottomWidth: 1, borderBottomColor: '#6366F1', paddingBottom: 2, minWidth: 120 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  planBadge: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  planBadgePaid: { backgroundColor: 'rgba(99,102,241,0.2)' },
  planBadgeText: { color: '#8E8E93', fontSize: 12, fontWeight: '600' },
  planBadgeTextPaid: { color: '#818CF8' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: '#1C1C1E', borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  statNum: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 2 },
  statLabel: { color: '#636366', fontSize: 10, textAlign: 'center' },
  childAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(99,102,241,0.2)', alignItems: 'center', justifyContent: 'center' },
  childAvatarText: { color: '#818CF8', fontSize: 12, fontWeight: '700' },
  exportRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  exportLabel: { flex: 1, color: '#6366F1', fontSize: 15, fontWeight: '500' },
  calBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  calBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1C1C1E', borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,59,48,0.25)' },
  signOutText: { color: '#FF453A', fontSize: 16, fontWeight: '600' },
});

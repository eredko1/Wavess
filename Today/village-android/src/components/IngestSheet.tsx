import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { LOCAL_API_BASE } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import type { ParsedEvent } from '@/types/database';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Segment = 'text' | 'image' | 'camera';
type State = 'idle' | 'processing' | 'preview' | 'error';

function confidenceBg(c: ParsedEvent['confidence']): string {
  if (c === 'high') return 'rgba(34,197,94,0.15)';
  if (c === 'medium') return 'rgba(234,179,8,0.15)';
  return 'rgba(239,68,68,0.15)';
}
function confidenceColor(c: ParsedEvent['confidence']): string {
  if (c === 'high') return '#22C55E';
  if (c === 'medium') return '#EAB308';
  return '#EF4444';
}

export default function IngestSheet({ visible, onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('text');
  const [state, setState] = useState<State>('idle');
  const [inputText, setInputText] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState('image/jpeg');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedEvent[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setState('idle');
    setInputText('');
    setImageBase64(null);
    setImageUri(null);
    setDocId(null);
    setParsed([]);
    setChecked([]);
    setErrorMsg('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setImageUri(asset.uri);
      setImageBase64(asset.base64 ?? null);
      setImageMime(normalizeMime(asset.mimeType));
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow camera access in Settings.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.8,
      saveToPhotosAlbum: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const base64 = asset.base64 ?? null;
      const mime = normalizeMime(asset.mimeType);
      setImageUri(asset.uri);
      setImageBase64(base64);
      setImageMime(mime);
      setSegment('image');
      if (base64) await doExtract(undefined, base64, mime);
    }
  }

  function normalizeMime(mime?: string | null): string {
    if (!mime) return 'image/jpeg';
    // expo-image-picker converts HEIC to JPEG but may still report heic/heif
    if (mime === 'image/heic' || mime === 'image/heif') return 'image/jpeg';
    return mime;
  }

  async function doExtract(text?: string, imageB64?: string, imageMimeType?: string) {
    setState('processing');
    setErrorMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const body: Record<string, string> = {};
      if (text) body.text = text;
      if (imageB64) {
        body.image_base64 = imageB64;
        body.mime_type = imageMimeType ?? 'image/jpeg';
      }

      const res = await fetch(`${LOCAL_API_BASE}/api/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Extraction failed');

      const events: ParsedEvent[] = data.parsed ?? [];
      if (events.length === 0) {
        setErrorMsg('No events found. Try adding more detail.');
        setState('error');
        return;
      }

      setDocId(data.doc_id);
      setParsed(events);
      setChecked(events.map(() => true));
      setState('preview');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setState('error');
    }
  }

  async function handleExtract() {
    const hasText = segment === 'text' && inputText.trim();
    const hasImage = (segment === 'image' || segment === 'camera') && imageBase64;
    if (!hasText && !hasImage) {
      setErrorMsg(segment === 'text' ? 'Please enter some text.' : 'Please select an image.');
      setState('error');
      return;
    }
    await doExtract(
      hasText ? inputText : undefined,
      hasImage ? imageBase64! : undefined,
      hasImage ? imageMime : undefined,
    );
  }



  async function handleSave() {
    if (!docId) return;
    setSaving(true);
    const selectedEvents = parsed.filter((_, i) => checked[i]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${LOCAL_API_BASE}/api/ingest/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ doc_id: docId, events: selectedEvents }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');

      handleClose();
      onSaved();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed.');
      setState('error');
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = checked.filter(Boolean).length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.root, { paddingTop: insets.top || 20 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Extract Events</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close-circle" size={28} color="#636366" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          {state === 'preview' ? (
            // ── PREVIEW ──────────────────────────────────────────
            <View style={styles.previewSection}>
              <Text style={styles.previewHint}>
                Found {parsed.length} event{parsed.length !== 1 ? 's' : ''}. Tap to toggle.
              </Text>
              {parsed.map((e, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.eventRow,
                    !checked[i] && styles.eventRowUnchecked,
                  ]}
                  onPress={() => {
                    const next = [...checked];
                    next[i] = !next[i];
                    setChecked(next);
                  }}
                >
                  <View style={[styles.checkCircle, checked[i] && styles.checkCircleActive]}>
                    {checked[i] && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <View style={styles.eventInfo}>
                    <View style={styles.eventTitleRow}>
                      <Text style={styles.eventTitle} numberOfLines={1}>
                        {e.event_title}
                      </Text>
                      <View style={[styles.confidenceBadge, { backgroundColor: confidenceBg(e.confidence) }]}>
                        <Text style={[styles.confidenceText, { color: confidenceColor(e.confidence) }]}>
                          {e.confidence}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.eventMeta}>
                      {[
                        e.date && `${e.date}${e.time ? ` · ${e.time}` : ''}`,
                        e.location && `📍 ${e.location}`,
                        e.child_name && `👤 ${e.child_name}`,
                      ].filter(Boolean).join('  ')}
                    </Text>
                    {e.required_actions.length > 0 && (
                      <Text style={styles.eventActions}>
                        {e.required_actions.map((a: string) => `• ${a}`).join('\n')}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}

              {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

              <TouchableOpacity onPress={reset} style={styles.startOverBtn}>
                <Text style={styles.startOverText}>Start over</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, (selectedCount === 0 || saving) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={selectedCount === 0 || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    Save {selectedCount} event{selectedCount !== 1 ? 's' : ''}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            // ── INPUT ────────────────────────────────────────────
            <View style={styles.inputSection}>
              {/* Segment control */}
              <View style={styles.segmentControl}>
                <TouchableOpacity
                  style={[styles.segment, segment === 'text' && styles.segmentActive]}
                  onPress={() => setSegment('text')}
                >
                  <Text style={[styles.segmentText, segment === 'text' && styles.segmentTextActive]}>
                    Text
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segment, segment === 'image' && styles.segmentActive]}
                  onPress={() => setSegment('image')}
                >
                  <Text style={[styles.segmentText, segment === 'image' && styles.segmentTextActive]}>
                    Photo
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segment, segment === 'camera' && styles.segmentActive]}
                  onPress={() => { setSegment('camera'); takePhoto(); }}
                >
                  <Text style={[styles.segmentText, segment === 'camera' && styles.segmentTextActive]}>
                    Camera
                  </Text>
                </TouchableOpacity>
              </View>

              {segment === 'text' ? (
                <TextInput
                  style={styles.textInput}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Paste an email, flyer text, or describe an event…"
                  placeholderTextColor="#636366"
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                />
              ) : (
                <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
                  {imageUri ? (
                    <>
                      <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
                      <View style={styles.imageChangeOverlay}>
                        <Ionicons name="camera-outline" size={18} color="#fff" />
                        <Text style={styles.imageChangeText}>Change</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={40} color="#636366" />
                      <Text style={styles.imagePickerText}>Choose from library</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {(state === 'error') && <Text style={styles.error}>{errorMsg}</Text>}

              <TouchableOpacity
                style={[
                  styles.extractBtn,
                  (state === 'processing' || (segment === 'text' ? !inputText.trim() : !imageBase64)) && styles.extractBtnDisabled,
                ]}
                onPress={handleExtract}
                disabled={state === 'processing' || (segment === 'text' ? !inputText.trim() : !imageBase64)}
              >
                {state === 'processing' ? (
                  <View style={styles.extractBtnInner}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.extractBtnText}>Extracting…</Text>
                  </View>
                ) : (
                  <View style={styles.extractBtnInner}>
                    <Ionicons name="sparkles-outline" size={18} color="#fff" />
                    <Text style={styles.extractBtnText}>Extract with AI</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 2,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  // Input section
  inputSection: {
    gap: 16,
  },
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: '#2C2C2E',
  },
  segmentText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  textInput: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 15,
    minHeight: 140,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    textAlignVertical: 'top',
  },
  imagePicker: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imagePickerText: {
    color: '#8E8E93',
    fontSize: 15,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  imageChangeOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  imageChangeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  error: {
    color: '#EF4444',
    fontSize: 13,
  },
  extractBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  extractBtnDisabled: {
    opacity: 0.4,
  },
  extractBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  extractBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Preview section
  previewSection: {
    gap: 12,
  },
  previewHint: {
    color: '#8E8E93',
    fontSize: 14,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  eventRowUnchecked: {
    opacity: 0.45,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#636366',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkCircleActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  eventInfo: {
    flex: 1,
    gap: 3,
  },
  eventTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  eventTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  confidenceBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  eventMeta: {
    color: '#8E8E93',
    fontSize: 12,
    lineHeight: 18,
  },
  eventActions: {
    color: '#F59E0B',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  startOverBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  startOverText: {
    color: '#8E8E93',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  saveBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

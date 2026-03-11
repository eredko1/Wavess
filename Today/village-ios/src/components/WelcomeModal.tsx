import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export default function WelcomeModal({ visible, onDismiss }: Props) {
  const router = useRouter();

  function handleAddChild() {
    onDismiss();
    router.push('/(tabs)/children');
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="home" size={32} color="#6366F1" />
          </View>
          <Text style={styles.headline}>Welcome to Village! 🎉</Text>
          <Text style={styles.subtitle}>
            {"Let's set up your family. Add your first child to get personalized activity ideas and event reminders."}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleAddChild} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Add a Child</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.skipBtnText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  headline: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  subtitle: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  primaryBtn: {
    backgroundColor: '#6366F1',
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 12,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  skipBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  skipBtnText: {
    color: '#636366',
    fontSize: 15,
    fontWeight: '500',
  },
});

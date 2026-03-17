import { View, ActivityIndicator, StyleSheet } from 'react-native';

// This screen exists only to give Expo Router a valid route for
// village://auth-callback deep links. The actual code exchange happens
// in _layout.tsx's Linking listener, which is mounted before this screen.
export default function AuthCallback() {
  return (
    <View style={styles.root}>
      <ActivityIndicator color="#818CF8" size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
});

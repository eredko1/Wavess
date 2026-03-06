import { Redirect } from 'expo-router';

// Root index — always send unauthenticated users to the sign-in screen.
// _layout.tsx will redirect to /(tabs) once a session exists.
export default function RootIndex() {
  return <Redirect href="/(auth)" />;
}

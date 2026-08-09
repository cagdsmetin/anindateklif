import { Stack } from 'expo-router';

export default function SetupLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0B1220' },
        animation: 'slide_from_right',
      }}
    />
  );
}

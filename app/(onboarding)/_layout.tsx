import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#0A0A0F' },
      }}
    >
      <Stack.Screen name="kyc-intro" />
      <Stack.Screen name="kyc-document" />
      <Stack.Screen name="kyc-selfie" />
      <Stack.Screen name="kyc-processing" />
      <Stack.Screen name="kyc-result" />
    </Stack>
  );
}
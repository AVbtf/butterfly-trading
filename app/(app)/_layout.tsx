import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Tabs, router } from 'expo-router';
import { kycService } from '../../services/kyc';
import { accountService } from '../../services/account';

export default function AppLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function gate() {
      try {
        const status = await kycService.getStatus();
        if (cancelled) return;

        if (status !== 'approved') {
          router.replace('/(onboarding)/kyc-intro');
          return;
        }

        const accounts = await accountService.getAccounts();
        if (cancelled) return;

        if (accounts.length === 0) {
          router.replace('/(onboarding)/account-type');
          return;
        }

        setReady(true);
      } catch {
        if (!cancelled) router.replace('/(onboarding)/kyc-intro');
      }
    }

    gate();
    return () => { cancelled = true; };
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#7C6FFF" />
      </View>
    );
  }

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

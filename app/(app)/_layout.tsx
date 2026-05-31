import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

export default function AppLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function gate() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: userData } = await supabase
          .from('users')
          .select('kyc_status')
          .eq('user_id', session.user.id)
          .single();
        if (cancelled) return;

        if (userData?.kyc_status !== 'approved') {
          router.replace('/(onboarding)/kyc-intro');
          return;
        }

        const { data: accountData } = await supabase
          .from('accounts')
          .select('account_id')
          .eq('user_id', session.user.id)
          .limit(1);
        if (cancelled) return;

        if (!accountData || accountData.length === 0) {
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
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A0A0F',
          borderTopColor: 'rgba(255,255,255,0.06)',
        },
        tabBarActiveTintColor: '#7C6FFF',
        tabBarInactiveTintColor: '#9B9BB4',
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Invest',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="leaf-outline" size={size} color={color} />
          ),
        }}
      />
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
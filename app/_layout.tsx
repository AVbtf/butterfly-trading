import { useEffect, useState } from 'react'
import { Stack, router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { Session } from '@supabase/supabase-js'

type KycStatus = 'pending' | 'in_review' | 'approved' | 'rejected'

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [initialized, setInitialized] = useState(false)

  async function routeByKycStatus(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('kyc_status')
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      router.replace('/(onboarding)/kyc-intro')
      return
    }

    const status = data.kyc_status as KycStatus

    if (status === 'approved') {
      router.replace('/(app)/home')
    } else {
      router.replace('/(onboarding)/kyc-intro')
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setInitialized(true)
      if (session?.user) {
        routeByKycStatus(session.user.id)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (session?.user) {
          routeByKycStatus(session.user.id)
        } else {
          router.replace('/(auth)/login')
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  if (!initialized) return null

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)/login" />
      <Stack.Screen name="(auth)/register" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="(onboarding)" />
    </Stack>
  )
}
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { privacyPolicyUrl } from '@/constants/legal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { openExternalUrl } from '@/lib/open-url';

export function VerifyEmail({ email, onRefresh }: { email: string; onRefresh: () => void }) {
  const [message, setMessage] = useState('Open the verification email, then come back and tap I have verified.');
  const [busy, setBusy] = useState(false);

  const reloadUser = useCallback(async () => {
    const { getProjectAuth } = await import('@/lib/firebase-auth');
    const user = getProjectAuth().currentUser;
    if (!user) {
      return;
    }
    await user.reload();
    onRefresh();
  }, [onRefresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void reloadUser();
      }
    });
    return () => subscription.remove();
  }, [reloadUser]);

  const resend = async () => {
    setBusy(true);
    try {
      const { getProjectAuth, sendEmailVerification } = await import('@/lib/firebase-auth');
      const user = getProjectAuth().currentUser;
      if (!user) {
        setMessage('Sign in again to resend the email.');
        return;
      }
      await sendEmailVerification(user);
      setMessage('Verification email sent. Check your inbox and spam folder.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the verification email.');
    } finally {
      setBusy(false);
    }
  };

  const confirmed = async () => {
    setBusy(true);
    try {
      await reloadUser();
      const { getProjectAuth } = await import('@/lib/firebase-auth');
      if (!getProjectAuth().currentUser?.emailVerified) {
        setMessage('That email is not verified yet. Open the link in the message, then try again.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not refresh your account.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const { getProjectAuth, signOut } = await import('@/lib/firebase-auth');
    await signOut(getProjectAuth());
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.content}>
          <ThemedText type="small" themeColor="textSecondary">
            BuildThread
          </ThemedText>
          <ThemedText style={styles.title}>Verify your email</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {email ? `We sent a link to ${email}.` : 'Confirm your email before using BuildThread.'} Evidence is tied to
            this account, so an unverified address cannot file photos.
          </ThemedText>
          <Text style={styles.message}>{message}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void confirmed()}
            style={[styles.primary, busy && styles.disabled]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
            <Text style={styles.primaryLabel}>I have verified</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void resend()} style={styles.secondary}>
            <Text style={styles.secondaryLabel}>Resend email</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.secondary}>
            <Text style={styles.secondaryLabel}>Sign out</Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => void openExternalUrl(privacyPolicyUrl())}>
            <Text style={styles.link}>Privacy policy</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
  message: { color: '#344054', fontSize: 15, lineHeight: 22 },
  primary: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#208AEF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  primaryLabel: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { color: '#208AEF', fontSize: 16, fontWeight: '700' },
  link: { color: '#208AEF', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.55 },
});

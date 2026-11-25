import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { privacyPolicyUrl } from '@/constants/legal';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openExternalUrl } from '@/lib/open-url';
import { passwordIssue } from '@/lib/password';

function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code.includes('invalid-email')) {
    return 'Enter a valid email address.';
  }
  if (code.includes('email-already-in-use')) {
    return 'That email is already in use. Sign in instead.';
  }
  if (code.includes('weak-password')) {
    return 'Use at least 10 characters, with a letter and a number.';
  }
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'Email or password is incorrect.';
  }
  if (code.includes('too-many-requests')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  if (code.includes('operation-not-allowed')) {
    return 'Email sign-in is not enabled in Firebase Authentication yet.';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Could not sign in. Try again.';
}

export default function LoginScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<'sign-in' | 'create'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password || isSubmitting) {
      setErrorMessage(!trimmedEmail ? 'Enter your email address.' : 'Enter your password.');
      return;
    }
    if (mode === 'create') {
      const issue = passwordIssue(password);
      if (issue) {
        setErrorMessage(issue);
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const { createUserWithEmailAndPassword, getProjectAuth, signInWithEmailAndPassword } = await import(
        '@/lib/firebase-auth'
      );
      const auth = getProjectAuth();
      if (mode === 'create') {
        const { sendEmailVerification } = await import('@/lib/firebase-auth');
        const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        await sendEmailVerification(credential.user);
      } else {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      }
    } catch (error) {
      setErrorMessage(authErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.content}>
            <ThemedText type="small" themeColor="textSecondary">
              BuildThread
            </ThemedText>
            <ThemedText style={styles.title}>{mode === 'create' ? 'Create account' : 'Sign in'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Use the email and password for this BuildThread account.
            </ThemedText>

            <View style={[styles.toggle, { backgroundColor: theme.backgroundElement }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'sign-in' }}
                onPress={() => {
                  setMode('sign-in');
                  setErrorMessage('');
                }}
                style={[styles.toggleItem, mode === 'sign-in' && styles.toggleItemSelected]}>
                <Text style={[styles.toggleLabel, mode === 'sign-in' && styles.toggleLabelSelected]}>Sign In</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'create' }}
                onPress={() => {
                  setMode('create');
                  setErrorMessage('');
                }}
                style={[styles.toggleItem, mode === 'create' && styles.toggleItemSelected]}>
                <Text style={[styles.toggleLabel, mode === 'create' && styles.toggleLabelSelected]}>Create Account</Text>
              </Pressable>
            </View>

            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
            />
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

            <Pressable accessibilityRole="link" onPress={() => void openExternalUrl(privacyPolicyUrl())}>
              <Text style={styles.privacy}>Privacy policy</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isSubmitting }}
              disabled={isSubmitting}
              onPress={() => void submit()}
              style={[styles.submit, isSubmitting && styles.submitDisabled]}>
              {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text style={styles.submitLabel}>
                {isSubmitting ? 'Please wait' : mode === 'create' ? 'Create Account' : 'Sign In'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
  },
  toggle: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  toggleItem: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleItemSelected: {
    backgroundColor: '#208AEF',
  },
  toggleLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: '#60646C',
  },
  toggleLabelSelected: {
    color: '#FFFFFF',
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  error: {
    color: '#B42318',
    fontSize: 14,
    lineHeight: 20,
  },
  privacy: {
    color: '#208AEF',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  submit: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#208AEF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  submitDisabled: {
    opacity: 0.55,
  },
  submitLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
});

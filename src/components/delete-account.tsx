import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function DeleteAccountButton() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const removeAccount = async () => {
    if (confirmation.trim().toUpperCase() !== 'DELETE') {
      setError('Type DELETE to confirm.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { deleteSignedInAccount } = await import('@/lib/delete-account');
      await deleteSignedInAccount(password);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'Could not delete this account.');
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          Alert.alert(
            'Delete this account?',
            'This removes your sign-in, projects, photos, and company profile. Evidence cannot be recovered.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Continue', style: 'destructive', onPress: () => setOpen(true) },
            ],
          )
        }
        style={styles.delete}>
        <Text style={styles.deleteLabel}>Delete account</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={[styles.title, { color: theme.text }]}>Confirm account deletion</Text>
      <Text style={styles.copy}>
        Enter your password and type DELETE. BuildThread then removes the Authentication user, Firestore records, and stored photos.
      </Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Password"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.background }]}
      />
      <TextInput
        value={confirmation}
        onChangeText={setConfirmation}
        autoCapitalize="characters"
        placeholder="Type DELETE"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.background }]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void removeAccount()}
        style={[styles.confirm, busy && styles.disabled]}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
        <Text style={styles.confirmLabel}>{busy ? 'Deleting' : 'Delete account permanently'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => setOpen(false)} style={styles.cancel}>
        <Text style={[styles.cancelLabel, { color: theme.text }]}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  delete: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteLabel: { color: '#B42318', fontSize: 16, fontWeight: '700' },
  panel: { gap: Spacing.two, paddingTop: Spacing.two },
  title: { fontSize: 18, fontWeight: '700' },
  copy: { color: '#667085', fontSize: 14, lineHeight: 20 },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  error: { color: '#B42318', fontSize: 14, lineHeight: 20 },
  confirm: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#B42318',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  confirmLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelLabel: { fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.55 },
});

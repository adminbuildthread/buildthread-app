import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function saveErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code.includes('permission-denied') || code.includes('unauthorized')) {
    return 'Firebase blocked this change. Allow this signed-in user to update their projects.';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Could not update this project.';
}

export default function EditProjectScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = firstParam(idParam);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [jobReference, setJobReference] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let active = true;

    const loadProject = async () => {
      try {
        const [{ doc, getDoc }, { getDb }] = await Promise.all([
          import('@/lib/firestore'),
          import('@/lib/firebase'),
        ]);
        const snapshot = await getDoc(doc(getDb(), 'projects', id));
        if (!active) {
          return;
        }
        if (!snapshot.exists()) {
          setLoadError('This project could not be found.');
          return;
        }
        const data = snapshot.data();
        setName(readText(data.name));
        setClientName(readText(data.clientName));
        setSiteAddress(readText(data.siteAddress));
        setJobReference(readText(data.jobReference));
        setStartDate(readText(data.startDate));
        setEndDate(readText(data.endDate));
        setNotes(readText(data.notes));
      } catch (error) {
        if (!active) {
          return;
        }
        setLoadError(saveErrorMessage(error));
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    if (id) {
      void loadProject();
    } else {
      setLoadError('This project could not be found.');
      setIsLoading(false);
    }

    return () => {
      active = false;
    };
  }, [id]);

  const saveChanges = async () => {
    const projectName = name.trim();
    if (!projectName || isSaving || isDeleting) {
      if (!projectName) {
        Alert.alert('Project name needed', 'Enter a project name before saving.');
      }
      return;
    }

    setIsSaving(true);
    try {
      const [{ doc, updateDoc }, { getDb }] = await Promise.all([
        import('@/lib/firestore'),
        import('@/lib/firebase'),
      ]);
      await updateDoc(doc(getDb(), 'projects', id), {
        name: projectName,
        clientName: clientName.trim(),
        siteAddress: siteAddress.trim(),
        jobReference: jobReference.trim(),
        startDate: startDate.trim(),
        endDate: endDate.trim(),
        notes: notes.trim(),
      });
      const { writeAudit } = await import('@/lib/audit');
      await writeAudit({
        projectId: id,
        action: 'project_updated',
        summary: 'Project details updated.',
      });
      router.back();
    } catch (error) {
      Alert.alert('Could not save project', saveErrorMessage(error));
      setIsSaving(false);
    }
  };

  const archiveProject = async () => {
    if (isDeleting || isSaving) {
      return;
    }
    setIsDeleting(true);
    try {
      const { archiveProject: archive } = await import('@/lib/project-actions');
      await archive(id);
      router.replace('/' as '/(tabs)/index');
    } catch (error) {
      Alert.alert('Could not archive project', saveErrorMessage(error));
      setIsDeleting(false);
    }
  };

  const confirmArchive = () => {
    Alert.alert('Archive this project?', 'The project leaves your active list. Photos, hashes, and the audit log stay on the record.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => void archiveProject() },
    ]);
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color="#208AEF" />
            </View>
          ) : loadError ? (
            <View style={styles.loading}>
              <ThemedText>{loadError}</ThemedText>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
              <Field label="Project Name" value={name} onChangeText={setName} placeholder="Project name" />
              <Field
                label="Client / Agent Name"
                value={clientName}
                onChangeText={setClientName}
                placeholder="Optional"
              />
              <Field
                label="Site Address / Postcode"
                value={siteAddress}
                onChangeText={setSiteAddress}
                placeholder="Optional"
              />
              <Field
                label="Job Reference"
                value={jobReference}
                onChangeText={setJobReference}
                placeholder="e.g. JOB-001"
                autoCapitalize="characters"
              />
              <Field
                label="Start Date"
                value={startDate}
                onChangeText={setStartDate}
                placeholder="DD/MM/YYYY"
                autoCorrect={false}
              />
              <Field
                label="End Date"
                value={endDate}
                onChangeText={setEndDate}
                placeholder="Leave blank if not set"
                autoCorrect={false}
              />
              <Field
                label="Scope of Works / Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional"
                multiline
              />

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isSaving || isDeleting }}
                disabled={isSaving || isDeleting}
                onPress={() => void saveChanges()}
                style={[styles.submit, (isSaving || isDeleting) && styles.submitDisabled]}>
                {isSaving ? <ActivityIndicator color="#FFFFFF" /> : null}
                <Text style={styles.submitLabel}>{isSaving ? 'Saving' : 'Save Changes'}</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isSaving || isDeleting }}
                disabled={isSaving || isDeleting}
                onPress={confirmArchive}
                style={styles.deleteButton}>
                {isDeleting ? <ActivityIndicator color="#B42318" /> : null}
                <Text style={styles.deleteLabel}>{isDeleting ? 'Archiving' : 'Archive Project'}</Text>
              </Pressable>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Field({
  label,
  multiline = false,
  ...inputProps
}: {
  label: string;
  multiline?: boolean;
} & ComponentProps<typeof TextInput>) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          multiline && styles.notes,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: theme.backgroundSelected,
          },
        ]}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  notes: {
    minHeight: 120,
    paddingTop: Spacing.three,
  },
  submit: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#208AEF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
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
  deleteButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  deleteLabel: {
    color: '#B42318',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
});

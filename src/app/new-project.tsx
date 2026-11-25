import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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

type ProjectMode = 'compliance' | 'quick';

function todayUkDate(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date());
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const year = parts.find((part) => part.type === 'year')?.value ?? '2026';
  return `${day}/${month}/${year}`;
}

function saveErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code.includes('permission-denied') || code.includes('unauthorized')) {
    return 'Firebase blocked this project. Allow writes to the projects collection in your security rules.';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Could not create this project.';
}

export default function NewProjectScreen() {
  const theme = useTheme();
  const [projectMode, setProjectMode] = useState<ProjectMode>('compliance');
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [jobReference, setJobReference] = useState('');
  const [startDate, setStartDate] = useState(todayUkDate);
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const scrollRef = useRef<{ scrollTo: (options: { y: number; animated?: boolean }) => void } | null>(null);
  const notesOffset = useRef(0);
  const notesFocused = useRef(false);

  const revealNotes = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, notesOffset.current - Spacing.three), animated: true });
    }, 80);
  };

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboardInset(Math.max(0, event.endCoordinates.height - Spacing.four));
      if (notesFocused.current) {
        setTimeout(() => {
          scrollRef.current?.scrollTo({ y: Math.max(0, notesOffset.current - Spacing.three), animated: true });
        }, 160);
      }
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const createProject = async () => {
    const projectName = name.trim();
    if (!projectName || isSaving) {
      if (!projectName) {
        Alert.alert('Project name needed', 'Enter a project name before creating it.');
      }
      return;
    }

    setIsSaving(true);
    try {
      const [{ saveNewProject }, { requireUserId }] = await Promise.all([
        import('@/lib/create-project'),
        import('@/lib/firebase-auth'),
      ]);
      const docRef = await saveNewProject({
        name: projectName,
        clientName,
        siteAddress,
        jobReference,
        startDate,
        endDate,
        notes,
        projectMode,
        userId: requireUserId(),
      });
      router.replace({ pathname: '/project/[id]', params: { id: docRef.id, name: projectName } });
    } catch (error) {
      Alert.alert('Could not create project', saveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={(node) => {
              scrollRef.current = node;
            }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Spacing.six + (Platform.OS === 'android' ? keyboardInset : 0) },
            ]}>
            <View style={styles.modes}>
              <ModeCard
                title="Compliance Job"
                subtitle="GPS & timestamp verified"
                selected={projectMode === 'compliance'}
                onPress={() => setProjectMode('compliance')}
              />
              <ModeCard
                title="Quick Log"
                subtitle="Manual dates, no GPS required"
                selected={projectMode === 'quick'}
                onPress={() => setProjectMode('quick')}
              />
            </View>

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
              label="End Date (optional)"
              value={endDate}
              onChangeText={setEndDate}
              placeholder="Leave blank if not set"
              autoCorrect={false}
            />
            <View
              onLayout={(event) => {
                notesOffset.current = event.nativeEvent.layout.y;
              }}>
              <Field
                label="Scope of Works / Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional"
                multiline
                onFocus={() => {
                  notesFocused.current = true;
                  revealNotes();
                }}
                onBlur={() => {
                  notesFocused.current = false;
                }}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaving }}
              disabled={isSaving}
              onPress={createProject}
              style={[styles.submit, isSaving && styles.submitDisabled]}>
              {isSaving ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text style={styles.submitLabel}>{isSaving ? 'Creating' : 'Create Project'}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ModeCard({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.modeCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: selected ? '#208AEF' : theme.backgroundSelected,
        },
      ]}>
      <ThemedText style={styles.modeTitle}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {subtitle}
      </ThemedText>
    </Pressable>
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
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  modes: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  modeCard: {
    flex: 1,
    minHeight: 108,
    borderRadius: 18,
    borderWidth: 2,
    padding: Spacing.three,
    gap: Spacing.one,
    justifyContent: 'center',
  },
  modeTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
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
});

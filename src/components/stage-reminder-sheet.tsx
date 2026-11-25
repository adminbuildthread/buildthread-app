import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const PRESETS = [
  { label: 'In 30 mins', minutes: 30 },
  { label: 'In 1 hour', minutes: 60 },
  { label: 'In 2 hours', minutes: 120 },
] as const;

export function StageReminderSheet({
  visible,
  stageLabel,
  locationName,
  scheduledLabel,
  onClose,
  onPick,
  onCancelReminder,
}: {
  visible: boolean;
  stageLabel: string;
  locationName: string;
  scheduledLabel: string | null;
  onClose: () => void;
  onPick: (date: Date) => void;
  onCancelReminder: () => void;
}) {
  const theme = useTheme();
  const visibleRef = useRef(visible);
  const [draft, setDraft] = useState(() => new Date(Date.now() + 60 * 60 * 1000));
  const [androidStep, setAndroidStep] = useState<'date' | 'time' | null>(null);
  const [showIosClock, setShowIosClock] = useState(false);

  visibleRef.current = visible;

  useEffect(() => {
    if (!visible) {
      setAndroidStep(null);
      setShowIosClock(false);
      return;
    }
    setDraft(new Date(Date.now() + 60 * 60 * 1000));
  }, [visible]);

  const choose = (date: Date) => {
    if (date.getTime() <= Date.now()) {
      Alert.alert('Choose a later time', 'That time has already passed.');
      return;
    }
    onPick(date);
  };

  const openCustom = () => {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    setDraft(start);
    if (Platform.OS === 'android') {
      setAndroidStep('date');
      return;
    }
    setShowIosClock(true);
  };

  return (
    <>
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close reminder" onPress={onClose} style={styles.backdrop} />
      <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.text }]}>Set Reminder</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {stageLabel} photo for {locationName}
        </Text>
        {scheduledLabel ? (
          <Text style={styles.scheduled}>Scheduled for {scheduledLabel}</Text>
        ) : null}
        {PRESETS.map((preset) => (
          <Pressable
            key={preset.label}
            accessibilityRole="button"
            onPress={() => choose(new Date(Date.now() + preset.minutes * 60 * 1000))}
            style={[styles.option, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.optionLabel, { color: theme.text }]}>{preset.label}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={openCustom}
          style={[styles.option, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.optionLabel, { color: theme.text }]}>Custom Date & Time</Text>
        </Pressable>
        {showIosClock && Platform.OS === 'ios' ? (
          <View>
            <DateTimePicker
              value={draft}
              mode="datetime"
              display="spinner"
              minimumDate={new Date()}
              onChange={(_event, date) => {
                if (date) {
                  setDraft(date);
                }
              }}
            />
            <Pressable accessibilityRole="button" onPress={() => choose(draft)} style={styles.confirm}>
              <Text style={styles.confirmLabel}>Set this time</Text>
            </Pressable>
          </View>
        ) : null}
        {scheduledLabel ? (
          <Pressable accessibilityRole="button" onPress={onCancelReminder} style={styles.cancelReminder}>
            <Text style={styles.cancelReminderLabel}>Cancel Reminder</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
          <Text style={[styles.closeLabel, { color: theme.textSecondary }]}>Close</Text>
        </Pressable>
      </SafeAreaView>
      </View>
    </Modal>
      {androidStep ? (
        <DateTimePicker
          value={draft}
          mode={androidStep}
          minimumDate={androidStep === 'date' ? new Date() : undefined}
          onChange={(event, date) => {
            if (event.type === 'dismissed' || !date) {
              setAndroidStep(null);
              return;
            }
            if (androidStep === 'date') {
              const next = new Date(draft);
              next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
              setDraft(next);
              setAndroidStep(null);
              setTimeout(() => {
                if (visibleRef.current) {
                  setAndroidStep('time');
                }
              }, 50);
              return;
            }
            const combined = new Date(draft);
            combined.setHours(date.getHours(), date.getMinutes(), 0, 0);
            setAndroidStep(null);
            choose(combined);
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 20,
    marginBottom: Spacing.one,
  },
  scheduled: {
    color: '#B54708',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  option: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  optionLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  confirm: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  cancelReminder: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelReminderLabel: {
    color: '#B42318',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  close: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
});

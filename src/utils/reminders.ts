import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import { Platform, Vibration } from 'react-native';

const STORAGE_KEY = '@buildthread_reminders';
const CHANNEL_ID = 'compliance-alarms-v2';
const OLD_CHANNEL_IDS = ['compliance-reminders', 'compliance-alarms'];
const BUZZ = [0, 650, 250, 650, 250, 650];
const alarmSound = require('../../assets/sounds/compliance-alarm.wav');

export type ReminderStage = 'during' | 'after';

export type StageReminder = {
  notificationId: string;
  triggerAt: number;
  projectId: string;
  locationId: string;
  projectName: string;
  locationName: string;
  stage: ReminderStage;
};

type ReminderListener = (items: StageReminder[]) => void;

const listeners = new Set<ReminderListener>();
let cache: StageReminder[] | null = null;
let configured = false;
let channelReady = false;
let alarmPlayer: AudioPlayer | null = null;

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  Notifications.addNotificationReceivedListener((notification) => {
    if (notification.request.content.title === 'Compliance Photo Due') {
      void soundAlarm();
    }
  });
}

async function soundAlarm(): Promise<void> {
  Vibration.vibrate(BUZZ);
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
    alarmPlayer?.pause();
    alarmPlayer?.release();
    alarmPlayer = createAudioPlayer(alarmSound);
    alarmPlayer.loop = false;
    alarmPlayer.volume = 1;
    alarmPlayer.play();
  } catch (error) {
    console.warn('Could not play the reminder alarm.', error);
  }
}

function slotKey(projectId: string, locationId: string, stage: ReminderStage): string {
  return `${projectId}_${locationId}_${stage}`;
}

function notify() {
  const items = cache ?? [];
  listeners.forEach((listener) => listener(items));
}

function readReminder(value: unknown): StageReminder | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const stage = record.stage === 'during' || record.stage === 'after' ? record.stage : null;
  if (
    typeof record.notificationId !== 'string' ||
    typeof record.triggerAt !== 'number' ||
    typeof record.projectId !== 'string' ||
    typeof record.locationId !== 'string' ||
    typeof record.projectName !== 'string' ||
    typeof record.locationName !== 'string' ||
    !stage
  ) {
    return null;
  }
  return {
    notificationId: record.notificationId,
    triggerAt: record.triggerAt,
    projectId: record.projectId,
    locationId: record.locationId,
    projectName: record.projectName,
    locationName: record.locationName,
    stage,
  };
}

async function loadReminders(): Promise<StageReminder[]> {
  if (cache) {
    return cache;
  }
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    cache = [];
    return cache;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    cache = Array.isArray(parsed) ? parsed.flatMap((item) => {
      const reminder = readReminder(item);
      return reminder ? [reminder] : [];
    }) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function saveReminders(items: StageReminder[]): Promise<void> {
  cache = items;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  notify();
}

async function ensureChannel(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  if (configured) {
    return channelReady;
  }
  configured = true;
  try {
    await Promise.all(OLD_CHANNEL_IDS.map((channelId) => Notifications.deleteNotificationChannelAsync(channelId).catch(() => undefined)));
    await Notifications.deleteNotificationChannelAsync(CHANNEL_ID).catch(() => undefined);
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Compliance reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: BUZZ,
      enableVibrate: true,
    });
    channelReady = true;
  } catch (error) {
    console.warn('Compliance reminder channel could not be created.', error);
    channelReady = false;
  }
  return channelReady;
}

export async function getReminders(): Promise<StageReminder[]> {
  return loadReminders();
}

export function subscribeReminders(listener: ReminderListener): () => void {
  listeners.add(listener);
  listener(cache ?? []);
  let active = true;
  void loadReminders().then((items) => {
    if (active) {
      listener(items);
    }
  });
  return () => {
    active = false;
    listeners.delete(listener);
  };
}

export function subscribeReminderOpens(onOpen: (projectId: string) => void): () => void {
  if (Platform.OS === 'web') {
    return () => {};
  }
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const projectId = response.notification.request.content.data?.projectId;
    if (typeof projectId === 'string' && projectId) {
      onOpen(projectId);
    }
  });
  return () => subscription.remove();
}

export async function scheduleStageReminder({
  projectId,
  projectName,
  locationId,
  locationName,
  stage,
  triggerDate,
}: {
  projectId: string;
  projectName: string;
  locationId: string;
  locationName: string;
  stage: ReminderStage;
  triggerDate: Date;
}): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Reminders are available on the phone.');
  }
  if (triggerDate.getTime() <= Date.now()) {
    throw new Error('Choose a time in the future.');
  }
  const channelReady = await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    status = (
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true },
      })
    ).status;
  }
  if (status !== 'granted') {
    throw new Error('Allow notifications to set a reminder.');
  }
  await cancelStageReminder(projectId, locationId, stage);
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Compliance Photo Due',
      body: `Take the ${stage} photo for ${locationName} (${projectName})`,
      sound: true,
      vibrate: BUZZ,
      data: { projectId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      ...(channelReady ? { channelId: CHANNEL_ID } : {}),
    },
  });
  const items = await loadReminders();
  const key = slotKey(projectId, locationId, stage);
  await saveReminders([
    ...items.filter((item) => slotKey(item.projectId, item.locationId, item.stage) !== key),
    {
      notificationId,
      triggerAt: triggerDate.getTime(),
      projectId,
      locationId,
      projectName,
      locationName,
      stage,
    },
  ]);
}

export async function cancelStageReminder(projectId: string, locationId: string, stage: ReminderStage): Promise<void> {
  const items = await loadReminders();
  const key = slotKey(projectId, locationId, stage);
  const existing = items.find((item) => slotKey(item.projectId, item.locationId, item.stage) === key);
  if (!existing) {
    return;
  }
  if (Platform.OS !== 'web') {
    await Notifications.cancelScheduledNotificationAsync(existing.notificationId).catch(() => undefined);
  }
  await saveReminders(items.filter((item) => slotKey(item.projectId, item.locationId, item.stage) !== key));
}

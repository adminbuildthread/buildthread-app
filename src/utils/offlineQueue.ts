import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { decodeBase64, uploadJpeg } from '@/lib/upload-jpeg';

const QUEUE_KEY = '@buildthread_offline_queue';

export type QueuedPhoto = {
  id: string;
  userId: string;
  projectId: string;
  locationId: string;
  stage: 'before' | 'during' | 'after';
  localUri: string;
  capturedAt: string;
  location: { latitude: number; longitude: number } | null;
  note?: string;
};

type QueueListener = (items: QueuedPhoto[]) => void;
type SyncListener = (syncing: boolean) => void;

const listeners = new Set<QueueListener>();
const syncListeners = new Set<SyncListener>();
let isSyncing = false;
let lastSyncStarted = 0;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Could not upload this photo.')), milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function notify(items: QueuedPhoto[]) {
  const snapshot = items.slice();
  listeners.forEach((listener) => listener(snapshot));
}

function notifySync(syncing: boolean) {
  syncListeners.forEach((listener) => listener(syncing));
}

function offlineDirectory(): Directory {
  const directory = new Directory(Paths.document, 'offline-photos');
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

async function readQueue(): Promise<QueuedPhoto[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedPhoto[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedPhoto[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  notify(items);
}

export function subscribeOfflineQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  void readQueue().then(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeSyncState(listener: SyncListener): () => void {
  syncListeners.add(listener);
  listener(isSyncing);
  return () => {
    syncListeners.delete(listener);
  };
}

export async function getQueuedPhotos(projectId?: string): Promise<QueuedPhoto[]> {
  const items = await readQueue();
  return projectId ? items.filter((item) => item.projectId === projectId) : items;
}

export async function enqueuePhoto(item: QueuedPhoto): Promise<QueuedPhoto> {
  const source = new File(item.localUri);
  const destination = new File(offlineDirectory(), `${item.id}.jpg`);
  if (destination.exists) {
    destination.delete();
  }
  await source.copy(destination);
  const stored: QueuedPhoto = { ...item, localUri: destination.uri };
  const items = await readQueue();
  items.push(stored);
  await writeQueue(items);
  return stored;
}

export async function removeQueuedPhoto(id: string): Promise<void> {
  const items = await readQueue();
  const current = items.find((item) => item.id === id);
  if (current) {
    try {
      const file = new File(current.localUri);
      if (file.exists) {
        file.delete();
      }
    } catch {
      // The queue entry is still removed so a missing file cannot block sync.
    }
  }
  await writeQueue(items.filter((item) => item.id !== id));
}

async function uploadQueuedPhoto(item: QueuedPhoto): Promise<void> {
  const [{ getDb }, { getDownloadURL, getProjectStorage, ref }, { doc, updateDoc }, { requireIdToken }] =
    await Promise.all([
      import('@/lib/firebase'),
      import('@/lib/firebase-storage'),
      import('@/lib/firestore'),
      import('@/lib/firebase-auth'),
    ]);
  const bytes = decodeBase64(await withTimeout(new File(item.localUri).base64(), 15000));
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error('The saved photo could not be read as an image.');
  }
  const objectPath = `users/${item.userId}/projects/${item.projectId}/${item.locationId}-${item.stage}-${Date.now()}.jpg`;
  const storageRef = ref(getProjectStorage(), objectPath);
  await uploadJpeg(storageRef.bucket, objectPath, bytes, await requireIdToken());
  const downloadUrl = await getDownloadURL(storageRef);
  await updateDoc(doc(getDb(), 'projects', item.projectId, 'locations', item.locationId), {
    [item.stage]: {
      downloadUrl,
      capturedAt: item.capturedAt,
      location: item.location,
      note: item.note || '',
    },
  });
}

export async function syncOfflineQueue(options?: { force?: boolean }): Promise<void> {
  if (isSyncing) {
    return;
  }
  if (!options?.force && Date.now() - lastSyncStarted < 20000) {
    return;
  }
  lastSyncStarted = Date.now();
  isSyncing = true;
  notifySync(true);
  try {
    const NetInfo = await import('@react-native-community/netinfo');
    const connection = await NetInfo.fetch();
    if (!connection.isConnected || connection.isInternetReachable === false) {
      return;
    }
    const { getProjectAuth } = await import('@/lib/firebase-auth');
    const user = getProjectAuth().currentUser;
    if (!user) {
      return;
    }
    const items = (await readQueue()).filter((item) => item.userId === user.uid);
    for (const item of items) {
      try {
        await withTimeout(uploadQueuedPhoto(item), 30000);
        await removeQueuedPhoto(item.id);
      } catch {
        // Leave the photo queued so the next connection can retry it.
      }
    }
  } finally {
    isSyncing = false;
    notifySync(false);
  }
}

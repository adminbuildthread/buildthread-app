import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { commitEvidence, type EvidenceDraft } from '@/lib/commit-evidence';
import type { EvidenceSource, EvidenceStage } from '@/lib/evidence-record';
import { decodeBase64 } from '@/lib/upload-jpeg';

const QUEUE_KEY = '@buildthread_offline_queue';

export type QueuedPhoto = {
  id: string;
  evidenceId: string;
  userId: string;
  projectId: string;
  locationId: string;
  stage: EvidenceStage;
  originalUri: string;
  stampedUri: string;
  originalSha256: string;
  originalPath: string;
  stampedPath: string;
  deviceCapturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  note: string;
  source: EvidenceSource;
  product: string;
  batch: string;
  itemCode: string;
  jobReference: string;
  operativeUid: string;
  operativeName: string;
  correctionOf: string | null;
  syncError: string | null;
};

type QueueListener = (items: QueuedPhoto[]) => void;
type SyncListener = (syncing: boolean) => void;

const listeners = new Set<QueueListener>();
const syncListeners = new Set<SyncListener>();
let isSyncing = false;
let lastSyncStarted = 0;

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

function isQueuedPhoto(value: unknown): value is QueuedPhoto {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<QueuedPhoto>;
  return (
    typeof record.id === 'string' &&
    typeof record.evidenceId === 'string' &&
    typeof record.userId === 'string' &&
    typeof record.projectId === 'string' &&
    typeof record.originalUri === 'string' &&
    typeof record.stampedUri === 'string' &&
    typeof record.originalSha256 === 'string'
  );
}

async function readQueue(): Promise<QueuedPhoto[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isQueuedPhoto) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedPhoto[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  notify(items);
}

function copyIntoQueue(sourceUri: string, name: string): string {
  const source = new File(sourceUri);
  const destination = new File(offlineDirectory(), name);
  if (destination.exists) {
    destination.delete();
  }
  source.copy(destination);
  return destination.uri;
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
  const stored: QueuedPhoto = {
    ...item,
    originalUri: copyIntoQueue(item.originalUri, `${item.id}-original.jpg`),
    stampedUri: copyIntoQueue(item.stampedUri, `${item.id}-stamped.jpg`),
    syncError: null,
  };
  const items = await readQueue();
  items.push(stored);
  await writeQueue(items);
  return stored;
}

export async function updateQueuedPhotoNote(id: string, note: string): Promise<void> {
  const items = await readQueue();
  await writeQueue(items.map((item) => (item.id === id ? { ...item, note } : item)));
}

async function deleteQueuedFile(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // A missing file should not block the rest of the queue.
  }
}

export async function removeQueuedPhoto(id: string): Promise<void> {
  const items = await readQueue();
  const current = items.find((item) => item.id === id);
  if (current) {
    await deleteQueuedFile(current.originalUri);
    await deleteQueuedFile(current.stampedUri);
  }
  await writeQueue(items.filter((item) => item.id !== id));
}

export async function clearQueueForUser(userId: string): Promise<void> {
  const items = await readQueue();
  await Promise.all(items.filter((item) => item.userId === userId).map((item) => removeQueuedPhoto(item.id)));
}

async function readJpeg(uri: string): Promise<Uint8Array> {
  const bytes = decodeBase64(await new File(uri).base64());
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error('The saved photo could not be read as a JPEG.');
  }
  return bytes;
}

function draftFromQueue(item: QueuedPhoto, originalBytes: Uint8Array, stampedBytes: Uint8Array): EvidenceDraft {
  return {
    projectId: item.projectId,
    locationId: item.locationId,
    evidenceId: item.evidenceId,
    stage: item.stage,
    source: item.source,
    originalBytes,
    stampedBytes,
    originalSha256: item.originalSha256,
    originalPath: item.originalPath,
    stampedPath: item.stampedPath,
    deviceCapturedAt: item.deviceCapturedAt,
    latitude: item.latitude,
    longitude: item.longitude,
    accuracy: item.accuracy,
    note: item.note,
    product: item.product,
    batch: item.batch,
    itemCode: item.itemCode,
    jobReference: item.jobReference,
    operativeUid: item.operativeUid,
    operativeName: item.operativeName,
    correctionOf: item.correctionOf,
    driftMs: null,
  };
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
        const draft = draftFromQueue(item, await readJpeg(item.originalUri), await readJpeg(item.stampedUri));
        await commitEvidence(draft);
        await removeQueuedPhoto(item.id);
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : 'Could not sync this photo.';
        const latest = await readQueue();
        await writeQueue(latest.map((queued) => (queued.id === item.id ? { ...queued, syncError: message } : queued)));
      }
    }
  } finally {
    isSyncing = false;
    notifySync(false);
  }
}

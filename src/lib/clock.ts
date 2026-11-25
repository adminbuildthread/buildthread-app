import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { requireUserId } from '@/lib/firebase-auth';
import { getDb } from '@/lib/firebase';

export const CLOCK_DRIFT_LIMIT_MS = 5 * 60 * 1000;

export async function measureClockDrift(): Promise<number | null> {
  try {
    const uid = requireUserId();
    const settingsRef = doc(getDb(), 'settings', uid);
    const sentAt = Date.now();
    await setDoc(settingsRef, { clockProbe: serverTimestamp() }, { merge: true });
    const probe = (await getDoc(settingsRef)).get('clockProbe') as { toDate?: () => Date } | undefined;
    const serverMs = probe?.toDate?.().getTime();
    if (typeof serverMs !== 'number' || Number.isNaN(serverMs)) {
      return null;
    }
    return sentAt - serverMs;
  } catch {
    return null;
  }
}

export function clockDriftFlag(driftMs: number | null): boolean | null {
  if (driftMs == null) {
    return null;
  }
  return Math.abs(driftMs) > CLOCK_DRIFT_LIMIT_MS;
}

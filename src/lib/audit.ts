import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { requireUserId } from '@/lib/firebase-auth';
import { getDb } from '@/lib/firebase';

export async function writeAudit(entry: {
  projectId: string;
  action: string;
  summary: string;
  locationId?: string | null;
  evidenceId?: string | null;
  reason?: string | null;
}): Promise<void> {
  await addDoc(collection(getDb(), 'projects', entry.projectId, 'audit'), {
    action: entry.action,
    summary: entry.summary,
    actorUid: requireUserId(),
    at: serverTimestamp(),
    locationId: entry.locationId ?? null,
    evidenceId: entry.evidenceId ?? null,
    reason: entry.reason ?? null,
  });
}

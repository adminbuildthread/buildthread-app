import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { writeAudit } from '@/lib/audit';
import { clockDriftFlag, measureClockDrift } from '@/lib/clock';
import type { EvidenceRecord, EvidenceStage, EvidenceSource } from '@/lib/evidence-record';
import { getProjectAuth, requireIdToken, requireUserId } from '@/lib/firebase-auth';
import { getDb } from '@/lib/firebase';
import { getDownloadURL, getProjectStorage, ref } from '@/lib/firebase-storage';
import { uploadJpeg } from '@/lib/upload-jpeg';

export type EvidenceDraft = {
  projectId: string;
  locationId: string;
  evidenceId: string;
  stage: EvidenceStage;
  source: EvidenceSource;
  originalBytes: Uint8Array;
  stampedBytes: Uint8Array;
  originalSha256: string;
  originalPath: string;
  stampedPath: string;
  deviceCapturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  note: string;
  product: string;
  batch: string;
  itemCode: string;
  jobReference: string;
  operativeUid: string;
  operativeName: string;
  correctionOf: string | null;
  driftMs: number | null;
};

async function uploadAllowExisting(bucket: string, objectPath: string, bytes: Uint8Array, idToken: string) {
  try {
    await uploadJpeg(bucket, objectPath, bytes, idToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('409') || /already exists/i.test(message)) {
      return;
    }
    throw error;
  }
}

export async function readCaptureContext(projectId: string): Promise<{
  operativeUid: string;
  operativeName: string;
  jobReference: string;
}> {
  const uid = requireUserId();
  const email = getProjectAuth().currentUser?.email ?? '';
  const database = getDb();
  const [settingsSnap, projectSnap] = await Promise.all([
    getDoc(doc(database, 'settings', uid)),
    getDoc(doc(database, 'projects', projectId)),
  ]);
  const storedName = settingsSnap.get('operativeName');
  const jobReference = projectSnap.get('jobReference');
  return {
    operativeUid: uid,
    operativeName: typeof storedName === 'string' && storedName.trim() ? storedName.trim() : email || 'Operative',
    jobReference: typeof jobReference === 'string' ? jobReference.trim() : '',
  };
}

export async function commitEvidence(draft: EvidenceDraft): Promise<void> {
  const driftMs = draft.driftMs ?? (await measureClockDrift());
  const idToken = await requireIdToken();
  const storage = getProjectStorage();
  const originalRef = ref(storage, draft.originalPath);
  const stampedRef = ref(storage, draft.stampedPath);
  await uploadAllowExisting(originalRef.bucket, draft.originalPath, draft.originalBytes, idToken);
  await uploadAllowExisting(stampedRef.bucket, draft.stampedPath, draft.stampedBytes, idToken);
  const [originalUrl, stampedUrl] = await Promise.all([getDownloadURL(originalRef), getDownloadURL(stampedRef)]);
  const importedUnverified = draft.source === 'imported';
  await setDoc(doc(getDb(), 'projects', draft.projectId, 'evidence', draft.evidenceId), {
    locationId: draft.locationId,
    stage: draft.stage,
    source: draft.source,
    importedUnverified,
    originalUrl,
    stampedUrl,
    originalPath: draft.originalPath,
    stampedPath: draft.stampedPath,
    originalSha256: draft.originalSha256,
    deviceCapturedAt: draft.deviceCapturedAt,
    serverCapturedAt: serverTimestamp(),
    clockDriftMs: driftMs,
    clockDriftFlag: clockDriftFlag(driftMs),
    latitude: draft.latitude,
    longitude: draft.longitude,
    accuracy: draft.accuracy,
    operativeUid: draft.operativeUid,
    operativeName: draft.operativeName,
    note: draft.note,
    product: draft.product,
    batch: draft.batch,
    itemCode: draft.itemCode,
    jobReference: draft.jobReference,
    correctionOf: draft.correctionOf,
  });
  await writeAudit({
    projectId: draft.projectId,
    action: draft.correctionOf ? 'evidence_correction' : 'evidence_captured',
    summary: draft.correctionOf
      ? `Correction added for ${draft.stage} on item ${draft.itemCode || draft.locationId}.`
      : `${draft.stage} photo captured for item ${draft.itemCode || draft.locationId}.`,
    locationId: draft.locationId,
    evidenceId: draft.evidenceId,
  });
}

export async function commitNoteCorrection(record: EvidenceRecord, projectId: string, note: string): Promise<void> {
  const driftMs = await measureClockDrift();
  const evidenceId = `${record.id}-note-${Date.now().toString(36)}`;
  await setDoc(doc(getDb(), 'projects', projectId, 'evidence', evidenceId), {
    locationId: record.locationId,
    stage: record.stage,
    source: record.source,
    importedUnverified: record.importedUnverified,
    originalUrl: record.originalUrl,
    stampedUrl: record.stampedUrl,
    originalPath: record.originalPath,
    stampedPath: record.stampedPath,
    originalSha256: record.originalSha256,
    deviceCapturedAt: record.deviceCapturedAt,
    serverCapturedAt: serverTimestamp(),
    clockDriftMs: driftMs,
    clockDriftFlag: clockDriftFlag(driftMs),
    latitude: record.latitude,
    longitude: record.longitude,
    accuracy: record.accuracy,
    operativeUid: requireUserId(),
    operativeName: record.operativeName,
    note,
    product: record.product,
    batch: record.batch,
    itemCode: record.itemCode,
    jobReference: record.jobReference,
    correctionOf: record.id,
  });
  await writeAudit({
    projectId,
    action: 'evidence_note',
    summary: `Note correction on ${record.stage} for item ${record.itemCode || record.locationId}.`,
    locationId: record.locationId,
    evidenceId,
  });
}

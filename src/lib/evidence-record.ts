export type EvidenceStage = 'before' | 'during' | 'after';
export type EvidenceSource = 'camera' | 'imported';

export type EvidenceRecord = {
  id: string;
  locationId: string;
  stage: EvidenceStage;
  source: EvidenceSource;
  importedUnverified: boolean;
  originalUrl: string;
  stampedUrl: string;
  originalPath: string;
  stampedPath: string;
  originalSha256: string;
  deviceCapturedAt: string | null;
  serverCapturedAt: string | null;
  clockDriftMs: number | null;
  clockDriftFlag: boolean | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  operativeUid: string;
  operativeName: string;
  note: string;
  product: string;
  batch: string;
  itemCode: string;
  jobReference: string;
  correctionOf: string | null;
};

export function createEvidenceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function evidenceObjectPaths(userId: string, projectId: string, locationId: string, evidenceId: string) {
  const base = `users/${userId}/projects/${projectId}/locations/${locationId}/evidence/${evidenceId}`;
  return {
    originalPath: `${base}/original.jpg`,
    stampedPath: `${base}/stamped.jpg`,
  };
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readOptionalText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readTime(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return null;
}

export function readEvidence(id: string, value: unknown): EvidenceRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  const stage = data.stage === 'before' || data.stage === 'during' || data.stage === 'after' ? data.stage : null;
  const locationId = readText(data.locationId);
  const originalSha256 = readText(data.originalSha256);
  if (!stage || !locationId || !originalSha256) {
    return null;
  }
  const source = data.source === 'imported' ? 'imported' : 'camera';
  return {
    id,
    locationId,
    stage,
    source,
    importedUnverified: data.importedUnverified === true || source === 'imported',
    originalUrl: readText(data.originalUrl),
    stampedUrl: readText(data.stampedUrl),
    originalPath: readText(data.originalPath),
    stampedPath: readText(data.stampedPath),
    originalSha256,
    deviceCapturedAt: readTime(data.deviceCapturedAt),
    serverCapturedAt: readTime(data.serverCapturedAt),
    clockDriftMs: readNumber(data.clockDriftMs),
    clockDriftFlag: typeof data.clockDriftFlag === 'boolean' ? data.clockDriftFlag : null,
    latitude: readNumber(data.latitude),
    longitude: readNumber(data.longitude),
    accuracy: readNumber(data.accuracy),
    operativeUid: readText(data.operativeUid),
    operativeName: readText(data.operativeName),
    note: readText(data.note),
    product: readText(data.product),
    batch: readText(data.batch),
    itemCode: readText(data.itemCode),
    jobReference: readText(data.jobReference),
    correctionOf: readOptionalText(data.correctionOf),
  };
}

export function latestEvidenceFor(
  records: EvidenceRecord[],
  locationId: string,
  stage: EvidenceStage,
): EvidenceRecord | null {
  const matches = records.filter((record) => record.locationId === locationId && record.stage === stage);
  if (matches.length === 0) {
    return null;
  }
  return matches.reduce((latest, record) => {
    const latestTime = Date.parse(latest.serverCapturedAt ?? latest.deviceCapturedAt ?? '') || 0;
    const recordTime = Date.parse(record.serverCapturedAt ?? record.deviceCapturedAt ?? '') || 0;
    return recordTime >= latestTime ? record : latest;
  });
}

export type PendingCompliancePhoto = {
  locationId: string;
  locationName: string;
  currentStage: 'before' | 'during';
  nextStage: 'during' | 'after';
  thumbnailUrl: string;
  capturedAt: string;
};

type ComplianceSlot = {
  downloadUrl: string;
  capturedAt?: string;
} | null;

type ComplianceLocation = {
  id: string;
  name: string;
  before: ComplianceSlot;
  during: ComplianceSlot;
  after: ComplianceSlot;
};

function readItem(value: unknown): PendingCompliancePhoto | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const currentStage = record.currentStage === 'before' || record.currentStage === 'during' ? record.currentStage : null;
  const nextStage = record.nextStage === 'during' || record.nextStage === 'after' ? record.nextStage : null;
  if (
    typeof record.locationId !== 'string' ||
    !record.locationId ||
    typeof record.locationName !== 'string' ||
    typeof record.thumbnailUrl !== 'string' ||
    !record.thumbnailUrl ||
    !currentStage ||
    !nextStage
  ) {
    return null;
  }
  return {
    locationId: record.locationId,
    locationName: record.locationName,
    currentStage,
    nextStage,
    thumbnailUrl: record.thumbnailUrl,
    capturedAt: typeof record.capturedAt === 'string' ? record.capturedAt : '',
  };
}

export function readPendingCompliance(value: unknown): PendingCompliancePhoto[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.flatMap((item) => {
    const photo = readItem(item);
    return photo ? [photo] : [];
  });
}

export function buildPendingCompliance(locations: ComplianceLocation[]): PendingCompliancePhoto[] {
  const items: PendingCompliancePhoto[] = [];
  for (const location of locations) {
    if (location.before && !location.during) {
      items.push({
        locationId: location.id,
        locationName: location.name,
        currentStage: 'before',
        nextStage: 'during',
        thumbnailUrl: location.before.downloadUrl,
        capturedAt: location.before.capturedAt ?? '',
      });
    } else if (location.during && !location.after) {
      items.push({
        locationId: location.id,
        locationName: location.name,
        currentStage: 'during',
        nextStage: 'after',
        thumbnailUrl: location.during.downloadUrl,
        capturedAt: location.during.capturedAt ?? '',
      });
    }
  }
  return items;
}

export function samePendingCompliance(
  stored: PendingCompliancePhoto[] | undefined,
  next: PendingCompliancePhoto[],
): boolean {
  const left = stored ?? [];
  return (
    left.length === next.length &&
    left.every((item, index) => {
      const other = next[index];
      return (
        item.locationId === other.locationId &&
        item.locationName === other.locationName &&
        item.currentStage === other.currentStage &&
        item.nextStage === other.nextStage &&
        item.thumbnailUrl === other.thumbnailUrl &&
        item.capturedAt === other.capturedAt
      );
    })
  );
}

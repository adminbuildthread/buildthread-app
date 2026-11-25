import { collection, onSnapshot, query, where, type FirestoreError, type QueryDocumentSnapshot } from 'firebase/firestore';

import { getDb } from '@/lib/firebase';
import type { ProjectRecord } from '@/lib/firebase-config';
import { readPendingCompliance } from '@/utils/pendingCompliance';

function createdAtMillis(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    const time = date instanceof Date ? date.getTime() : Number.NaN;
    return Number.isNaN(time) ? null : time;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
  }
  return null;
}

function readOptional(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStoredNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const names = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return names.length > 0 ? names : undefined;
}

function newestFirst(left: QueryDocumentSnapshot, right: QueryDocumentSnapshot): number {
  const leftTime = createdAtMillis(left.get('createdAt')) ?? (left.metadata.hasPendingWrites ? Number.MAX_SAFE_INTEGER : null);
  const rightTime = createdAtMillis(right.get('createdAt')) ?? (right.metadata.hasPendingWrites ? Number.MAX_SAFE_INTEGER : null);
  if (leftTime == null && rightTime == null) {
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  }
  if (leftTime == null) {
    return 1;
  }
  if (rightTime == null) {
    return -1;
  }
  return rightTime - leftTime;
}

export function subscribeToProjects(
  userId: string,
  onProjects: (projects: ProjectRecord[]) => void,
  onError: (error: FirestoreError) => void,
): () => void {
  return onSnapshot(
    query(collection(getDb(), 'projects'), where('userId', '==', userId)),
    (snapshot) => {
      onProjects(
        snapshot.docs.slice().sort(newestFirst).map((project) => {
          const name = project.get('name');
          const endDate = project.get('endDate');
          return {
            id: project.id,
            name: typeof name === 'string' && name.trim().length > 0 ? name.trim() : project.id,
            clientName: readOptional(project.get('clientName')),
            address: readOptional(project.get('siteAddress')) ?? readOptional(project.get('address')),
            jobReference: readOptional(project.get('jobReference')),
            locationNames: readStoredNames(project.get('locationNames')),
            projectMode: project.get('projectMode') === 'quick' ? 'quick' : 'compliance',
            pendingCompliance: readPendingCompliance(project.get('pendingCompliance')),
            status:
              project.get('status') === 'completed'
                ? 'completed'
                : project.get('status') === 'archived'
                  ? 'archived'
                  : 'active',
            endDate: typeof endDate === 'string' && endDate.trim() ? endDate.trim() : undefined,
          };
        }),
      );
    },
    onError,
  );
}

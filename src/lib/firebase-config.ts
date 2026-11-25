import type { PendingCompliancePhoto } from '@/utils/pendingCompliance';

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

/**
 * Web config from Firebase console → Project settings → Your apps.
 * Each value must be read as `process.env.EXPO_PUBLIC_*` so Expo can inline it.
 */
export function readFirebaseOptions(): FirebaseWebConfig | null {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    return null;
  }

  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
}

export function isFirebaseConfigured(): boolean {
  return readFirebaseOptions() !== null;
}

/** Blank means the project's (default) database. */
export function readFirestoreDatabaseId(): string | undefined {
  const databaseId = process.env.EXPO_PUBLIC_FIREBASE_DATABASE_ID;
  return databaseId ? databaseId : undefined;
}

export type ProjectRecord = {
  id: string;
  name: string;
  clientName?: string;
  address?: string;
  jobReference?: string;
  locationNames?: string[];
  projectMode?: 'compliance' | 'quick';
  pendingCompliance?: PendingCompliancePhoto[];
  status?: 'active' | 'completed' | 'archived';
  endDate?: string;
};

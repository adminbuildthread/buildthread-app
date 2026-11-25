import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { readFirebaseOptions, readFirestoreDatabaseId } from '@/lib/firebase-config';

let firestore: Firestore | undefined;

export function getFirebaseApp(): FirebaseApp {
  const options = readFirebaseOptions();
  if (!options) {
    throw new Error(
      'Firebase is not configured. Add the EXPO_PUBLIC_FIREBASE_* values from your web app to .env.local.',
    );
  }

  return getApps().length > 0 ? getApp() : initializeApp(options);
}

export function getDb(): Firestore {
  if (!firestore) {
    const app = getFirebaseApp();
    const databaseId = readFirestoreDatabaseId();
    firestore = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  }

  return firestore;
}

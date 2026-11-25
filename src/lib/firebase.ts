import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, type Firestore } from 'firebase/firestore';
import { Platform } from 'react-native';

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
    // IndexedDB persistence is available on web. Native offline evidence uses the
    // on-device photo queue and the last cached project snapshot.
    if (Platform.OS === 'web') {
      try {
        firestore = databaseId
          ? initializeFirestore(app, { localCache: persistentLocalCache() }, databaseId)
          : initializeFirestore(app, { localCache: persistentLocalCache() });
        return firestore;
      } catch {
        // Fall through when Firestore was already started without persistence.
      }
    }
    firestore = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  }

  return firestore;
}

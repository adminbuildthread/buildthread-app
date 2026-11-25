import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import { Platform } from 'react-native';

import { getFirebaseApp } from '@/lib/firebase';

type ReactNativeAuthModule = {
  getReactNativePersistence?: (storage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  }) => Persistence;
};

let auth: Auth | undefined;

function reactNativePersistence(): Persistence | null {
  if (Platform.OS === 'web') {
    return null;
  }
  try {
    // Conditional require so web does not load the React Native persistence helper.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const authModule = require('@firebase/auth') as ReactNativeAuthModule;
    if (typeof authModule.getReactNativePersistence !== 'function') {
      return null;
    }
    return authModule.getReactNativePersistence(AsyncStorage);
  } catch {
    return null;
  }
}

export function getProjectAuth(): Auth {
  if (auth) {
    return auth;
  }
  const app = getFirebaseApp();
  const persistence = reactNativePersistence();
  if (!persistence) {
    auth = getAuth(app);
    return auth;
  }
  try {
    auth = initializeAuth(app, { persistence });
  } catch {
    auth = getAuth(app);
  }
  return auth;
}

export function requireUserId(): string {
  const uid = getProjectAuth().currentUser?.uid;
  if (!uid) {
    throw new Error('Sign in to continue.');
  }
  return uid;
}

export async function requireIdToken(): Promise<string> {
  const user = getProjectAuth().currentUser;
  if (!user) {
    throw new Error('Sign in to continue.');
  }
  return user.getIdToken();
}

export {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
};

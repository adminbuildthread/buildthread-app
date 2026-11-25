import { getDownloadURL, getStorage, listAll, ref, type FirebaseStorage } from 'firebase/storage';

import { getFirebaseApp } from '@/lib/firebase';

let storage: FirebaseStorage | undefined;

export function getProjectStorage(): FirebaseStorage {
  if (!storage) {
    storage = getStorage(getFirebaseApp());
  }
  return storage;
}

export { getDownloadURL, listAll, ref };

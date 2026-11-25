import { deleteUser, EmailAuthProvider, reauthenticateWithCredential, type User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { deleteObject } from 'firebase/storage';

import { getProjectAuth } from '@/lib/firebase-auth';
import { getDb } from '@/lib/firebase';
import { getProjectStorage, listAll, ref } from '@/lib/firebase-storage';
import { clearQueueForUser } from '@/utils/offlineQueue';

async function deleteStoragePrefix(path: string): Promise<void> {
  const listed = await listAll(ref(getProjectStorage(), path));
  await Promise.all(listed.items.map((item) => deleteObject(item)));
  await Promise.all(listed.prefixes.map((prefix) => deleteStoragePrefix(prefix.fullPath)));
}

async function deleteOwnedFirestore(uid: string): Promise<void> {
  const database = getDb();
  const projects = await getDocs(query(collection(database, 'projects'), where('userId', '==', uid)));
  for (const project of projects.docs) {
    const [locations, evidence, audit] = await Promise.all([
      getDocs(collection(database, 'projects', project.id, 'locations')),
      getDocs(collection(database, 'projects', project.id, 'evidence')),
      getDocs(collection(database, 'projects', project.id, 'audit')),
    ]);
    await Promise.all(evidence.docs.map((item) => deleteDoc(item.ref)));
    await Promise.all(audit.docs.map((item) => deleteDoc(item.ref)));
    await Promise.all(locations.docs.map((item) => deleteDoc(item.ref)));
    await deleteDoc(project.ref);
  }
  await deleteDoc(doc(database, 'settings', uid));
}

export async function deleteSignedInAccount(password: string): Promise<void> {
  const user = getProjectAuth().currentUser;
  if (!user?.email) {
    throw new Error('Sign in again before deleting this account.');
  }
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
  const uid = user.uid;
  await setDoc(
    doc(getDb(), 'settings', uid),
    { deletionRequested: true, deletionRequestedAt: serverTimestamp() },
    { merge: true },
  );
  await deleteStoragePrefix(`users/${uid}`);
  await deleteOwnedFirestore(uid);
  await clearQueueForUser(uid);
  await deleteUser(user as User);
}

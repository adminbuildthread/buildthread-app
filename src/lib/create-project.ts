import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { getDb } from '@/lib/firebase';

export type ProjectMode = 'compliance' | 'quick';

export type NewProjectInput = {
  name: string;
  clientName: string;
  siteAddress: string;
  jobReference: string;
  startDate: string;
  endDate: string;
  notes: string;
  projectMode: ProjectMode;
  userId: string;
};

export function saveNewProject(input: NewProjectInput) {
  const endDate = input.endDate.trim();
  return addDoc(collection(getDb(), 'projects'), {
    name: input.name.trim(),
    clientName: input.clientName.trim(),
    siteAddress: input.siteAddress.trim(),
    jobReference: input.jobReference.trim(),
    startDate: input.startDate.trim(),
    notes: input.notes.trim(),
    projectMode: input.projectMode,
    userId: input.userId,
    status: 'active',
    createdAt: serverTimestamp(),
    ...(endDate ? { endDate } : {}),
  });
}

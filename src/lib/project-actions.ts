import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';

import { writeAudit } from '@/lib/audit';
import { getDb } from '@/lib/firebase';

export async function archiveProject(projectId: string): Promise<void> {
  await updateDoc(doc(getDb(), 'projects', projectId), {
    status: 'archived',
    archivedAt: serverTimestamp(),
  });
  await writeAudit({
    projectId,
    action: 'project_archived',
    summary: 'Project archived. Photos and the audit log were kept.',
  });
}

export async function completeProject(
  projectId: string,
  input: { reason: string | null; endDate?: string },
): Promise<void> {
  const reason = input.reason?.trim() || null;
  await updateDoc(doc(getDb(), 'projects', projectId), {
    status: 'completed',
    completedAt: serverTimestamp(),
    ...(input.endDate ? { endDate: input.endDate } : {}),
    ...(reason ? { completionGapReason: reason } : {}),
  });
  await writeAudit({
    projectId,
    action: reason ? 'project_completed_with_gaps' : 'project_completed',
    summary: reason ? `Completed with photos missing. Reason: ${reason}` : 'Project marked complete.',
    reason,
  });
}

export async function reopenProject(projectId: string): Promise<void> {
  await updateDoc(doc(getDb(), 'projects', projectId), { status: 'active' });
  await writeAudit({
    projectId,
    action: 'project_reopened',
    summary: 'Project reopened. Existing evidence was kept.',
  });
}

export async function saveLocationDetails(
  projectId: string,
  locationId: string,
  input: { name: string; itemCode: string; product: string; batch: string },
): Promise<void> {
  await updateDoc(doc(getDb(), 'projects', projectId, 'locations', locationId), {
    name: input.name,
    itemCode: input.itemCode,
    product: input.product,
    batch: input.batch,
  });
  await writeAudit({
    projectId,
    action: 'location_updated',
    summary: `Item ${input.itemCode || locationId} updated (${input.name}). Product ${input.product || '—'}, batch ${input.batch || '—'}.`,
    locationId,
  });
}

export async function archiveLocation(projectId: string, locationId: string, name: string): Promise<void> {
  await updateDoc(doc(getDb(), 'projects', projectId, 'locations', locationId), {
    archived: true,
    archivedAt: serverTimestamp(),
  });
  await writeAudit({
    projectId,
    action: 'location_archived',
    summary: `${name} archived. Its photos were kept.`,
    locationId,
  });
}

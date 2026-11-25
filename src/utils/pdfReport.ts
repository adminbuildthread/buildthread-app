import { File, Paths } from 'expo-file-system';

import { readEvidence } from '@/lib/evidence-record';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export type ExportableProject = {
  id: string;
  name?: string;
};

export type ReportProject = {
  name?: string;
  clientName?: string;
  siteAddress?: string;
  jobReference?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  projectMode?: string;
  status?: string;
};

export type ReportPhoto = {
  downloadUrl?: string;
  deviceCapturedAt?: string;
  serverCapturedAt?: string;
  latitude?: number;
  longitude?: number;
  note?: string;
  sha256?: string;
  operativeName?: string;
  importedUnverified?: boolean;
  clockDriftFlag?: boolean | null;
  clockDriftMs?: number | null;
  legacy?: boolean;
} | null;

export type ReportLocation = {
  name: string;
  order?: number;
  itemCode?: string;
  product?: string;
  batch?: string;
  before: ReportPhoto;
  during: ReportPhoto;
  after: ReportPhoto;
};

export type ReportAudit = {
  summary: string;
  at?: string;
  reason?: string;
};

export type ReportCompanyProfile = {
  logoUrl?: string;
  companyName?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  registrationNumber?: string;
};

const STAGES: { key: 'before' | 'during' | 'after'; label: string }[] = [
  { key: 'before', label: 'Before' },
  { key: 'during', label: 'During' },
  { key: 'after', label: 'After' },
];

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? escapeHtml(trimmed) : '';
}

function formatWhen(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }
  return escapeHtml(
    date.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  );
}

function summaryItem(label: string, value: string | undefined, wide = false): string {
  const shown = text(value) || '—';
  return `<div class="summary-item${wide ? ' wide' : ''}"><div class="summary-label">${escapeHtml(label)}</div><div class="summary-value">${shown}</div></div>`;
}

function photoMeta(photo: ReportPhoto): string {
  if (!photo) {
    return '';
  }
  const lines = [
    photo.importedUnverified ? 'Imported, unverified' : '',
    photo.legacy ? 'Earlier record, no hash' : '',
    photo.deviceCapturedAt ? `Device ${formatWhen(photo.deviceCapturedAt)}` : 'Device time missing',
    photo.serverCapturedAt ? `Server ${formatWhen(photo.serverCapturedAt)}` : 'Server time missing',
    photo.clockDriftFlag
      ? `Clock drift over 5 minutes${typeof photo.clockDriftMs === 'number' ? ` (${Math.round(photo.clockDriftMs / 1000)}s)` : ''}`
      : photo.clockDriftFlag === false
        ? 'Device and server time agree'
        : 'Clock drift not checked',
    typeof photo.latitude === 'number' && typeof photo.longitude === 'number'
      ? `GPS ${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)}`
      : 'GPS missing',
    photo.operativeName ? `Operative ${text(photo.operativeName)}` : '',
    photo.sha256 ? `SHA-256 ${escapeHtml(photo.sha256)}` : '',
    text(photo.note) ? `Note ${text(photo.note)}` : '',
  ].filter(Boolean);
  return lines.map((line) => `<div class="meta">${line}</div>`).join('');
}

function slotHtml(label: string, photo: ReportPhoto): string {
  if (!photo?.downloadUrl) {
    return `<div class="slot"><div class="empty">No photo</div><div class="stage">${escapeHtml(label)}</div></div>`;
  }
  return `<div class="slot">
    <img class="photo" src="${escapeHtml(photo.downloadUrl)}" alt="${escapeHtml(label)} photo" />
    <div class="stage">${escapeHtml(label)}</div>
    ${photoMeta(photo)}
  </div>`;
}

export function generateProjectReportHtml({
  project,
  locations,
  companyProfile,
  audit,
}: {
  project: ReportProject;
  locations: ReportLocation[];
  companyProfile?: ReportCompanyProfile | null;
  audit?: ReportAudit[];
}): string {
  const profile = companyProfile ?? {};
  const compliance = project.projectMode === 'compliance';
  const title = compliance ? 'Compliance Evidence Report' : 'Job Photo Log';
  const companyLines = [
    text(profile.companyName) ? `<div class="company-name">${text(profile.companyName)}</div>` : '',
    text(profile.address) ? `<div>${text(profile.address)}</div>` : '',
    text(profile.phone) ? `<div>${text(profile.phone)}</div>` : '',
    text(profile.email) ? `<div>${text(profile.email)}</div>` : '',
    text(profile.website) ? `<div>${text(profile.website)}</div>` : '',
    text(profile.registrationNumber) ? `<div>Reg ${text(profile.registrationNumber)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');
  const logo = text(profile.logoUrl)
    ? `<img class="logo" src="${escapeHtml(profile.logoUrl!.trim())}" alt="Company logo" />`
    : '';
  const summary = [
    summaryItem('Project Name', project.name),
    summaryItem('Status', project.status === 'completed' ? 'Completed' : 'Active'),
    summaryItem('Client / Agent Name', project.clientName),
    summaryItem('Site Address', project.siteAddress),
    summaryItem('Job Reference', project.jobReference),
    summaryItem('Start Date', project.startDate),
    text(project.endDate) ? summaryItem('End Date', project.endDate) : '',
    text(project.notes) ? summaryItem('Scope of Works / Notes', project.notes, true) : '',
  ]
    .filter(Boolean)
    .join('');
  const cards = [...locations]
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .map((location) => {
      const slots = STAGES.map((stage) => slotHtml(stage.label, location[stage.key])).join('');
      const itemLine = [
        location.itemCode ? `Item ${text(location.itemCode)}` : '',
        location.product ? `Product ${text(location.product)}` : '',
        location.batch ? `Batch ${text(location.batch)}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return `<section class="card"><h2>${text(location.name) || 'Location'}</h2>${
        itemLine ? `<div class="item">${itemLine}</div>` : ''
      }<div class="slots">${slots}</div></section>`;
    })
    .join('');
  const auditHtml = (audit ?? [])
    .map((entry) => {
      const when = entry.at ? formatWhen(entry.at) : '';
      const reason = text(entry.reason);
      return `<li>${when ? `${when} — ` : ''}${text(entry.summary) || 'Recorded'}${reason ? ` (${reason})` : ''}</li>`;
    })
    .join('');
  const generated = escapeHtml(
    new Date().toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  );

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #18181b; font-family: Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.4; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
    .logo { max-height: 60px; max-width: 180px; object-fit: contain; }
    .company { margin-left: auto; text-align: right; color: #3f3f46; }
    .company-name { color: #18181b; font-size: 14px; font-weight: 700; }
    .banner { display: inline-block; margin-bottom: 12px; padding: 4px 10px; border-radius: 999px; background: #208AEF; color: #ffffff; font-size: 12px; font-weight: 700; }
    h1 { margin: 0 0 12px; font-size: 22px; line-height: 1.2; }
    .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin-bottom: 16px; padding: 12px; border: 1px solid #e4e4e7; border-radius: 10px; }
    .summary-label { color: #71717a; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .summary-value { white-space: pre-wrap; }
    .wide { grid-column: 1 / -1; }
    .card { page-break-inside: avoid; break-inside: avoid; margin-bottom: 12px; border: 1px solid #e4e4e7; border-radius: 10px; overflow: hidden; }
    h2 { margin: 0; padding: 8px 10px; background: #f4f4f5; font-size: 14px; }
    .slots { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 10px; }
    .photo { width: 100%; height: 150px; object-fit: cover; border-radius: 6px; background: #f4f4f5; }
    .empty { display: flex; align-items: center; justify-content: center; height: 150px; border: 1px dashed #d4d4d8; border-radius: 6px; color: #71717a; }
    .stage { margin-top: 4px; font-weight: 700; }
    .item { padding: 0 10px; color: #3f3f46; }
    .meta, .note { color: #3f3f46; word-break: break-all; }
    .note { white-space: pre-wrap; }
    ul { margin: 0; padding-left: 18px; }
    footer { margin-top: 8px; color: #71717a; font-size: 10px; }
  </style>
</head>
<body>
  <header class="header">
    ${logo}
    <div class="company">${companyLines}</div>
  </header>
  <div class="banner">${escapeHtml(title)}</div>
  <h1>${text(project.name) || 'Project'}</h1>
  <section class="summary">${summary}</section>
  ${cards || '<p>No locations yet.</p>'}
  <section class="card"><h2>Audit trail</h2><div class="slots" style="display:block">${
    auditHtml ? `<ul>${auditHtml}</ul>` : '<p>No audit events recorded.</p>'
  }</div></section>
  <footer>Generated ${generated}. Times shown in this report use the device locale. Evidence device times are stored in UTC and stamped in UK time.</footer>
</body>
</html>`;
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readLegacyPhoto(value: unknown): ReportPhoto {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const downloadUrl = readText(record.downloadUrl);
  if (!downloadUrl) {
    return null;
  }
  const location = record.location;
  const point = location && typeof location === 'object' ? (location as { latitude?: unknown; longitude?: unknown }) : null;
  return {
    downloadUrl,
    deviceCapturedAt: readText(record.capturedAt),
    latitude: typeof point?.latitude === 'number' ? point.latitude : undefined,
    longitude: typeof point?.longitude === 'number' ? point.longitude : undefined,
    note: readText(record.note),
    legacy: true,
  };
}

function readReportTime(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return undefined;
}

export async function exportProjectReport(project: ExportableProject): Promise<void> {
  const [{ collection, doc, getDoc, getDocs, orderBy, query }, { getDb }, { requireUserId }] = await Promise.all([
    import('@/lib/firestore'),
    import('@/lib/firebase'),
    import('@/lib/firebase-auth'),
  ]);
  const database = getDb();
  const [projectSnapshot, profileSnapshot, locationsSnapshot, evidenceSnapshot, auditSnapshot] = await Promise.all([
    getDoc(doc(database, 'projects', project.id)),
    getDoc(doc(database, 'settings', requireUserId())),
    getDocs(query(collection(database, 'projects', project.id, 'locations'), orderBy('order', 'asc'))),
    getDocs(collection(database, 'projects', project.id, 'evidence')),
    getDocs(collection(database, 'projects', project.id, 'audit')),
  ]);
  const projectData = projectSnapshot.data() ?? {};
  const profileData = profileSnapshot.data() ?? {};
  const evidence = evidenceSnapshot.docs.flatMap((item) => {
    const record = readEvidence(item.id, item.data());
    return record ? [record] : [];
  });
  const latestFor = (locationId: string, stage: 'before' | 'during' | 'after'): ReportPhoto => {
    const matches = evidence.filter((item) => item.locationId === locationId && item.stage === stage);
    const latest = matches.sort((left, right) => {
      const leftTime = Date.parse(left.serverCapturedAt ?? left.deviceCapturedAt ?? '') || 0;
      const rightTime = Date.parse(right.serverCapturedAt ?? right.deviceCapturedAt ?? '') || 0;
      return rightTime - leftTime;
    })[0];
    if (!latest) {
      return null;
    }
    const downloadUrl = latest.stampedUrl || latest.originalUrl;
    if (!downloadUrl) {
      return null;
    }
    return {
      downloadUrl,
      deviceCapturedAt: latest.deviceCapturedAt ?? undefined,
      serverCapturedAt: latest.serverCapturedAt ?? undefined,
      latitude: latest.latitude ?? undefined,
      longitude: latest.longitude ?? undefined,
      note: latest.note,
      sha256: latest.originalSha256,
      operativeName: latest.operativeName,
      importedUnverified: latest.importedUnverified,
      clockDriftFlag: latest.clockDriftFlag,
      clockDriftMs: latest.clockDriftMs,
    };
  };
  const locations: ReportLocation[] = locationsSnapshot.docs.map((locationDoc) => {
    const data = locationDoc.data();
    return {
      name: readText(data.name)?.trim() || 'Location',
      order: typeof data.order === 'number' ? data.order : 0,
      itemCode: readText(data.itemCode),
      product: readText(data.product),
      batch: readText(data.batch),
      before: latestFor(locationDoc.id, 'before') ?? readLegacyPhoto(data.before),
      during: latestFor(locationDoc.id, 'during') ?? readLegacyPhoto(data.during),
      after: latestFor(locationDoc.id, 'after') ?? readLegacyPhoto(data.after),
    };
  });
  const audit: ReportAudit[] = auditSnapshot.docs
    .map((item) => {
      const data = item.data();
      return {
        summary: readText(data.summary) ?? '',
        at: readReportTime(data.at),
        reason: readText(data.reason),
      };
    })
    .sort((left, right) => (Date.parse(right.at ?? '') || 0) - (Date.parse(left.at ?? '') || 0))
    .slice(0, 40);
  const html = generateProjectReportHtml({
    project: {
      name: readText(projectData.name) || project.name || 'Project',
      clientName: readText(projectData.clientName),
      siteAddress: readText(projectData.siteAddress),
      jobReference: readText(projectData.jobReference),
      startDate: readText(projectData.startDate),
      endDate: readText(projectData.endDate),
      notes: readText(projectData.notes),
      projectMode: projectData.projectMode === 'quick' ? 'quick' : 'compliance',
      status: projectData.status === 'completed' ? 'completed' : 'active',
    },
    locations,
    companyProfile: {
      logoUrl: readText(profileData.logoUrl),
      companyName: readText(profileData.companyName),
      address: readText(profileData.address),
      phone: readText(profileData.phone),
      email: readText(profileData.email),
      website: readText(profileData.website),
      registrationNumber: readText(profileData.registrationNumber),
    },
    audit,
  });
  const file = await Print.printToFileAsync({
    html,
    base64: Platform.OS === 'android',
  });
  let shareUri = file?.uri;
  if (Platform.OS === 'android') {
    if (!file?.base64) {
      throw new Error('Could not prepare the PDF for sharing.');
    }
    const shareable = new File(Paths.cache, `job-report-${Date.now()}.pdf`);
    await shareable.write(file.base64, { encoding: 'base64' });
    shareUri = shareable.uri;
  }
  if (!shareUri) {
    return;
  }
  await Sharing.shareAsync(shareUri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Export Job Report',
    UTI: 'com.adobe.pdf',
  });
}

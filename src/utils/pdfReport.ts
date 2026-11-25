import { File, Paths } from 'expo-file-system';
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

export type ReportGps = {
  latitude?: number;
  longitude?: number;
};

export type ReportPhoto = {
  downloadUrl?: string;
  capturedAt?: string;
  location?: ReportGps | null;
  note?: string;
} | null;

export type ReportLocation = {
  name: string;
  order?: number;
  before: ReportPhoto;
  during: ReportPhoto;
  after: ReportPhoto;
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

function slotHtml(label: string, photo: ReportPhoto, showGps: boolean): string {
  if (!photo?.downloadUrl) {
    return `<div class="slot"><div class="empty">No photo</div><div class="stage">${escapeHtml(label)}</div></div>`;
  }
  const gps =
    showGps && photo.location
      ? `<div class="meta">GPS ${
          typeof photo.location.latitude === 'number' ? photo.location.latitude.toFixed(5) : '—'
        }, ${typeof photo.location.longitude === 'number' ? photo.location.longitude.toFixed(5) : '—'}</div>`
      : '';
  const captured = formatWhen(photo.capturedAt);
  const note = text(photo.note);
  return `<div class="slot">
    <img class="photo" src="${escapeHtml(photo.downloadUrl)}" alt="${escapeHtml(label)} photo" />
    <div class="stage">${escapeHtml(label)}</div>
    ${captured ? `<div class="meta">${captured}</div>` : ''}
    ${gps}
    ${note ? `<div class="note">${note}</div>` : ''}
  </div>`;
}

export function generateProjectReportHtml({
  project,
  locations,
  companyProfile,
}: {
  project: ReportProject;
  locations: ReportLocation[];
  companyProfile?: ReportCompanyProfile | null;
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
      const slots = STAGES.map((stage) => slotHtml(stage.label, location[stage.key], compliance)).join('');
      return `<section class="card"><h2>${text(location.name) || 'Location'}</h2><div class="slots">${slots}</div></section>`;
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
    .meta, .note { color: #3f3f46; }
    .note { white-space: pre-wrap; }
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
  <footer>Generated ${generated}</footer>
</body>
</html>`;
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readPhoto(value: unknown): ReportPhoto {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const downloadUrl = readText(record.downloadUrl);
  if (!downloadUrl) {
    return null;
  }
  const location = record.location;
  const point =
    location && typeof location === 'object'
      ? {
          latitude: typeof (location as { latitude?: unknown }).latitude === 'number'
            ? (location as { latitude: number }).latitude
            : undefined,
          longitude: typeof (location as { longitude?: unknown }).longitude === 'number'
            ? (location as { longitude: number }).longitude
            : undefined,
        }
      : null;
  return {
    downloadUrl,
    capturedAt: readText(record.capturedAt),
    location: point,
    note: readText(record.note),
  };
}

export async function exportProjectReport(project: ExportableProject): Promise<void> {
  const [{ collection, doc, getDoc, getDocs, orderBy, query }, { getDb }, { requireUserId }] = await Promise.all([
    import('@/lib/firestore'),
    import('@/lib/firebase'),
    import('@/lib/firebase-auth'),
  ]);
  const database = getDb();
  const [projectSnapshot, profileSnapshot, locationsSnapshot] = await Promise.all([
    getDoc(doc(database, 'projects', project.id)),
    getDoc(doc(database, 'settings', requireUserId())),
    getDocs(query(collection(database, 'projects', project.id, 'locations'), orderBy('order', 'asc'))),
  ]);
  const projectData = projectSnapshot.data() ?? {};
  const profileData = profileSnapshot.data() ?? {};
  const locations: ReportLocation[] = locationsSnapshot.docs.map((locationDoc) => {
    const data = locationDoc.data();
    return {
      name: readText(data.name)?.trim() || 'Location',
      order: typeof data.order === 'number' ? data.order : 0,
      before: readPhoto(data.before),
      during: readPhoto(data.during),
      after: readPhoto(data.after),
    };
  });
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

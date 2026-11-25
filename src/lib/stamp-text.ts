export type StampInput = {
  imported: boolean;
  deviceCapturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  jobReference: string;
  itemCode: string;
  operativeName: string;
};

function formatStampTime(value: string | null, imported: boolean): string {
  if (!value) {
    return imported ? 'EXIF time missing' : 'Time not recorded';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const formatted = date.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return imported ? `EXIF ${formatted}` : formatted;
}

export function stampLines(input: StampInput): string[] {
  const gps =
    typeof input.latitude === 'number' && typeof input.longitude === 'number'
      ? `GPS ${input.latitude.toFixed(5)}, ${input.longitude.toFixed(5)}`
      : input.imported
        ? 'GPS not in EXIF'
        : 'GPS not recorded';
  const lines = [
    formatStampTime(input.deviceCapturedAt, input.imported),
    gps,
    `Job ${input.jobReference || '—'} · Item ${input.itemCode || '—'}`,
    input.operativeName || 'Operative not named',
  ];
  if (input.imported) {
    lines.unshift('IMPORTED, UNVERIFIED');
  }
  return lines;
}

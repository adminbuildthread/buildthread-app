export type ExifCapture = {
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function exifDateToIso(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) {
    return null;
  }
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function decimalCoordinate(value: unknown, ref: unknown): number | null {
  let decimal: number | null = null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    decimal = value;
  } else if (Array.isArray(value) && value.length >= 1 && value.every((part) => typeof part === 'number')) {
    const [degrees, minutes = 0, seconds = 0] = value as number[];
    decimal = degrees + minutes / 60 + seconds / 3600;
  }
  if (decimal == null || !Number.isFinite(decimal)) {
    return null;
  }
  const direction = typeof ref === 'string' ? ref.toUpperCase() : '';
  if (direction === 'S' || direction === 'W') {
    return -Math.abs(decimal);
  }
  return decimal;
}

export function readExifCapture(exif: unknown): ExifCapture {
  const record = asRecord(exif);
  const gps = asRecord(record?.GPS) ?? record;
  const capturedAt =
    exifDateToIso(record?.DateTimeOriginal) ??
    exifDateToIso(record?.DateTime) ??
    exifDateToIso(gps?.DateTimeOriginal) ??
    null;
  const latitude = decimalCoordinate(
    gps?.GPSLatitude ?? gps?.latitude ?? record?.GPSLatitude,
    gps?.GPSLatitudeRef ?? record?.GPSLatitudeRef,
  );
  const longitude = decimalCoordinate(
    gps?.GPSLongitude ?? gps?.longitude ?? record?.GPSLongitude,
    gps?.GPSLongitudeRef ?? record?.GPSLongitudeRef,
  );
  return { capturedAt, latitude, longitude };
}

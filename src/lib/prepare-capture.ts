import { readExifCapture } from '@/lib/exif';
import type { EvidenceSource } from '@/lib/evidence-record';
import { sha256Hex } from '@/lib/hash';
import { stampLines } from '@/lib/stamp-text';
import { decodeBase64 } from '@/lib/upload-jpeg';

export type PreparedCapture = {
  source: EvidenceSource;
  originalBytes: Uint8Array;
  originalSha256: string;
  deviceCapturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  lines: string[];
};

function assertJpeg(bytes: Uint8Array) {
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error('This photo has to be a JPEG before it can be filed as evidence.');
  }
}

export async function prepareCapture(input: {
  base64: string;
  source: EvidenceSource;
  exif?: unknown;
  compliance: boolean;
  gps: { latitude: number; longitude: number; accuracy: number | null } | null;
  jobReference: string;
  itemCode: string;
  operativeName: string;
}): Promise<PreparedCapture> {
  const originalBytes = decodeBase64(input.base64);
  assertJpeg(originalBytes);
  const originalSha256 = await sha256Hex(originalBytes);
  const imported = input.source === 'imported';
  const exif = imported ? readExifCapture(input.exif) : null;
  if (input.compliance && !imported && !input.gps) {
    throw new Error('Location is required for a compliance photo. Turn on location and try again.');
  }
  const deviceCapturedAt = imported ? exif?.capturedAt ?? null : new Date().toISOString();
  const latitude = imported ? exif?.latitude ?? null : input.gps?.latitude ?? null;
  const longitude = imported ? exif?.longitude ?? null : input.gps?.longitude ?? null;
  const accuracy = imported ? null : input.gps?.accuracy ?? null;
  return {
    source: input.source,
    originalBytes,
    originalSha256,
    deviceCapturedAt,
    latitude,
    longitude,
    accuracy,
    lines: stampLines({
      imported,
      deviceCapturedAt,
      latitude,
      longitude,
      jobReference: input.jobReference,
      itemCode: input.itemCode,
      operativeName: input.operativeName,
    }),
  };
}

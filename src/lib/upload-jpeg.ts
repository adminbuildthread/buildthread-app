export function decodeBase64(value: string): Uint8Array {
  const binary = globalThis.atob(value.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function textBytes(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const merged = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

export function uploadJpeg(
  bucket: string,
  objectPath: string,
  bytes: Uint8Array,
  idToken: string,
): Promise<void> {
  const boundary = `buildthread${Date.now()}`;
  const metadata = JSON.stringify({ name: objectPath, contentType: 'image/jpeg' });
  const prefix = `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`;
  const suffix = `\r\n--${boundary}--`;
  const body = concatBytes([textBytes(prefix), bytes, textBytes(suffix)]);
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?name=${encodeURIComponent(objectPath)}`;

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);
    request.setRequestHeader('X-Goog-Upload-Protocol', 'multipart');
    request.setRequestHeader('Authorization', `Firebase ${idToken}`);
    request.timeout = 20000;
    request.ontimeout = () => {
      request.abort();
      reject(new Error('Could not upload this photo.'));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      let detail = '';
      try {
        const payload = JSON.parse(request.responseText) as { error?: { message?: string } };
        detail = payload.error?.message ?? '';
      } catch {
        detail = '';
      }
      reject(new Error(detail ? `Upload failed (${request.status}): ${detail}` : `Upload failed (${request.status})`));
    };
    request.onerror = () => {
      reject(new Error('Could not upload this photo.'));
    };
    request.send(body);
  });
}

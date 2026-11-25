import * as Crypto from 'expo-crypto';

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  const copy = new Uint8Array(buffer);
  copy.set(bytes);
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, copy);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

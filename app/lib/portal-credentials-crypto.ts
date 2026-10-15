import { createCipheriv, randomBytes } from 'node:crypto';

export function encryptPortalCredential(value: string) {
  const encodedKey = process.env.PORTAL_CREDENTIALS_ENCRYPTION_KEY;
  if (!encodedKey || !/^[0-9a-fA-F]{64}$/.test(encodedKey)) {
    throw new Error('PORTAL_CREDENTIALS_ENCRYPTION_KEY must be a 32-byte hex key.');
  }

  const key = Buffer.from(encodedKey, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random, URL-safe. Only the SHA-256 hash is stored. */
export function generateInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

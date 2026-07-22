import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { SystemRole } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: SystemRole;
  name: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
}

/**
 * Refresh tokens are opaque random strings; only a SHA-256 hash is persisted so
 * a database leak never yields usable tokens. Returns both the raw token (sent
 * to the client) and the hash (stored server-side).
 */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('hex');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Convert a TTL string like "7d" / "15m" to a future Date. */
export function ttlToDate(ttl: string): Date {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  const now = Date.now();
  if (!match) return new Date(now + 7 * 24 * 60 * 60 * 1000);
  const value = Number(match[1]);
  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return new Date(now + value * unitMs[match[2]]);
}

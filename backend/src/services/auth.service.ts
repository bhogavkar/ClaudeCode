import type { AuthProvider, SystemRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { hashPassword, verifyPassword } from '../utils/password';
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
  ttlToDate,
} from '../utils/jwt';
import type { RequestContext } from './audit.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: { id: string; email: string; name: string; role: SystemRole; avatarUrl: string | null };
}

function toPublicUser(u: {
  id: string;
  email: string;
  name: string;
  role: SystemRole;
  avatarUrl: string | null;
}) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, avatarUrl: u.avatarUrl };
}

async function issueTokens(
  user: { id: string; email: string; name: string; role: SystemRole },
  ctx?: RequestContext,
): Promise<AuthTokens> {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });
  const { token: refreshToken, hash } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hash,
      userId: user.id,
      expiresAt: ttlToDate(env.jwt.refreshTtl),
      createdByIp: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
    },
  });
  return { accessToken, refreshToken };
}

export async function register(
  input: { email: string; name: string; password: string; role?: SystemRole },
  ctx?: RequestContext,
): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      role: input.role ?? 'DEVELOPER',
    },
  });
  const tokens = await issueTokens(user, ctx);
  return { ...tokens, user: toPublicUser(user) };
}

export async function login(
  input: { email: string; password: string },
  ctx?: RequestContext,
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.passwordHash) throw ApiError.unauthorized('Invalid credentials');
  if (!user.isActive) throw ApiError.forbidden('Account is disabled');

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const tokens = await issueTokens(user, ctx);
  return { ...tokens, user: toPublicUser(user) };
}

/**
 * Rotate a refresh token: validate the presented token, revoke it, and issue a
 * fresh access+refresh pair. Rotation limits the blast radius of a stolen token.
 */
export async function refresh(rawToken: string, ctx?: RequestContext): Promise<AuthTokens> {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return issueTokens(record.user, ctx);
}

export async function logout(rawToken: string): Promise<void> {
  const hash = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Provision-or-fetch an SSO user (Azure AD / Google). Local password auth is
 * bypassed; the external provider is the source of truth for identity.
 */
export async function upsertSsoUser(
  input: { email: string; name: string; provider: AuthProvider; providerId: string; avatarUrl?: string },
  ctx?: RequestContext,
): Promise<AuthResult> {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      name: input.name,
      provider: input.provider,
      providerId: input.providerId,
      avatarUrl: input.avatarUrl,
    },
    update: { name: input.name, providerId: input.providerId, lastLoginAt: new Date() },
  });
  const tokens = await issueTokens(user, ctx);
  return { ...tokens, user: toPublicUser(user) };
}

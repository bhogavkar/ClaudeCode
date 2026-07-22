import type { Request, Response } from 'express';
import { env } from '../config/env';
import * as authService from '../services/auth.service';
import { recordAudit, requestContext } from '../services/audit.service';
import { ApiError } from '../utils/ApiError';

const REFRESH_COOKIE = 'pp_refresh';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export async function register(req: Request, res: Response): Promise<void> {
  const ctx = requestContext(req);
  const result = await authService.register(req.body, ctx);
  setRefreshCookie(res, result.refreshToken);
  await recordAudit({ userId: result.user.id, action: 'AUTH_REGISTER', entity: 'User', entityId: result.user.id, context: ctx });
  res.status(201).json({ user: result.user, accessToken: result.accessToken });
}

export async function login(req: Request, res: Response): Promise<void> {
  const ctx = requestContext(req);
  const result = await authService.login(req.body, ctx);
  setRefreshCookie(res, result.refreshToken);
  await recordAudit({ userId: result.user.id, action: 'AUTH_LOGIN', entity: 'User', entityId: result.user.id, context: ctx });
  res.json({ user: result.user, accessToken: result.accessToken });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
  if (!token) throw ApiError.unauthorized('No refresh token');
  const tokens = await authService.refresh(token, requestContext(req));
  setRefreshCookie(res, tokens.refreshToken);
  res.json({ accessToken: tokens.accessToken });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
  if (token) await authService.logout(token);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  await recordAudit({ userId: req.user?.id ?? null, action: 'AUTH_LOGOUT', context: requestContext(req) });
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  res.json({ user: req.user });
}

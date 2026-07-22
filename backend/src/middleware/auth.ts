import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';

/**
 * Authenticate a request from a Bearer access token. Populates `req.user`.
 * Rejects with 401 when the header is absent or the token is invalid/expired.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing bearer token');
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
    next();
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
}

/** Non-throwing variant: attaches `req.user` if a valid token is present. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(header.slice(7).trim());
      req.user = { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
    } catch {
      /* ignore — treated as anonymous */
    }
  }
  next();
}

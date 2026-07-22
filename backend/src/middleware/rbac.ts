import type { NextFunction, Request, Response } from 'express';
import type { SystemRole } from '@prisma/client';
import { ApiError } from '../utils/ApiError';

/**
 * Role-based access guard. Use after `authenticate`. Example:
 *   router.post('/', authenticate, requireRole('ADMIN', 'SCRUM_MASTER'), handler)
 */
export function requireRole(...allowed: SystemRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw ApiError.unauthorized();
    if (!allowed.includes(req.user.role)) {
      throw ApiError.forbidden(`Requires role: ${allowed.join(' or ')}`);
    }
    next();
  };
}

import type { Request } from 'express';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
  device?: string;
}

/** Extract audit-relevant context (IP, UA, coarse device class) from a request. */
export function requestContext(req: Request): RequestContext {
  const userAgent = req.headers['user-agent'] ?? undefined;
  const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  return {
    ipAddress: forwarded ?? req.socket.remoteAddress ?? undefined,
    userAgent,
    device: classifyDevice(userAgent),
  };
}

function classifyDevice(ua?: string): string {
  if (!ua) return 'unknown';
  if (/mobile|iphone|android/i.test(ua)) return 'mobile';
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  return 'desktop';
}

interface AuditParams {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  context?: RequestContext;
  metadata?: Record<string, unknown>;
}

/**
 * Write an immutable audit record. Fire-and-forget: auditing must never break
 * the primary request, so failures are logged rather than thrown.
 */
export async function recordAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        ipAddress: params.context?.ipAddress,
        userAgent: params.context?.userAgent,
        device: params.context?.device,
        metadata: params.metadata as object | undefined,
      },
    });
  } catch (err) {
    logger.warn({ err, action: params.action }, 'Failed to write audit log');
  }
}

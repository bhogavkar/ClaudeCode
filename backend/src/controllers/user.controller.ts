import type { Request, Response } from 'express';
import * as userService from '../services/user.service';
import { recordAudit, requestContext } from '../services/audit.service';

export async function list(req: Request, res: Response): Promise<void> {
  const result = await userService.listUsers({
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    search: req.query.search as string | undefined,
  });
  res.json(result);
}

export async function getOne(req: Request, res: Response): Promise<void> {
  res.json(await userService.getUser(req.params.id));
}

export async function updateRole(req: Request, res: Response): Promise<void> {
  const user = await userService.updateUserRole(req.params.id, req.body.role);
  await recordAudit({ userId: req.user!.id, action: 'USER_ROLE_UPDATE', entity: 'User', entityId: user.id, context: requestContext(req), metadata: { role: req.body.role } });
  res.json(user);
}

export async function setActive(req: Request, res: Response): Promise<void> {
  const user = await userService.setUserActive(req.params.id, Boolean(req.body.isActive));
  await recordAudit({ userId: req.user!.id, action: 'USER_ACTIVE_UPDATE', entity: 'User', entityId: user.id, context: requestContext(req) });
  res.json(user);
}

import type { Request, Response } from 'express';
import type { SessionStatus } from '@prisma/client';
import * as sessionService from '../services/session.service';
import * as aiService from '../services/ai.service';
import { recordAudit, requestContext } from '../services/audit.service';
import { emitToSession } from '../sockets';
import { SocketEvents } from '../sockets/events';
import { ApiError } from '../utils/ApiError';
import { resolveScale, toNumericValue } from '../utils/estimation';
import { prisma } from '../config/prisma';

export async function create(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const session = await sessionService.createSession(userId, req.body);
  await recordAudit({
    userId,
    action: 'SESSION_CREATE',
    entity: 'Session',
    entityId: session.id,
    context: requestContext(req),
    metadata: { code: session.code },
  });
  res.status(201).json(session);
}

export async function list(req: Request, res: Response): Promise<void> {
  const status = req.query.status as SessionStatus | undefined;
  const sessions = await sessionService.listSessionsForUser(req.user!.id, status);
  res.json({ sessions });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const session = await sessionService.getSessionById(req.params.id);
  res.json(session);
}

export async function getByCode(req: Request, res: Response): Promise<void> {
  const session = await sessionService.getSessionByCode(req.params.code);
  res.json(session);
}

export async function update(req: Request, res: Response): Promise<void> {
  const session = await sessionService.updateSession(req.params.id, req.body);
  emitToSession(session.id, SocketEvents.SESSION_UPDATED, { session });
  await recordAudit({ userId: req.user!.id, action: 'SESSION_UPDATE', entity: 'Session', entityId: session.id, context: requestContext(req) });
  res.json(session);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await sessionService.deleteSession(req.params.id);
  await recordAudit({ userId: req.user!.id, action: 'SESSION_DELETE', entity: 'Session', entityId: req.params.id, context: requestContext(req) });
  res.status(204).send();
}

export async function join(req: Request, res: Response): Promise<void> {
  const session = await sessionService.getSessionByCode(req.params.code);
  const participant = await sessionService.joinSession(session.id, req.user!.id, req.body.role);
  emitToSession(session.id, SocketEvents.USER_JOINED, { participant });
  res.status(200).json({ session, participant });
}

export async function addStory(req: Request, res: Response): Promise<void> {
  const story = await sessionService.addStory(req.params.id, req.body);
  emitToSession(req.params.id, SocketEvents.SESSION_UPDATED, { addedStoryId: story.id });
  res.status(201).json(story);
}

/** AI-assisted insight for a single story (complexity, risks, recommended estimate). */
export async function storyInsight(req: Request, res: Response): Promise<void> {
  const story = await prisma.story.findUnique({
    where: { id: req.params.storyId },
    include: { session: { select: { estimateScale: true, customScale: true } } },
  });
  if (!story) throw ApiError.notFound('Story not found');
  const scale = resolveScale(story.session.estimateScale, story.session.customScale);
  const scaleNumbers = scale.map(toNumericValue).filter((n): n is number => n !== null);
  const insight = aiService.analyzeStory(story, scaleNumbers);
  res.json(insight);
}

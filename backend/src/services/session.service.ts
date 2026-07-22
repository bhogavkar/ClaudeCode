import { customAlphabet } from 'nanoid';
import type { ParticipantRole, Prisma, SessionStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { resolveScale } from '../utils/estimation';

// Human-friendly, unambiguous join codes (no 0/O/1/I).
const generateCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

export interface CreateStoryInput {
  jiraStoryId?: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  businessRules?: string;
  dependencies?: string;
  risks?: string;
  labels?: string[];
  priority?: 'LOWEST' | 'LOW' | 'MEDIUM' | 'HIGH' | 'HIGHEST';
  type?: 'STORY' | 'BUG' | 'TASK' | 'EPIC' | 'SPIKE';
}

export interface CreateSessionInput {
  sprintName: string;
  sprintGoal?: string;
  projectId?: string;
  sprintId?: string;
  estimateScale?: string;
  customScale?: string[];
  autoReveal?: boolean;
  scheduledAt?: string;
  stories?: CreateStoryInput[];
}

const sessionInclude = {
  createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  stories: { orderBy: { order: 'asc' } },
  participants: {
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  },
} satisfies Prisma.SessionInclude;

export async function createSession(userId: string, input: CreateSessionInput) {
  const session = await prisma.session.create({
    data: {
      code: generateCode(),
      createdById: userId,
      projectId: input.projectId,
      sprintId: input.sprintId,
      sprintName: input.sprintName,
      sprintGoal: input.sprintGoal,
      estimateScale: input.estimateScale ?? 'FIBONACCI',
      customScale: input.customScale ?? [],
      autoReveal: input.autoReveal ?? false,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      status: 'ACTIVE',
      stories: input.stories?.length
        ? {
            create: input.stories.map((s, idx) => ({
              jiraStoryId: s.jiraStoryId,
              title: s.title,
              description: s.description,
              acceptanceCriteria: s.acceptanceCriteria,
              businessRules: s.businessRules,
              dependencies: s.dependencies,
              risks: s.risks,
              labels: s.labels ?? [],
              priority: s.priority ?? 'MEDIUM',
              type: s.type ?? 'STORY',
              order: idx,
            })),
          }
        : undefined,
      // Creator automatically joins as Scrum Master.
      participants: { create: { userId, role: 'SCRUM_MASTER' } },
    },
    include: sessionInclude,
  });
  return session;
}

export async function listSessionsForUser(userId: string, status?: SessionStatus) {
  return prisma.session.findMany({
    where: {
      status,
      OR: [{ createdById: userId }, { participants: { some: { userId } } }],
    },
    include: sessionInclude,
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getSessionById(id: string) {
  const session = await prisma.session.findUnique({ where: { id }, include: sessionInclude });
  if (!session) throw ApiError.notFound('Session not found');
  return session;
}

export async function getSessionByCode(code: string) {
  const session = await prisma.session.findUnique({
    where: { code: code.toUpperCase() },
    include: sessionInclude,
  });
  if (!session) throw ApiError.notFound('Session not found');
  return session;
}

/** Resolve the active card set for a session. */
export async function getSessionScale(sessionId: string): Promise<string[]> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { estimateScale: true, customScale: true },
  });
  if (!session) throw ApiError.notFound('Session not found');
  return resolveScale(session.estimateScale, session.customScale);
}

export async function updateSession(
  id: string,
  data: Partial<Pick<CreateSessionInput, 'sprintName' | 'sprintGoal' | 'autoReveal' | 'scheduledAt'>>,
) {
  await getSessionById(id);
  return prisma.session.update({
    where: { id },
    data: {
      sprintName: data.sprintName,
      sprintGoal: data.sprintGoal,
      autoReveal: data.autoReveal,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
    },
    include: sessionInclude,
  });
}

export async function deleteSession(id: string): Promise<void> {
  await getSessionById(id);
  await prisma.session.delete({ where: { id } });
}

/** Idempotently add (or refresh) a participant. Used both by REST join and sockets. */
export async function joinSession(sessionId: string, userId: string, role?: ParticipantRole) {
  await getSessionById(sessionId);
  return prisma.sessionParticipant.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    create: { sessionId, userId, role: role ?? 'DEVELOPER', isOnline: true },
    update: { isOnline: true, lastSeenAt: new Date() },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });
}

export async function setParticipantOnline(sessionId: string, userId: string, online: boolean) {
  await prisma.sessionParticipant.updateMany({
    where: { sessionId, userId },
    data: { isOnline: online, lastSeenAt: new Date() },
  });
}

export async function isScrumMaster(sessionId: string, userId: string): Promise<boolean> {
  const p = await prisma.sessionParticipant.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
  });
  return p?.role === 'SCRUM_MASTER';
}

export async function addStory(sessionId: string, input: CreateStoryInput) {
  await getSessionById(sessionId);
  const count = await prisma.story.count({ where: { sessionId } });
  return prisma.story.create({
    data: {
      sessionId,
      jiraStoryId: input.jiraStoryId,
      title: input.title,
      description: input.description,
      acceptanceCriteria: input.acceptanceCriteria,
      businessRules: input.businessRules,
      dependencies: input.dependencies,
      risks: input.risks,
      labels: input.labels ?? [],
      priority: input.priority ?? 'MEDIUM',
      type: input.type ?? 'STORY',
      order: count,
    },
  });
}

export function updateSessionStatus(id: string, status: SessionStatus) {
  return prisma.session.update({ where: { id }, data: { status } });
}

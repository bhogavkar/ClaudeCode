import type { DiscussionKind } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';

export async function addDiscussion(
  roundId: string,
  authorId: string,
  kind: DiscussionKind,
  content: string,
) {
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw ApiError.notFound('Round not found');
  return prisma.discussion.create({ data: { roundId, authorId, kind, content } });
}

export function listDiscussions(roundId: string) {
  return prisma.discussion.findMany({ where: { roundId }, orderBy: { createdAt: 'asc' } });
}

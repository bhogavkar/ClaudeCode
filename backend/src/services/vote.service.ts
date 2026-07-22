import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { toNumericValue } from '../utils/estimation';
import { computeStatistics, type VoteStatistics } from '../utils/statistics';
import { getSessionScale } from './session.service';

export interface RevealedVote {
  userId: string;
  name: string;
  avatarUrl: string | null;
  value: string;
  isOutlier: boolean;
}

/**
 * The anonymized view of a round shown while voting is OPEN. It reveals *who*
 * has voted (so the UI can show "3 of 5 submitted") but never the card values.
 */
export interface RoundPresence {
  roundId: string;
  roundNumber: number;
  status: string;
  votedUserIds: string[];
  totalParticipants: number;
}

async function storyWithSession(storyId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { session: { select: { id: true } } },
  });
  if (!story) throw ApiError.notFound('Story not found');
  return story;
}

/** Latest round for a story, or null when none exists yet. */
export function getLatestRound(storyId: string) {
  return prisma.round.findFirst({ where: { storyId }, orderBy: { roundNumber: 'desc' } });
}

export interface StoryRoundState {
  round: { id: string; roundNumber: number; status: string; winnerEstimate: string | null } | null;
  presence: RoundPresence | null;
  results: RevealResult | null;
}

/**
 * Aggregate everything the session room needs for a story on load / reconnect:
 * the latest round, live presence, and revealed results when applicable.
 */
export async function getStoryRoundState(storyId: string): Promise<StoryRoundState> {
  await storyWithSession(storyId);
  const latest = await getLatestRound(storyId);
  if (!latest) return { round: null, presence: null, results: null };

  const round = {
    id: latest.id,
    roundNumber: latest.roundNumber,
    status: latest.status,
    winnerEstimate: latest.winnerEstimate,
  };
  const presence = await getRoundPresence(latest.id);
  const results = latest.status === 'OPEN' ? null : await buildRevealResult(latest.id);
  return { round, presence, results };
}

/**
 * Start a fresh voting round. Any previous open/revealed round for the story is
 * closed. Blocked when the story is already locked.
 */
export async function startRound(storyId: string) {
  const story = await storyWithSession(storyId);
  if (story.isLocked) throw ApiError.conflict('Story estimate is locked');

  const latest = await getLatestRound(storyId);
  if (latest && latest.status !== 'CLOSED') {
    await prisma.round.update({
      where: { id: latest.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
  }

  const roundNumber = (latest?.roundNumber ?? 0) + 1;
  const round = await prisma.round.create({
    data: { storyId, roundNumber, status: 'OPEN' },
  });
  await prisma.session.update({ where: { id: story.sessionId }, data: { status: 'VOTING' } });
  return round;
}

/** Cast or change a vote. Allowed only while the round is OPEN. */
export async function castVote(roundId: string, userId: string, value: string) {
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw ApiError.notFound('Round not found');
  if (round.status !== 'OPEN') throw ApiError.conflict('Voting is closed for this round');

  await prisma.vote.upsert({
    where: { roundId_userId: { roundId, userId } },
    create: { roundId, userId, value },
    update: { value },
  });
  return getRoundPresence(roundId);
}

/** Presence view: who has voted, without exposing values. */
export async function getRoundPresence(roundId: string): Promise<RoundPresence> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      votes: { select: { userId: true } },
      story: { select: { sessionId: true } },
    },
  });
  if (!round) throw ApiError.notFound('Round not found');
  const totalParticipants = await prisma.sessionParticipant.count({
    where: { sessionId: round.story.sessionId, role: { in: ['SCRUM_MASTER', 'DEVELOPER'] } },
  });
  return {
    roundId: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    votedUserIds: round.votes.map((v) => v.userId),
    totalParticipants,
  };
}

export interface RevealResult {
  roundId: string;
  roundNumber: number;
  votes: RevealedVote[];
  statistics: VoteStatistics;
}

/** Reveal a round: flip status, compute statistics, and flag statistical outliers. */
export async function revealRound(roundId: string): Promise<RevealResult> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      story: { select: { sessionId: true } },
      votes: {
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  });
  if (!round) throw ApiError.notFound('Round not found');
  if (round.status === 'CLOSED') throw ApiError.conflict('Round is closed');

  if (round.status !== 'REVEALED') {
    await prisma.round.update({
      where: { id: roundId },
      data: { status: 'REVEALED', revealedAt: new Date() },
    });
    await prisma.session.update({
      where: { id: round.story.sessionId },
      data: { status: 'REVEALED' },
    });
  }

  return buildRevealResult(roundId);
}

async function buildRevealResult(roundId: string): Promise<RevealResult> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      story: { select: { sessionId: true } },
      votes: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
    },
  });
  if (!round) throw ApiError.notFound('Round not found');

  const scale = await getSessionScale(round.story.sessionId);
  const scaleNumbers = scale.map(toNumericValue).filter((n): n is number => n !== null);
  const stats = computeStatistics(
    round.votes.map((v) => ({ userId: v.userId, value: v.value })),
    scaleNumbers,
  );

  // Outlier = numeric vote more than 1 standard deviation from the mean.
  const outlierThreshold = stats.average !== null && stats.standardDeviation !== null
    ? stats.standardDeviation
    : null;

  const votes: RevealedVote[] = round.votes.map((v) => {
    const numeric = toNumericValue(v.value);
    const isOutlier =
      numeric !== null &&
      stats.average !== null &&
      outlierThreshold !== null &&
      outlierThreshold > 0 &&
      Math.abs(numeric - stats.average) > outlierThreshold;
    return {
      userId: v.user.id,
      name: v.user.name,
      avatarUrl: v.user.avatarUrl,
      value: v.value,
      isOutlier,
    };
  });

  return { roundId: round.id, roundNumber: round.roundNumber, votes, statistics: stats };
}

/** Fetch results for an already-revealed round (used on reconnect / report). */
export async function getRoundResults(roundId: string): Promise<RevealResult> {
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw ApiError.notFound('Round not found');
  if (round.status === 'OPEN') throw ApiError.forbidden('Round has not been revealed');
  return buildRevealResult(roundId);
}

/**
 * Lock the final estimate for a story. Records the winning value on the active
 * round, marks the story locked, and returns the updated story.
 */
export async function lockStory(storyId: string, finalEstimate: string) {
  const story = await storyWithSession(storyId);
  if (story.isLocked) throw ApiError.conflict('Story is already locked');

  const latest = await getLatestRound(storyId);
  if (latest) {
    await prisma.round.update({
      where: { id: latest.id },
      data: { status: 'CLOSED', winnerEstimate: finalEstimate, closedAt: new Date() },
    });
  }

  const updated = await prisma.story.update({
    where: { id: storyId },
    data: { isLocked: true, finalEstimate },
  });

  // If every story in the session is locked, mark the session completed.
  const remaining = await prisma.story.count({ where: { sessionId: story.sessionId, isLocked: false } });
  if (remaining === 0) {
    await prisma.session.update({ where: { id: story.sessionId }, data: { status: 'COMPLETED' } });
  }
  return updated;
}

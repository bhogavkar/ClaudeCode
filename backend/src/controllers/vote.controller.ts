import type { Request, Response } from 'express';
import * as voteService from '../services/vote.service';
import * as sessionService from '../services/session.service';
import * as discussionService from '../services/discussion.service';
import * as aiService from '../services/ai.service';
import { recordAudit, requestContext } from '../services/audit.service';
import { emitToSession } from '../sockets';
import { SocketEvents } from '../sockets/events';
import { ApiError } from '../utils/ApiError';
import { prisma } from '../config/prisma';
import { toNumericValue } from '../utils/estimation';
import { getSessionScale } from '../services/session.service';

/** Resolve the session id a story belongs to and assert Scrum-Master rights. */
async function assertScrumMasterForStory(storyId: string, userId: string): Promise<string> {
  const story = await prisma.story.findUnique({ where: { id: storyId }, select: { sessionId: true } });
  if (!story) throw ApiError.notFound('Story not found');
  const isSM = await sessionService.isScrumMaster(story.sessionId, userId);
  if (!isSM) throw ApiError.forbidden('Only the Scrum Master can perform this action');
  return story.sessionId;
}

export async function startRound(req: Request, res: Response): Promise<void> {
  const { storyId } = req.params;
  const sessionId = await assertScrumMasterForStory(storyId, req.user!.id);
  const round = await voteService.startRound(storyId);
  emitToSession(sessionId, SocketEvents.ROUND_STARTED, { storyId, round });
  await recordAudit({ userId: req.user!.id, action: 'VOTING_START', entity: 'Round', entityId: round.id, context: requestContext(req) });
  res.status(201).json(round);
}

/** REST fallback for casting a vote (the primary path is the socket event). */
export async function castVote(req: Request, res: Response): Promise<void> {
  const { roundId, value } = req.body;
  const presence = await voteService.castVote(roundId, req.user!.id, value);
  const round = await prisma.round.findUnique({ where: { id: roundId }, include: { story: { select: { sessionId: true } } } });
  if (round) {
    emitToSession(round.story.sessionId, SocketEvents.VOTE_SUBMITTED, { userId: req.user!.id, presence });
  }
  res.json(presence);
}

export async function getPresence(req: Request, res: Response): Promise<void> {
  const presence = await voteService.getRoundPresence(req.params.roundId);
  res.json(presence);
}

export async function storyRoundState(req: Request, res: Response): Promise<void> {
  const state = await voteService.getStoryRoundState(req.params.storyId);
  res.json(state);
}

export async function reveal(req: Request, res: Response): Promise<void> {
  const { roundId } = req.params;
  const round = await prisma.round.findUnique({ where: { id: roundId }, include: { story: { select: { sessionId: true } } } });
  if (!round) throw ApiError.notFound('Round not found');
  const isSM = await sessionService.isScrumMaster(round.story.sessionId, req.user!.id);
  if (!isSM) throw ApiError.forbidden('Only the Scrum Master can reveal votes');

  const result = await voteService.revealRound(roundId);
  emitToSession(round.story.sessionId, SocketEvents.VOTES_REVEALED, result);
  await recordAudit({ userId: req.user!.id, action: 'VOTES_REVEAL', entity: 'Round', entityId: roundId, context: requestContext(req) });
  res.json(result);
}

export async function results(req: Request, res: Response): Promise<void> {
  const result = await voteService.getRoundResults(req.params.roundId);
  res.json(result);
}

export async function lock(req: Request, res: Response): Promise<void> {
  const { storyId } = req.params;
  const sessionId = await assertScrumMasterForStory(storyId, req.user!.id);
  const story = await voteService.lockStory(storyId, req.body.finalEstimate);
  emitToSession(sessionId, SocketEvents.STORY_LOCKED, { story });
  await recordAudit({
    userId: req.user!.id,
    action: 'STORY_LOCK',
    entity: 'Story',
    entityId: storyId,
    context: requestContext(req),
    metadata: { finalEstimate: req.body.finalEstimate },
  });
  res.json(story);
}

export async function addDiscussion(req: Request, res: Response): Promise<void> {
  const { roundId, kind, content } = req.body;
  const round = await prisma.round.findUnique({ where: { id: roundId }, include: { story: { select: { sessionId: true } } } });
  if (!round) throw ApiError.notFound('Round not found');
  const note = await discussionService.addDiscussion(roundId, req.user!.id, kind ?? 'COMMENT', content);
  emitToSession(round.story.sessionId, SocketEvents.DISCUSSION_ADDED, { note });
  res.status(201).json(note);
}

export async function listDiscussions(req: Request, res: Response): Promise<void> {
  const notes = await discussionService.listDiscussions(req.params.roundId);
  res.json({ notes });
}

/** AI consensus advice for the current votes of a round. */
export async function consensusAdvice(req: Request, res: Response): Promise<void> {
  const round = await prisma.round.findUnique({
    where: { id: req.params.roundId },
    include: { votes: true, story: { select: { sessionId: true } } },
  });
  if (!round) throw ApiError.notFound('Round not found');
  const scale = await getSessionScale(round.story.sessionId);
  const scaleNumbers = scale.map(toNumericValue).filter((n): n is number => n !== null);
  const advice = aiService.suggestConsensus(
    round.votes.map((v) => ({ userId: v.userId, value: v.value })),
    scaleNumbers,
  );
  res.json(advice);
}

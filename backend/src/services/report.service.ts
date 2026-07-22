import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { toNumericValue } from '../utils/estimation';
import { computeStatistics } from '../utils/statistics';
import { getSessionScale } from './session.service';

export interface StoryReport {
  storyId: string;
  jiraStoryId: string | null;
  title: string;
  type: string;
  priority: string;
  finalEstimate: string | null;
  isLocked: boolean;
  rounds: Array<{
    roundNumber: number;
    status: string;
    winnerEstimate: string | null;
    votes: Array<{ name: string; value: string }>;
    statistics: ReturnType<typeof computeStatistics>;
  }>;
}

export interface SessionReport {
  sessionId: string;
  code: string;
  sprintName: string;
  sprintGoal: string | null;
  status: string;
  generatedAt: string;
  totalStories: number;
  lockedStories: number;
  totalPoints: number;
  stories: StoryReport[];
}

/** Assemble a complete, structured report for a session across all rounds. */
export async function buildSessionReport(sessionId: string, generatedAt: string): Promise<SessionReport> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      stories: {
        orderBy: { order: 'asc' },
        include: {
          rounds: {
            orderBy: { roundNumber: 'asc' },
            include: { votes: { include: { user: { select: { name: true } } } } },
          },
        },
      },
    },
  });
  if (!session) throw ApiError.notFound('Session not found');

  const scale = await getSessionScale(sessionId);
  const scaleNumbers = scale.map(toNumericValue).filter((n): n is number => n !== null);

  const stories: StoryReport[] = session.stories.map((story) => ({
    storyId: story.id,
    jiraStoryId: story.jiraStoryId,
    title: story.title,
    type: story.type,
    priority: story.priority,
    finalEstimate: story.finalEstimate,
    isLocked: story.isLocked,
    rounds: story.rounds.map((round) => ({
      roundNumber: round.roundNumber,
      status: round.status,
      winnerEstimate: round.winnerEstimate,
      votes: round.votes.map((v) => ({ name: v.user.name, value: v.value })),
      statistics: computeStatistics(
        round.votes.map((v) => ({ userId: v.userId, value: v.value })),
        scaleNumbers,
      ),
    })),
  }));

  const totalPoints = stories.reduce((sum, s) => {
    const n = s.finalEstimate ? toNumericValue(s.finalEstimate) : null;
    return sum + (n ?? 0);
  }, 0);

  return {
    sessionId: session.id,
    code: session.code,
    sprintName: session.sprintName,
    sprintGoal: session.sprintGoal,
    status: session.status,
    generatedAt,
    totalStories: stories.length,
    lockedStories: stories.filter((s) => s.isLocked).length,
    totalPoints,
    stories,
  };
}

/** Flatten a report to CSV (one row per story). */
export function reportToCsv(report: SessionReport): string {
  const header = [
    'Jira ID',
    'Title',
    'Type',
    'Priority',
    'Final Estimate',
    'Locked',
    'Rounds',
    'Last Avg',
    'Last Consensus %',
  ];
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = report.stories.map((s) => {
    const last = s.rounds[s.rounds.length - 1];
    return [
      s.jiraStoryId ?? '',
      s.title,
      s.type,
      s.priority,
      s.finalEstimate ?? '',
      s.isLocked ? 'Yes' : 'No',
      s.rounds.length,
      last?.statistics.average ?? '',
      last?.statistics.consensusPercentage ?? '',
    ]
      .map(escape)
      .join(',');
  });
  return [header.map(escape).join(','), ...rows].join('\n');
}

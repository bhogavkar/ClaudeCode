import { toNumericValue } from '../utils/estimation';
import { computeStatistics, type VoteInput } from '../utils/statistics';

/**
 * Heuristic "AI" assistance layer.
 *
 * These functions provide explainable, deterministic recommendations derived
 * from the story text and vote data — no external model calls, so they work
 * offline and never leak data. The interfaces are intentionally designed so a
 * hosted LLM (Claude, Azure OpenAI, …) can be dropped in behind them later
 * without changing callers.
 */

export interface StoryInsight {
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  complexityScore: number; // 0-100
  recommendedEstimate: string | null;
  detectedRisks: string[];
  detectedDependencies: string[];
  rationale: string[];
}

const RISK_SIGNALS = [
  'security', 'migration', 'legacy', 'unknown', 'spike', 'research', 'refactor',
  'performance', 'scal', 'concurrency', 'race condition', 'deadline', 'third-party',
  'breaking change', 'data loss', 'encryption', 'compliance',
];
const DEPENDENCY_SIGNALS = [
  'depends on', 'blocked by', 'requires', 'after', 'integration', 'api', 'upstream',
  'downstream', 'waiting on', 'prerequisite', 'external service',
];

export interface StoryLike {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
  businessRules?: string | null;
  dependencies?: string | null;
  risks?: string | null;
}

/** Analyse a story's text to estimate complexity and surface risks/dependencies. */
export function analyzeStory(story: StoryLike, scaleNumbers: number[] = []): StoryInsight {
  const text = [
    story.title,
    story.description,
    story.acceptanceCriteria,
    story.businessRules,
    story.dependencies,
    story.risks,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  const rationale: string[] = [];
  const detectedRisks = RISK_SIGNALS.filter((s) => text.includes(s));
  const detectedDependencies = DEPENDENCY_SIGNALS.filter((s) => text.includes(s));

  // Complexity blends text length, acceptance-criteria count, and risk signals.
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const acCount = (story.acceptanceCriteria ?? '').split(/\n|;|\d+\./).filter((s) => s.trim()).length;

  let score = 0;
  score += Math.min(wordCount / 5, 25); // verbosity / breadth of scope
  score += Math.min(acCount * 6, 25); // acceptance-criteria surface area
  score += Math.min(detectedRisks.length * 10, 50); // risk signals dominate complexity
  score += Math.min(detectedDependencies.length * 10, 20); // coordination cost
  score = Math.min(Math.round(score), 100);

  if (wordCount > 120) rationale.push('Long, detailed description suggests broad scope.');
  if (acCount >= 4) rationale.push(`${acCount} acceptance criteria increase surface area.`);
  if (detectedRisks.length) rationale.push(`Risk signals detected: ${detectedRisks.join(', ')}.`);
  if (detectedDependencies.length)
    rationale.push(`Dependency signals detected: ${detectedDependencies.join(', ')}.`);
  if (rationale.length === 0) rationale.push('Story appears small and self-contained.');

  const complexity: StoryInsight['complexity'] = score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';

  // Map complexity band onto the provided numeric scale.
  let recommendedEstimate: string | null = null;
  if (scaleNumbers.length > 0) {
    const sorted = [...scaleNumbers].sort((a, b) => a - b);
    const idx =
      complexity === 'LOW'
        ? Math.floor(sorted.length * 0.25)
        : complexity === 'MEDIUM'
          ? Math.floor(sorted.length * 0.5)
          : Math.floor(sorted.length * 0.8);
    recommendedEstimate = String(sorted[Math.min(idx, sorted.length - 1)]);
  }

  return { complexity, complexityScore: score, recommendedEstimate, detectedRisks, detectedDependencies, rationale };
}

export interface ConsensusAdvice {
  hasConsensus: boolean;
  suggestion: string;
  outlierUserIds: string[];
  note: string;
}

/**
 * Given the votes of a round, advise whether consensus is reached and identify
 * outlier voters who should explain their reasoning.
 */
export function suggestConsensus(votes: (VoteInput & { userId: string })[], scaleNumbers: number[] = []): ConsensusAdvice {
  const stats = computeStatistics(votes, scaleNumbers);
  const outlierUserIds: string[] = [];

  if (stats.average !== null && stats.standardDeviation !== null && stats.standardDeviation > 0) {
    for (const v of votes) {
      const n = toNumericValue(v.value);
      if (n !== null && Math.abs(n - stats.average) > stats.standardDeviation) {
        outlierUserIds.push(v.userId);
      }
    }
  }

  const hasConsensus = stats.consensusPercentage >= 70;
  let note: string;
  if (hasConsensus) {
    note = `Strong agreement (${stats.consensusPercentage}%). Recommend locking at ${stats.suggestedEstimate}.`;
  } else if (outlierUserIds.length > 0) {
    note = `Split vote. ${outlierUserIds.length} outlier(s) should explain their estimate before re-voting.`;
  } else {
    note = 'Estimates are spread out. A short discussion and a re-vote are recommended.';
  }

  return {
    hasConsensus,
    suggestion: stats.suggestedEstimate ?? '?',
    outlierUserIds,
    note,
  };
}

/**
 * Predict next-sprint velocity from a series of past completed points using an
 * exponentially-weighted moving average (recent sprints weighted higher).
 */
export function predictVelocity(history: number[]): { predicted: number; confidence: number } {
  if (history.length === 0) return { predicted: 0, confidence: 0 };
  const alpha = 0.5;
  let ewma = history[0];
  for (let i = 1; i < history.length; i++) ewma = alpha * history[i] + (1 - alpha) * ewma;

  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance = history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const confidence = Math.round(Math.max(0, 1 - Math.min(cv, 1)) * 100);

  return { predicted: Math.round(ewma), confidence };
}

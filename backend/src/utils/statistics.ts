import { isSpecialCard, toNumericValue } from './estimation';

export interface VoteInput {
  userId: string;
  value: string;
}

export interface VoteStatistics {
  totalVotes: number;
  numericVotes: number;
  abstained: number; // special cards (?, coffee, break)
  average: number | null;
  median: number | null;
  mode: string[] | null;
  majority: string | null;
  min: number | null;
  max: number | null;
  range: number | null;
  standardDeviation: number | null;
  /** 0–100: share of numeric voters who picked the modal value. */
  consensusPercentage: number;
  /** 0–100 heuristic combining spread and agreement. Higher = more confident. */
  confidenceScore: number;
  /** card face -> count, across every submitted vote. */
  distribution: Record<string, number>;
  /** Suggested estimate rounded to the nearest available numeric card. */
  suggestedEstimate: string | null;
}

/**
 * Compute the full statistics bundle for a set of votes.
 *
 * Non-numeric cards (`?`, coffee, break) are counted in the distribution and as
 * `abstained` but never distort numeric aggregates. `scaleNumbers` — the numeric
 * faces of the active scale — lets us snap the average to a real card value.
 */
export function computeStatistics(votes: VoteInput[], scaleNumbers: number[] = []): VoteStatistics {
  const distribution: Record<string, number> = {};
  for (const v of votes) {
    distribution[v.value] = (distribution[v.value] ?? 0) + 1;
  }

  const numeric = votes
    .map((v) => toNumericValue(v.value))
    .filter((n): n is number => n !== null);

  const abstained = votes.filter((v) => isSpecialCard(v.value)).length;

  const base: VoteStatistics = {
    totalVotes: votes.length,
    numericVotes: numeric.length,
    abstained,
    average: null,
    median: null,
    mode: null,
    majority: null,
    min: null,
    max: null,
    range: null,
    standardDeviation: null,
    consensusPercentage: 0,
    confidenceScore: 0,
    distribution,
    suggestedEstimate: null,
  };

  if (numeric.length === 0) return base;

  const sorted = [...numeric].sort((a, b) => a - b);
  const sum = numeric.reduce((acc, n) => acc + n, 0);
  const average = sum / numeric.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const variance =
    numeric.reduce((acc, n) => acc + (n - average) ** 2, 0) / numeric.length;
  const standardDeviation = Math.sqrt(variance);

  // Mode across ALL votes (including specials), reported as card faces.
  const maxCount = Math.max(...Object.values(distribution));
  const mode = Object.entries(distribution)
    .filter(([, c]) => c === maxCount)
    .map(([value]) => value);

  // Majority = a single card face chosen by > 50% of all voters.
  const majorityEntry = Object.entries(distribution).find(
    ([, c]) => c / votes.length > 0.5,
  );
  const majority = majorityEntry ? majorityEntry[0] : null;

  // Consensus = share of numeric voters who agree on the most common numeric value.
  const numericDistribution: Record<number, number> = {};
  for (const n of numeric) numericDistribution[n] = (numericDistribution[n] ?? 0) + 1;
  const topNumericCount = Math.max(...Object.values(numericDistribution));
  const consensusPercentage = Math.round((topNumericCount / numeric.length) * 100);

  // Confidence: blends agreement with relative spread (coefficient of variation).
  const cv = average > 0 ? standardDeviation / average : 0;
  const spreadScore = Math.max(0, 1 - Math.min(cv, 1)); // 1 = no spread
  const confidenceScore = Math.round((0.6 * (consensusPercentage / 100) + 0.4 * spreadScore) * 100);

  // Suggested estimate: snap the average to the nearest available numeric card.
  let suggestedEstimate: string | null = null;
  if (scaleNumbers.length > 0) {
    const nearest = scaleNumbers.reduce((best, cur) =>
      Math.abs(cur - average) < Math.abs(best - average) ? cur : best,
    );
    suggestedEstimate = String(nearest);
  } else {
    suggestedEstimate = String(Math.round(average));
  }

  return {
    ...base,
    average: round(average),
    median: round(median),
    mode,
    majority,
    min,
    max,
    range: max - min,
    standardDeviation: round(standardDeviation),
    consensusPercentage,
    confidenceScore,
    suggestedEstimate,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

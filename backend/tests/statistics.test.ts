import { describe, it, expect } from 'vitest';
import { computeStatistics } from '../src/utils/statistics';

const fib = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

describe('computeStatistics', () => {
  it('returns empty aggregates when there are no numeric votes', () => {
    const stats = computeStatistics([{ userId: 'a', value: '?' }], fib);
    expect(stats.average).toBeNull();
    expect(stats.numericVotes).toBe(0);
    expect(stats.abstained).toBe(1);
  });

  it('computes average, median, min, max and range', () => {
    const votes = [
      { userId: 'a', value: '3' },
      { userId: 'b', value: '5' },
      { userId: 'c', value: '8' },
    ];
    const stats = computeStatistics(votes, fib);
    expect(stats.average).toBeCloseTo(5.33, 1);
    expect(stats.median).toBe(5);
    expect(stats.min).toBe(3);
    expect(stats.max).toBe(8);
    expect(stats.range).toBe(5);
  });

  it('detects unanimous consensus as 100%', () => {
    const votes = ['5', '5', '5', '5'].map((v, i) => ({ userId: `u${i}`, value: v }));
    const stats = computeStatistics(votes, fib);
    expect(stats.consensusPercentage).toBe(100);
    expect(stats.confidenceScore).toBe(100);
    expect(stats.suggestedEstimate).toBe('5');
  });

  it('excludes special cards from numeric aggregates but counts them', () => {
    const votes = [
      { userId: 'a', value: '8' },
      { userId: 'b', value: 'COFFEE' },
      { userId: 'c', value: '8' },
    ];
    const stats = computeStatistics(votes, fib);
    expect(stats.numericVotes).toBe(2);
    expect(stats.abstained).toBe(1);
    expect(stats.average).toBe(8);
    expect(stats.distribution.COFFEE).toBe(1);
  });

  it('snaps the suggested estimate to the nearest scale card', () => {
    const votes = [
      { userId: 'a', value: '5' },
      { userId: 'b', value: '8' },
    ];
    const stats = computeStatistics(votes, fib); // avg 6.5 -> nearest of {5,8} is 5 or 8
    expect(['5', '8']).toContain(stats.suggestedEstimate);
  });
});

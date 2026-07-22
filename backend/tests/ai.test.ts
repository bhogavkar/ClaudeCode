import { describe, it, expect } from 'vitest';
import { analyzeStory, suggestConsensus, predictVelocity } from '../src/services/ai.service';

const fib = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

describe('analyzeStory', () => {
  it('flags high complexity for risk-laden security migrations', () => {
    const insight = analyzeStory(
      {
        title: 'Migrate legacy auth to Azure AD',
        description: 'Security-sensitive migration with a breaking change and third-party dependency.',
        risks: 'data loss, compliance',
        dependencies: 'depends on identity team',
      },
      fib,
    );
    expect(insight.complexity).toBe('HIGH');
    expect(insight.detectedRisks.length).toBeGreaterThan(0);
    expect(insight.detectedDependencies.length).toBeGreaterThan(0);
  });

  it('treats a short, plain story as low complexity', () => {
    const insight = analyzeStory({ title: 'Fix typo on login button' }, fib);
    expect(insight.complexity).toBe('LOW');
  });
});

describe('suggestConsensus', () => {
  it('reports consensus when votes agree', () => {
    const advice = suggestConsensus(
      ['5', '5', '5'].map((v, i) => ({ userId: `u${i}`, value: v })),
      fib,
    );
    expect(advice.hasConsensus).toBe(true);
    expect(advice.outlierUserIds).toHaveLength(0);
  });

  it('identifies outliers on a split vote', () => {
    const advice = suggestConsensus(
      [
        { userId: 'a', value: '2' },
        { userId: 'b', value: '3' },
        { userId: 'c', value: '89' },
      ],
      fib,
    );
    expect(advice.outlierUserIds).toContain('c');
  });
});

describe('predictVelocity', () => {
  it('predicts zero for empty history', () => {
    expect(predictVelocity([]).predicted).toBe(0);
  });

  it('weights recent sprints more heavily', () => {
    const { predicted, confidence } = predictVelocity([20, 22, 40]);
    expect(predicted).toBeGreaterThan(22);
    expect(confidence).toBeGreaterThanOrEqual(0);
  });
});

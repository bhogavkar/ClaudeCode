// Card scales — kept in sync with backend/src/utils/estimation.ts
export const SPECIAL_CARDS = ['?', 'COFFEE', 'BREAK'] as const;

export const NAMED_SCALES: Record<string, string[]> = {
  FIBONACCI: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89'],
  MODIFIED_FIBONACCI: ['0', '0.5', '1', '2', '3', '5', '8', '13', '20', '40', '100'],
  T_SHIRT: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  POWERS_OF_TWO: ['1', '2', '4', '8', '16', '32', '64'],
  LINEAR: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
};

export function resolveScale(scaleName: string, custom: string[] = []): string[] {
  const base = scaleName === 'CUSTOM' ? custom : NAMED_SCALES[scaleName] ?? NAMED_SCALES.FIBONACCI;
  return [...base, ...SPECIAL_CARDS];
}

export const CARD_LABEL: Record<string, string> = {
  '?': '?',
  COFFEE: '☕',
  BREAK: '⏸',
};

export function cardLabel(value: string): string {
  return CARD_LABEL[value] ?? value;
}

export const SCALE_OPTIONS = [
  { value: 'FIBONACCI', label: 'Fibonacci (0,1,2,3,5,8…)' },
  { value: 'MODIFIED_FIBONACCI', label: 'Modified Fibonacci' },
  { value: 'T_SHIRT', label: 'T-Shirt Sizes' },
  { value: 'POWERS_OF_TWO', label: 'Powers of Two' },
  { value: 'LINEAR', label: 'Linear (1-10)' },
  { value: 'CUSTOM', label: 'Custom scale' },
];

export const PRIORITY_OPTIONS = ['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHEST'] as const;
export const STORY_TYPE_OPTIONS = ['STORY', 'BUG', 'TASK', 'EPIC', 'SPIKE'] as const;

export const ROLE_COLORS: Record<string, string> = {
  SCRUM_MASTER: '#8b5cf6',
  DEVELOPER: '#3b82f6',
  OBSERVER: '#64748b',
  ADMIN: '#ec4899',
};

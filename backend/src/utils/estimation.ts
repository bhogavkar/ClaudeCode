/**
 * Estimation card scales.
 *
 * A "scale" is an ordered list of card faces. Numeric faces participate in the
 * statistics engine; special faces (?, coffee, break) are non-numeric and are
 * excluded from averages/medians but still tracked for distribution.
 */

export const SPECIAL_CARDS = ['?', 'COFFEE', 'BREAK'] as const;
export type SpecialCard = (typeof SPECIAL_CARDS)[number];

export const NAMED_SCALES: Record<string, string[]> = {
  FIBONACCI: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89'],
  MODIFIED_FIBONACCI: ['0', '0.5', '1', '2', '3', '5', '8', '13', '20', '40', '100'],
  T_SHIRT: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  POWERS_OF_TWO: ['1', '2', '4', '8', '16', '32', '64'],
  LINEAR: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
};

/**
 * Resolve the full card set (scale values + special cards) for a session.
 * When `scaleName` is "CUSTOM", the caller-provided `custom` list is used.
 */
export function resolveScale(scaleName: string, custom: string[] = []): string[] {
  const base =
    scaleName === 'CUSTOM' ? custom : NAMED_SCALES[scaleName] ?? NAMED_SCALES.FIBONACCI;
  return [...base, ...SPECIAL_CARDS];
}

export function isSpecialCard(value: string): value is SpecialCard {
  return (SPECIAL_CARDS as readonly string[]).includes(value);
}

/** Parse a card face to a number, or null when it is non-numeric/special. */
export function toNumericValue(value: string): number | null {
  if (isSpecialCard(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

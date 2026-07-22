import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';

// Register the Chart.js primitives once for the whole app.
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

/**
 * Accessible, color-blind-safe categorical palette. Ordered so the first few
 * hues remain distinguishable for the most common vision types.
 */
export const CATEGORICAL = [
  '#4f46e5', // indigo
  '#0ea5e9', // sky
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#ef4444', // red
  '#14b8a6', // teal
  '#64748b', // slate
];

export function colorFor(index: number): string {
  return CATEGORICAL[index % CATEGORICAL.length];
}

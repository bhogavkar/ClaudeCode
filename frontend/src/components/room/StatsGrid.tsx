import { Box, Grid, Typography } from '@mui/material';
import type { VoteStatistics } from '@/types';
import { cardLabel } from '@/utils/constants';

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <Grid item xs={4} sm={3}>
      <Box
        sx={{
          textAlign: 'center',
          p: 1.5,
          borderRadius: 2,
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(148,163,184,0.08)' : 'rgba(99,102,241,0.06)'),
        }}
      >
        <Typography variant="h6" fontWeight={800}>
          {value ?? '—'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Box>
    </Grid>
  );
}

/** Grid of the computed statistics for a revealed round. */
export default function StatsGrid({ stats }: { stats: VoteStatistics }) {
  return (
    <Grid container spacing={1.5}>
      <Stat label="Average" value={stats.average} />
      <Stat label="Median" value={stats.median} />
      <Stat label="Mode" value={stats.mode?.map(cardLabel).join(', ') ?? null} />
      <Stat label="Majority" value={stats.majority ? cardLabel(stats.majority) : null} />
      <Stat label="Min" value={stats.min} />
      <Stat label="Max" value={stats.max} />
      <Stat label="Std dev" value={stats.standardDeviation} />
      <Stat label="Suggested" value={stats.suggestedEstimate ? cardLabel(stats.suggestedEstimate) : null} />
    </Grid>
  );
}

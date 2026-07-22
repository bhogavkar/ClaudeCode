import { useMemo } from 'react';
import { Box, Grid, Typography, useTheme } from '@mui/material';
import { Bar, Pie } from 'react-chartjs-2';
import { CATEGORICAL, colorFor } from '@/utils/charts';
import { cardLabel } from '@/utils/constants';

/** Bar + pie visualisation of how votes were distributed across cards. */
export default function VoteDistributionChart({ distribution }: { distribution: Record<string, number> }) {
  const theme = useTheme();
  const grid = theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.08)';
  const tick = theme.palette.text.secondary;

  const { labels, values } = useMemo(() => {
    const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
    return {
      labels: entries.map(([k]) => cardLabel(k)),
      values: entries.map(([, v]) => v),
    };
  }, [distribution]);

  if (values.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No votes to chart.
      </Typography>
    );
  }

  const colors = values.map((_, i) => colorFor(i));

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={7}>
        <Typography variant="subtitle2" gutterBottom>
          Distribution
        </Typography>
        <Box sx={{ height: 240 }}>
          <Bar
            data={{
              labels,
              datasets: [{ label: 'Votes', data: values, backgroundColor: CATEGORICAL[0], borderRadius: 6 }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { grid: { display: false }, ticks: { color: tick } },
                y: { beginAtZero: true, ticks: { precision: 0, color: tick }, grid: { color: grid } },
              },
            }}
          />
        </Box>
      </Grid>
      <Grid item xs={12} md={5}>
        <Typography variant="subtitle2" gutterBottom>
          Share of votes
        </Typography>
        <Box sx={{ height: 240 }}>
          <Pie
            data={{ labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: 'right', labels: { color: tick, boxWidth: 12 } } },
            }}
          />
        </Box>
      </Grid>
    </Grid>
  );
}

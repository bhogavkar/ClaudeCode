import { useQuery } from '@tanstack/react-query';
import { Alert, Avatar, Box, Chip, Divider, Grid, Stack, Typography } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { motion } from 'framer-motion';
import type { RevealResult } from '@/types';
import { pokerApi } from '@/services/pokerApi';
import { cardLabel } from '@/utils/constants';
import StatsGrid from './StatsGrid';
import ConsensusMeter from './ConsensusMeter';
import VoteDistributionChart from './VoteDistributionChart';

/** Everything shown after the Scrum Master reveals: cards, stats, charts, AI advice. */
export default function ResultsPanel({ results }: { results: RevealResult }) {
  const { data: advice } = useQuery({
    queryKey: ['consensus', results.roundId],
    queryFn: () => pokerApi.getConsensusAdvice(results.roundId),
  });

  return (
    <Stack spacing={3}>
      {/* Revealed cards */}
      <Box>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Revealed votes · Round {results.roundNumber}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {results.votes.map((v, i) => (
            <motion.div
              key={v.userId}
              initial={{ rotateY: 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
            >
              <Stack alignItems="center" spacing={0.5} sx={{ width: 80 }}>
                <Box
                  sx={{
                    width: 60,
                    height: 84,
                    borderRadius: 2,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 24,
                    fontWeight: 800,
                    color: '#fff',
                    background: v.isOutlier
                      ? 'linear-gradient(135deg,#f59e0b,#ef4444)'
                      : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
                  }}
                >
                  {cardLabel(v.value)}
                </Box>
                <Avatar src={v.avatarUrl ?? undefined} sx={{ width: 26, height: 26 }}>
                  {v.name[0]}
                </Avatar>
                <Typography variant="caption" noWrap sx={{ maxWidth: 78 }}>
                  {v.name.split(' ')[0]}
                </Typography>
                {v.isOutlier && (
                  <Chip size="small" color="warning" icon={<WarningAmberIcon />} label="Outlier" sx={{ height: 20 }} />
                )}
              </Stack>
            </motion.div>
          ))}
        </Box>
      </Box>

      <Divider />

      <Grid container spacing={3} alignItems="center">
        <Grid item xs={12} md={4} sx={{ display: 'flex', justifyContent: 'center' }}>
          <ConsensusMeter value={results.statistics.consensusPercentage} confidence={results.statistics.confidenceScore} />
        </Grid>
        <Grid item xs={12} md={8}>
          <StatsGrid stats={results.statistics} />
        </Grid>
      </Grid>

      {advice && (
        <Alert icon={<AutoAwesomeIcon />} severity={advice.hasConsensus ? 'success' : 'info'}>
          <strong>AI suggestion:</strong> {advice.note}
        </Alert>
      )}

      <Divider />
      <VoteDistributionChart distribution={results.statistics.distribution} />
    </Stack>
  );
}

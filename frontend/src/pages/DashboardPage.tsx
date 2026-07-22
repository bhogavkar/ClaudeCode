import { useMemo } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import SpeedIcon from '@mui/icons-material/Speed';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { motion } from 'framer-motion';
import GlassCard from '@/components/GlassCard';
import { pokerApi } from '@/services/pokerApi';
import { useAppSelector } from '@/store';
import type { Session } from '@/types';

const ACTIVE_STATES = ['ACTIVE', 'VOTING', 'REVEALED', 'LOCKED'];

export default function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);
  const navigate = useNavigate();
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => pokerApi.listSessions(),
  });

  const metrics = useMemo(() => {
    const active = sessions.filter((s) => ACTIVE_STATES.includes(s.status));
    const completed = sessions.filter((s) => s.status === 'COMPLETED');
    const upcoming = sessions.filter((s) => s.scheduledAt && new Date(s.scheduledAt) > new Date());
    const lockedPoints = completed.reduce(
      (sum, s) => sum + s.stories.reduce((a, st) => a + (Number(st.finalEstimate) || 0), 0),
      0,
    );
    const velocity = completed.length ? Math.round(lockedPoints / completed.length) : 0;
    return { active, completed, upcoming, velocity, lockedPoints };
  }, [sessions]);

  const canCreate = user?.role === 'ADMIN' || user?.role === 'SCRUM_MASTER';

  return (
    <Stack spacing={4}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2}>
        <Box>
          <Typography variant="h4">Welcome back, {user?.name?.split(' ')[0]} 👋</Typography>
          <Typography color="text.secondary">Here's what's happening across your teams.</Typography>
        </Box>
        {canCreate && (
          <Button component={RouterLink} to="/sessions/new" variant="contained" size="large">
            Start new session
          </Button>
        )}
      </Stack>

      <Grid container spacing={2}>
        <StatTile icon={<GroupsIcon />} label="Active sessions" value={metrics.active.length} color="#6366f1" />
        <StatTile icon={<TaskAltIcon />} label="Completed" value={metrics.completed.length} color="#10b981" />
        <StatTile icon={<SpeedIcon />} label="Avg velocity" value={metrics.velocity} suffix=" pts" color="#f59e0b" />
        <StatTile icon={<PlayArrowIcon />} label="Total points" value={metrics.lockedPoints} suffix=" pts" color="#ec4899" />
      </Grid>

      {isLoading && <LinearProgress />}

      <SessionSection title="Active & in-progress" sessions={metrics.active} onOpen={(s) => navigate(`/session/${s.code}`)} empty="No active sessions. Start one to begin estimating." />
      {metrics.upcoming.length > 0 && (
        <SessionSection title="Upcoming" sessions={metrics.upcoming} onOpen={(s) => navigate(`/session/${s.code}`)} empty="" />
      )}
      <SessionSection title="Completed" sessions={metrics.completed} onOpen={(s) => navigate(`/session/${s.code}`)} empty="No completed sessions yet." />
    </Stack>
  );
}

function StatTile({
  icon,
  label,
  value,
  suffix = '',
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  color: string;
}) {
  return (
    <Grid item xs={6} md={3}>
      <motion.div whileHover={{ y: -4 }}>
        <GlassCard sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ bgcolor: color, color: '#fff', p: 1.2, borderRadius: 2, display: 'flex' }}>{icon}</Box>
            <Box>
              <Typography variant="h5" fontWeight={800}>
                {value}
                {suffix}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
            </Box>
          </Stack>
        </GlassCard>
      </motion.div>
    </Grid>
  );
}

function SessionSection({
  title,
  sessions,
  onOpen,
  empty,
}: {
  title: string;
  sessions: Session[];
  onOpen: (s: Session) => void;
  empty: string;
}) {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {sessions.length === 0 ? (
        empty ? (
          <Typography color="text.secondary" variant="body2">
            {empty}
          </Typography>
        ) : null
      ) : (
        <Grid container spacing={2}>
          {sessions.map((s) => {
            const locked = s.stories.filter((st) => st.isLocked).length;
            const progress = s.stories.length ? (locked / s.stories.length) * 100 : 0;
            return (
              <Grid item xs={12} md={6} lg={4} key={s.id}>
                <motion.div whileHover={{ y: -4 }}>
                  <GlassCard sx={{ cursor: 'pointer' }} className="h-full">
                    <Box onClick={() => onOpen(s)}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Typography variant="subtitle1" fontWeight={700}>
                          {s.sprintName}
                        </Typography>
                        <Chip size="small" label={s.status} color={s.status === 'COMPLETED' ? 'success' : 'primary'} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, minHeight: 40 }}>
                        {s.sprintGoal ?? 'No goal set'}
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                        <Chip size="small" variant="outlined" label={`${s.stories.length} stories`} />
                        <Chip size="small" variant="outlined" label={`${s.participants.length} members`} />
                        <Chip size="small" variant="outlined" label={s.code} />
                      </Stack>
                      <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 4, height: 6 }} />
                      <Typography variant="caption" color="text.secondary">
                        {locked}/{s.stories.length} estimated
                      </Typography>
                    </Box>
                  </GlassCard>
                </motion.div>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}

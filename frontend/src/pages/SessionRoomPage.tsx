import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  List,
  ListItemButton,
  Menu,
  MenuItem,
  Select,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ReplayIcon from '@mui/icons-material/Replay';
import LockIcon from '@mui/icons-material/Lock';
import DownloadIcon from '@mui/icons-material/Download';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { motion } from 'framer-motion';
import GlassCard from '@/components/GlassCard';
import LoadingScreen from '@/components/LoadingScreen';
import VotingDeck from '@/components/room/VotingDeck';
import ParticipantList from '@/components/room/ParticipantList';
import ResultsPanel from '@/components/room/ResultsPanel';
import StoryDetails from '@/components/room/StoryDetails';
import DiscussionPanel from '@/components/room/DiscussionPanel';
import { useSessionRoom } from '@/hooks/useSessionRoom';
import { useAppDispatch } from '@/store';
import { showToast } from '@/store/slices/uiSlice';
import { exportReport } from '@/utils/export';
import { resolveScale, cardLabel } from '@/utils/constants';

export default function SessionRoomPage() {
  const { code = '' } = useParams();
  const dispatch = useAppDispatch();
  const room = useSessionRoom(code);
  const [lockValue, setLockValue] = useState('');
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);
  const [busy, setBusy] = useState(false);

  const numericCards = useMemo(() => {
    if (!room.session) return [];
    return resolveScale(room.session.estimateScale, room.session.customScale).filter((c) => !Number.isNaN(Number(c)));
  }, [room.session]);

  // Default the lock value to the AI-suggested estimate once revealed.
  useEffect(() => {
    if (room.results?.statistics.suggestedEstimate) setLockValue(room.results.statistics.suggestedEstimate);
  }, [room.results]);

  if (room.loading) return <LoadingScreen label="Joining session…" />;
  if (room.error || !room.session)
    return (
      <Box className="app-gradient" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <GlassCard>
          <Typography>{room.error ?? 'Session unavailable'}</Typography>
          <Button component={RouterLink} to="/dashboard" sx={{ mt: 2 }}>
            Back to dashboard
          </Button>
        </GlassCard>
      </Box>
    );

  const { session, selectedStory, round, presence, results, isScrumMaster, isObserver } = room;
  const status = round?.status ?? 'IDLE';
  const votingOpen = status === 'OPEN';
  const canVote = votingOpen && !isObserver;

  const guard = async (fn: () => Promise<unknown>, err: string) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      dispatch(showToast({ message: err, severity: 'error' }));
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = () => {
    void navigator.clipboard?.writeText(`${window.location.origin}/session/${session.code}`);
    dispatch(showToast({ message: 'Invite link copied', severity: 'success' }));
  };

  const doExport = async (fmt: 'json' | 'csv' | 'excel' | 'pdf') => {
    setExportAnchor(null);
    await exportReport(session.id, fmt).catch(() =>
      dispatch(showToast({ message: 'Export failed', severity: 'error' })),
    );
  };

  return (
    <Box className="app-gradient" sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0} color="transparent" sx={{ backdropFilter: 'blur(10px)' }}>
        <Toolbar>
          <IconButton component={RouterLink} to="/dashboard" edge="start" aria-label="Back">
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1, ml: 1 }}>
            <Typography variant="h6" fontWeight={800} lineHeight={1.1}>
              {session.sprintName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {session.sprintGoal}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title={room.connected ? 'Live' : 'Reconnecting…'}>
              <Chip
                size="small"
                icon={room.connected ? <CloudDoneIcon /> : <CloudOffIcon />}
                label={room.connected ? 'Live' : 'Offline'}
                color={room.connected ? 'success' : 'default'}
                variant="outlined"
              />
            </Tooltip>
            <Chip
              size="small"
              label={session.code}
              onDelete={copyInvite}
              deleteIcon={<ContentCopyIcon />}
              sx={{ fontWeight: 700, letterSpacing: 1 }}
            />
            {(isScrumMaster || undefined) && (
              <>
                <Button size="small" startIcon={<DownloadIcon />} onClick={(e: MouseEvent<HTMLElement>) => setExportAnchor(e.currentTarget)}>
                  Export
                </Button>
                <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
                  <MenuItem onClick={() => doExport('pdf')}>PDF</MenuItem>
                  <MenuItem onClick={() => doExport('excel')}>Excel</MenuItem>
                  <MenuItem onClick={() => doExport('csv')}>CSV</MenuItem>
                  <MenuItem onClick={() => doExport('json')}>JSON</MenuItem>
                </Menu>
              </>
            )}
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px 1fr 300px' }, gap: 2.5 }}>
          {/* Left: stories + team */}
          <Stack spacing={2.5}>
            <GlassCard sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Stories
              </Typography>
              <List dense disablePadding>
                {session.stories.map((s) => (
                  <ListItemButton
                    key={s.id}
                    selected={s.id === selectedStory?.id}
                    onClick={() => room.selectStory(s.id)}
                    sx={{ borderRadius: 2, mb: 0.5 }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                      <Typography variant="body2" noWrap sx={{ flexGrow: 1 }}>
                        {s.title}
                      </Typography>
                      {s.isLocked && <Chip size="small" color="success" label={cardLabel(s.finalEstimate ?? '')} sx={{ height: 20 }} />}
                    </Stack>
                  </ListItemButton>
                ))}
              </List>
            </GlassCard>
            <GlassCard sx={{ p: 2 }}>
              <ParticipantList
                participants={room.participants}
                votedUserIds={presence?.votedUserIds ?? []}
                revealed={status === 'REVEALED'}
              />
            </GlassCard>
          </Stack>

          {/* Center: story + voting / results */}
          <Stack spacing={2.5}>
            {selectedStory && (
              <GlassCard>
                <StoryDetails story={selectedStory} />
              </GlassCard>
            )}

            <GlassCard>
              {/* Scrum master action bar */}
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap mb={2}>
                <Chip
                  label={
                    status === 'OPEN'
                      ? `Voting open · ${presence?.votedUserIds.length ?? 0}/${presence?.totalParticipants ?? 0} voted`
                      : status === 'REVEALED'
                        ? `Round ${round?.roundNumber} revealed`
                        : selectedStory?.isLocked
                          ? 'Story locked'
                          : 'Ready to vote'
                  }
                  color={status === 'OPEN' ? 'primary' : status === 'REVEALED' ? 'secondary' : 'default'}
                />
                <Box sx={{ flexGrow: 1 }} />
                {isScrumMaster && !selectedStory?.isLocked && (
                  <>
                    {status !== 'OPEN' && (
                      <Button
                        variant="contained"
                        startIcon={status === 'REVEALED' ? <ReplayIcon /> : <PlayArrowIcon />}
                        disabled={busy}
                        onClick={() => guard(room.startRound, 'Could not start voting')}
                      >
                        {status === 'REVEALED' ? 'Re-vote' : 'Start voting'}
                      </Button>
                    )}
                    {status === 'OPEN' && (
                      <Button
                        variant="contained"
                        color="secondary"
                        startIcon={<VisibilityIcon />}
                        disabled={busy}
                        onClick={() => guard(room.reveal, 'Could not reveal votes')}
                      >
                        Reveal votes
                      </Button>
                    )}
                    {status === 'REVEALED' && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Select size="small" value={lockValue} onChange={(e) => setLockValue(e.target.value)} sx={{ minWidth: 90 }}>
                          {numericCards.map((c) => (
                            <MenuItem key={c} value={c}>
                              {c}
                            </MenuItem>
                          ))}
                        </Select>
                        <Button
                          variant="contained"
                          color="success"
                          startIcon={<LockIcon />}
                          disabled={busy || !lockValue}
                          onClick={() =>
                            guard(async () => {
                              await room.lockStory(lockValue);
                              dispatch(showToast({ message: `Locked at ${lockValue} points`, severity: 'success' }));
                            }, 'Could not lock estimate')}
                        >
                          Lock
                        </Button>
                      </Stack>
                    )}
                  </>
                )}
                {busy && <CircularProgress size={20} />}
              </Stack>

              <Divider sx={{ mb: 2 }} />

              {/* Body: voting deck, waiting state, or results */}
              {status === 'REVEALED' && results ? (
                <ResultsPanel results={results} />
              ) : selectedStory?.isLocked ? (
                <Stack alignItems="center" spacing={1} py={3}>
                  <LockIcon color="success" sx={{ fontSize: 40 }} />
                  <Typography>
                    Locked at <strong>{cardLabel(selectedStory.finalEstimate ?? '')}</strong> points
                  </Typography>
                  {isScrumMaster && (
                    <Button size="small" startIcon={<ReplayIcon />} onClick={() => guard(room.startRound, 'Could not re-open')}>
                      Re-open for re-estimation
                    </Button>
                  )}
                </Stack>
              ) : votingOpen ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <VotingDeck
                    estimateScale={session.estimateScale}
                    customScale={session.customScale}
                    myVote={room.myVote}
                    disabled={!canVote}
                    onVote={room.castVote}
                  />
                  {isObserver && (
                    <Typography variant="caption" color="text.secondary">
                      You are an observer — voting is disabled.
                    </Typography>
                  )}
                </motion.div>
              ) : (
                <Stack alignItems="center" spacing={1} py={4}>
                  <Typography color="text.secondary">
                    {isScrumMaster ? 'Start voting when the team is ready.' : 'Waiting for the Scrum Master to start voting…'}
                  </Typography>
                </Stack>
              )}
            </GlassCard>
          </Stack>

          {/* Right: discussion */}
          <Stack spacing={2.5}>
            <GlassCard sx={{ p: 2 }}>
              <DiscussionPanel roundId={round?.id ?? null} canPost={!isObserver} />
            </GlassCard>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}

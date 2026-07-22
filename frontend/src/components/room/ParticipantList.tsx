import { Avatar, Badge, Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { motion } from 'framer-motion';
import { ROLE_COLORS } from '@/utils/constants';

interface Member {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  isOnline: boolean;
}

interface Props {
  participants: Member[];
  votedUserIds: string[];
  revealed: boolean;
}

/** Roster showing online status and — during voting — who has submitted. */
export default function ParticipantList({ participants, votedUserIds, revealed }: Props) {
  const voted = new Set(votedUserIds);
  const online = participants.filter((p) => p.isOnline).length;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
        <Typography variant="subtitle1" fontWeight={700}>
          Team
        </Typography>
        <Chip size="small" label={`${online} online`} color="success" variant="outlined" />
      </Stack>
      <Stack spacing={1.25}>
        {participants.map((p) => {
          const hasVoted = voted.has(p.userId);
          return (
            <motion.div key={p.userId} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Badge
                  overlap="circular"
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  variant="dot"
                  sx={{
                    '& .MuiBadge-dot': {
                      backgroundColor: p.isOnline ? '#10b981' : '#94a3b8',
                      boxShadow: '0 0 0 2px #fff',
                    },
                  }}
                >
                  <Avatar src={p.avatarUrl ?? undefined} sx={{ width: 34, height: 34 }}>
                    {p.name[0]}
                  </Avatar>
                </Badge>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {p.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: ROLE_COLORS[p.role] ?? 'text.secondary' }}>
                    {p.role.replace('_', ' ')}
                  </Typography>
                </Box>
                {!revealed && p.role !== 'OBSERVER' && (
                  <Tooltip title={hasVoted ? 'Vote submitted' : 'Waiting…'}>
                    <Chip
                      size="small"
                      icon={hasVoted ? <CheckIcon /> : undefined}
                      label={hasVoted ? 'Voted' : '…'}
                      color={hasVoted ? 'success' : 'default'}
                      variant={hasVoted ? 'filled' : 'outlined'}
                    />
                  </Tooltip>
                )}
              </Stack>
            </motion.div>
          );
        })}
      </Stack>
    </Box>
  );
}

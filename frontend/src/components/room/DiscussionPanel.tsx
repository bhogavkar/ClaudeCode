import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { pokerApi } from '@/services/pokerApi';
import { getSocket, SocketEvents } from '@/services/socket';
import type { DiscussionKind, DiscussionNote } from '@/types';

const KINDS: DiscussionKind[] = ['COMMENT', 'RISK', 'DEPENDENCY', 'ASSUMPTION', 'DECISION'];
const KIND_COLOR: Record<DiscussionKind, string> = {
  COMMENT: '#64748b',
  RISK: '#ef4444',
  DEPENDENCY: '#f59e0b',
  ASSUMPTION: '#0ea5e9',
  DECISION: '#10b981',
};

/** Discussion notes for the active round — risks, decisions, comments. */
export default function DiscussionPanel({ roundId, canPost }: { roundId: string | null; canPost: boolean }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<DiscussionNote[]>([]);
  const [content, setContent] = useState('');
  const [kind, setKind] = useState<DiscussionKind>('COMMENT');

  useEffect(() => {
    if (!roundId) {
      setNotes([]);
      return;
    }
    pokerApi.listDiscussion(roundId).then(setNotes).catch(() => undefined);

    const socket = getSocket();
    const onAdded = (payload: { note: DiscussionNote }) => {
      if (payload.note.roundId === roundId) setNotes((prev) => [...prev, payload.note]);
    };
    socket.on(SocketEvents.DISCUSSION_ADDED, onAdded);
    return () => {
      socket.off(SocketEvents.DISCUSSION_ADDED, onAdded);
    };
  }, [roundId]);

  const post = async () => {
    if (!roundId || !content.trim()) return;
    await pokerApi.addDiscussion(roundId, content.trim(), kind);
    setContent('');
    void qc.invalidateQueries({ queryKey: ['discussion', roundId] });
  };

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" fontWeight={700}>
        Discussion notes
      </Typography>

      <Stack spacing={1.5} sx={{ maxHeight: 260, overflowY: 'auto', pr: 1 }}>
        {notes.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No notes yet. Capture risks, decisions and assumptions here.
          </Typography>
        )}
        {notes.map((n) => (
          <Box key={n.id} sx={{ borderLeft: `3px solid ${KIND_COLOR[n.kind]}`, pl: 1.5 }}>
            <Chip size="small" label={n.kind} sx={{ bgcolor: KIND_COLOR[n.kind], color: '#fff', height: 20, mb: 0.5 }} />
            <Typography variant="body2">{n.content}</Typography>
          </Box>
        ))}
      </Stack>

      {canPost && roundId && (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1}>
            <TextField select size="small" value={kind} onChange={(e) => setKind(e.target.value as DiscussionKind)} sx={{ minWidth: 130 }}>
              {KINDS.map((k) => (
                <MenuItem key={k} value={k}>
                  {k}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              placeholder="Add a note…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && post()}
              fullWidth
            />
          </Stack>
          <Button size="small" variant="contained" onClick={post} disabled={!content.trim()}>
            Add note
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

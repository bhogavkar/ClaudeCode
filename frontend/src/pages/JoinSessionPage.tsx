import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Stack, TextField, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import GlassCard from '@/components/GlassCard';
import { pokerApi } from '@/services/pokerApi';
import { useAppDispatch } from '@/store';
import { showToast } from '@/store/slices/uiSlice';

/** Enter a join code to jump straight into a session room. */
export default function JoinSessionPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const join = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    try {
      await pokerApi.joinSession(trimmed);
      navigate(`/session/${trimmed}`);
    } catch {
      dispatch(showToast({ message: 'Session not found. Check the code and try again.', severity: 'error' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Stack alignItems="center" sx={{ mt: 6 }}>
        <GlassCard sx={{ p: 4, width: '100%', maxWidth: 460 }}>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            Join a session
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Enter the code your Scrum Master shared with the team.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Session code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              inputProps={{ style: { letterSpacing: 6, fontWeight: 700, textAlign: 'center', fontSize: 24 } }}
              placeholder="ABCD1234"
              fullWidth
              autoFocus
            />
            <Button variant="contained" size="large" onClick={join} disabled={loading || !code.trim()}>
              {loading ? 'Joining…' : 'Join session'}
            </Button>
          </Stack>
        </GlassCard>
      </Stack>
    </motion.div>
  );
}

import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Divider,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { motion } from 'framer-motion';
import GlassCard from '@/components/GlassCard';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearError, login } from '@/store/slices/authSlice';

const DEMO = { email: 'scrum@planningpoker.dev', password: 'Password123!' };

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, status, error } = useAppSelector((s) => s.auth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  useEffect(() => () => void dispatch(clearError()), [dispatch]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void dispatch(login({ email, password }));
  };

  const useDemo = () => {
    setEmail(DEMO.email);
    setPassword(DEMO.password);
    void dispatch(login(DEMO));
  };

  return (
    <Box
      className="app-gradient"
      sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ width: '100%', maxWidth: 420 }}
      >
        <GlassCard sx={{ p: 4 }}>
          <Stack spacing={1} alignItems="center" mb={2}>
            <span style={{ fontSize: 44 }}>🃏</span>
            <Typography variant="h5" fontWeight={800}>
              Planning Poker
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Real-time Agile estimation for Scrum teams
            </Typography>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={submit}>
            <Stack spacing={2}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                fullWidth
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                fullWidth
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={status === 'loading'}
              >
                {status === 'loading' ? 'Signing in…' : 'Sign in'}
              </Button>
            </Stack>
          </form>

          <Divider sx={{ my: 2 }}>or</Divider>
          <Button fullWidth variant="outlined" onClick={useDemo} disabled={status === 'loading'}>
            Try the demo (Scrum Master)
          </Button>

          <Typography variant="body2" align="center" sx={{ mt: 2 }}>
            No account?{' '}
            <Link component={RouterLink} to="/register">
              Create one
            </Link>
          </Typography>
        </GlassCard>
      </motion.div>
    </Box>
  );
}

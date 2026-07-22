import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { motion } from 'framer-motion';
import GlassCard from '@/components/GlassCard';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearError, register } from '@/store/slices/authSlice';

const ROLES = [
  { value: 'DEVELOPER', label: 'Developer' },
  { value: 'SCRUM_MASTER', label: 'Scrum Master' },
  { value: 'OBSERVER', label: 'Observer' },
];

export default function RegisterPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, status, error } = useAppSelector((s) => s.auth);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'DEVELOPER' });

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);
  useEffect(() => () => void dispatch(clearError()), [dispatch]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void dispatch(register(form));
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Box className="app-gradient" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ width: '100%', maxWidth: 440 }}
      >
        <GlassCard sx={{ p: 4 }}>
          <Typography variant="h5" fontWeight={800} align="center" mb={2}>
            Create your account
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <form onSubmit={submit}>
            <Stack spacing={2}>
              <TextField label="Full name" value={form.name} onChange={set('name')} required fullWidth />
              <TextField label="Email" type="email" value={form.email} onChange={set('email')} required fullWidth />
              <TextField
                label="Password"
                type="password"
                value={form.password}
                onChange={set('password')}
                helperText="At least 8 characters"
                required
                fullWidth
              />
              <TextField select label="Role" value={form.role} onChange={set('role')} fullWidth>
                {ROLES.map((r) => (
                  <MenuItem key={r.value} value={r.value}>
                    {r.label}
                  </MenuItem>
                ))}
              </TextField>
              <Button type="submit" variant="contained" size="large" disabled={status === 'loading'}>
                {status === 'loading' ? 'Creating…' : 'Sign up'}
              </Button>
            </Stack>
          </form>
          <Typography variant="body2" align="center" sx={{ mt: 2 }}>
            Already have an account?{' '}
            <Link component={RouterLink} to="/login">
              Sign in
            </Link>
          </Typography>
        </GlassCard>
      </motion.div>
    </Box>
  );
}

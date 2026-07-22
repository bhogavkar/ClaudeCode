import { useState, type MouseEvent } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import AddIcon from '@mui/icons-material/Add';
import LoginIcon from '@mui/icons-material/MeetingRoom';
import { useAppDispatch, useAppSelector } from '@/store';
import { toggleTheme } from '@/store/slices/uiSlice';
import { logout } from '@/store/slices/authSlice';
import { ROLE_COLORS } from '@/utils/constants';

/** Authenticated app chrome: top navigation, theme toggle, account menu. */
export default function AppLayout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAppSelector((s) => s.auth.user);
  const themeMode = useAppSelector((s) => s.ui.themeMode);
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  const canCreate = user?.role === 'ADMIN' || user?.role === 'SCRUM_MASTER';

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  return (
    <Box className="app-gradient" sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0} color="transparent" sx={{ backdropFilter: 'blur(10px)' }}>
        <Toolbar>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1 }}>
            <Box
              component={RouterLink}
              to="/dashboard"
              sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'inherit' }}
            >
              <span style={{ fontSize: 24 }}>🃏</span>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Planning&nbsp;Poker
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              component={RouterLink}
              to="/join"
              startIcon={<LoginIcon />}
              color={location.pathname === '/join' ? 'primary' : 'inherit'}
            >
              Join
            </Button>
            {canCreate && (
              <Button
                component={RouterLink}
                to="/sessions/new"
                variant="contained"
                startIcon={<AddIcon />}
              >
                New session
              </Button>
            )}
            <Tooltip title={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`}>
              <IconButton onClick={() => dispatch(toggleTheme())} aria-label="Toggle color theme">
                {themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Tooltip>
            <IconButton onClick={(e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)} aria-label="Account menu">
              <Avatar src={user?.avatarUrl ?? undefined} sx={{ width: 34, height: 34 }}>
                {user?.name?.[0]}
              </Avatar>
            </IconButton>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
              <MenuItem disabled>
                <Stack>
                  <Typography variant="subtitle2">{user?.name}</Typography>
                  <Chip
                    size="small"
                    label={user?.role}
                    sx={{ mt: 0.5, bgcolor: ROLE_COLORS[user?.role ?? 'DEVELOPER'], color: '#fff' }}
                  />
                </Stack>
              </MenuItem>
              {user?.role === 'ADMIN' && (
                <MenuItem component={RouterLink} to="/admin/users" onClick={() => setAnchor(null)}>
                  Manage users
                </MenuItem>
              )}
              <MenuItem onClick={handleLogout}>Log out</MenuItem>
            </Menu>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}

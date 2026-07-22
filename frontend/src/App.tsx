import { useEffect, useMemo } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { buildTheme } from './theme/theme';
import { useAppDispatch, useAppSelector } from './store';
import { bootstrapAuth, sessionExpired } from './store/slices/authSlice';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import Toast from './components/Toast';
import LoadingScreen from './components/LoadingScreen';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import CreateSessionPage from './pages/CreateSessionPage';
import JoinSessionPage from './pages/JoinSessionPage';
import SessionRoomPage from './pages/SessionRoomPage';
import AdminUsersPage from './pages/AdminUsersPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector((s) => s.ui.themeMode);
  const { initialized } = useAppSelector((s) => s.auth);
  const theme = useMemo(() => buildTheme(themeMode), [themeMode]);

  // Sync the `dark` class for Tailwind + restore session on load.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
  }, [themeMode]);

  useEffect(() => {
    void dispatch(bootstrapAuth());
    const onExpired = () => dispatch(sessionExpired());
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [dispatch]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {!initialized ? (
        <LoadingScreen />
      ) : (
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/sessions/new" element={<CreateSessionPage />} />
              <Route path="/join" element={<JoinSessionPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
            </Route>
            {/* Full-bleed room outside the standard layout chrome */}
            <Route path="/session/:code" element={<SessionRoomPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      )}
      <Toast />
    </ThemeProvider>
  );
}

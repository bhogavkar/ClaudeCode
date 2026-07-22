import { createTheme, type Theme } from '@mui/material/styles';

/**
 * Build the MUI theme for a given mode. The palette leans into the "professional
 * Agile" indigo/violet identity; components get rounded corners and soft
 * elevation to complement the Tailwind glassmorphism surfaces.
 */
export function buildTheme(mode: 'light' | 'dark'): Theme {
  const isDark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: '#6366f1', dark: '#4338ca', light: '#818cf8' },
      secondary: { main: '#ec4899' },
      success: { main: '#10b981' },
      warning: { main: '#f59e0b' },
      error: { main: '#ef4444' },
      background: {
        default: isDark ? '#0f172a' : '#f5f7fb',
        paper: isDark ? '#1e293b' : '#ffffff',
      },
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      h4: { fontWeight: 700 },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 10 } },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            boxShadow: isDark
              ? '0 4px 24px rgba(0,0,0,0.4)'
              : '0 4px 24px rgba(99,102,241,0.08)',
          },
        },
      },
      MuiPaper: { styleOverrides: { rounded: { borderRadius: 16 } } },
    },
  });
}

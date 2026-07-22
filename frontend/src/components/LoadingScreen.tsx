import { Box, CircularProgress, Typography } from '@mui/material';

export default function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <Box
      className="app-gradient"
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <CircularProgress />
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

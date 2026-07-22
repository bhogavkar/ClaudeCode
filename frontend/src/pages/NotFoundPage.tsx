import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';

export default function NotFoundPage() {
  return (
    <Box className="app-gradient" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Stack spacing={2} alignItems="center">
        <Typography variant="h1" fontWeight={900} sx={{ fontSize: 96 }}>
          404
        </Typography>
        <Typography color="text.secondary">This page shuffled out of the deck.</Typography>
        <Button component={RouterLink} to="/dashboard" variant="contained">
          Back to dashboard
        </Button>
      </Stack>
    </Box>
  );
}

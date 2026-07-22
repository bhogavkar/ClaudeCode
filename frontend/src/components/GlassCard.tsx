import type { ReactNode } from 'react';
import { Box, type SxProps, type Theme } from '@mui/material';

/** Reusable glassmorphism surface (Tailwind `.glass` + rounded corners). */
export default function GlassCard({
  children,
  className = '',
  sx,
}: {
  children: ReactNode;
  className?: string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box className={`glass rounded-2xl ${className}`} sx={{ p: 3, ...sx }}>
      {children}
    </Box>
  );
}

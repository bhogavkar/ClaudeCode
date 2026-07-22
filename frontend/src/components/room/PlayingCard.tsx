import { Box, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import { cardLabel } from '@/utils/constants';

interface Props {
  value: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
}

/** A single estimation card. Lifts and glows when selected. */
export default function PlayingCard({ value, selected, disabled, onClick, size = 'md' }: Props) {
  const dims = size === 'md' ? { w: 68, h: 96, font: 26 } : { w: 48, h: 68, font: 18 };
  const isSpecial = ['?', 'COFFEE', 'BREAK'].includes(value);

  return (
    <motion.div
      whileHover={disabled ? undefined : { y: -10, scale: 1.05 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      animate={selected ? { y: -14 } : { y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
    >
      <Box
        role="button"
        aria-pressed={selected}
        aria-label={`Vote ${cardLabel(value)}`}
        tabIndex={disabled ? -1 : 0}
        onClick={disabled ? undefined : onClick}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick?.();
          }
        }}
        sx={{
          width: dims.w,
          height: dims.h,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled ? 'default' : 'pointer',
          userSelect: 'none',
          fontWeight: 800,
          color: selected ? '#fff' : isSpecial ? 'secondary.main' : 'primary.main',
          background: selected
            ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
            : (theme) => (theme.palette.mode === 'dark' ? 'rgba(30,41,59,0.9)' : '#fff'),
          border: (theme) =>
            `2px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
          boxShadow: selected ? '0 12px 30px rgba(99,102,241,0.45)' : '0 4px 12px rgba(0,0,0,0.1)',
          opacity: disabled && !selected ? 0.55 : 1,
          transition: 'box-shadow 0.2s, border-color 0.2s',
        }}
      >
        <Typography sx={{ fontSize: dims.font, fontWeight: 800 }}>{cardLabel(value)}</Typography>
      </Box>
    </motion.div>
  );
}

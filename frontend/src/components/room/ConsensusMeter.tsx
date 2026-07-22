import { Box, Stack, Typography } from '@mui/material';
import { motion } from 'framer-motion';

/** Circular gauge visualising consensus % with a color that shifts green as agreement rises. */
export default function ConsensusMeter({ value, confidence }: { value: number; confidence: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const hue = (clamped / 100) * 130; // 0 red -> 130 green
  const color = `hsl(${hue}, 75%, 45%)`;
  const size = 140;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <Stack alignItems="center" spacing={1}>
      <Box sx={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`Consensus ${clamped} percent`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth={stroke} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography variant="h4" fontWeight={800} sx={{ color }}>
            {clamped}%
          </Typography>
          <Typography variant="caption" color="text.secondary">
            consensus
          </Typography>
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Confidence score: {confidence}%
      </Typography>
    </Stack>
  );
}

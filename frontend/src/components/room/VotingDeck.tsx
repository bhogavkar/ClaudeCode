import { Box, Chip, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayingCard from './PlayingCard';
import { resolveScale } from '@/utils/constants';

interface Props {
  estimateScale: string;
  customScale: string[];
  myVote: string | null;
  disabled: boolean;
  onVote: (value: string) => void;
}

/** The fan of estimation cards the current member votes with. */
export default function VotingDeck({ estimateScale, customScale, myVote, disabled, onVote }: Props) {
  const cards = resolveScale(estimateScale, customScale);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="subtitle2" color="text.secondary">
          {disabled ? 'Voting is closed' : 'Pick your estimate'}
        </Typography>
        {myVote && (
          <Chip
            icon={<CheckCircleIcon />}
            color="success"
            size="small"
            label="Vote submitted — you can change it until reveal"
          />
        )}
      </Stack>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
        {cards.map((c) => (
          <PlayingCard
            key={c}
            value={c}
            selected={myVote === c}
            disabled={disabled}
            onClick={() => onVote(c)}
          />
        ))}
      </Box>
    </Box>
  );
}

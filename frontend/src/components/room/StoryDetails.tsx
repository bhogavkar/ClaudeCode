import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LockIcon from '@mui/icons-material/Lock';
import type { Story } from '@/types';
import { pokerApi } from '@/services/pokerApi';
import { cardLabel } from '@/utils/constants';

const COMPLEXITY_COLOR = { LOW: 'success', MEDIUM: 'warning', HIGH: 'error' } as const;

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Rich details for the story currently under estimation, with on-demand AI insight. */
export default function StoryDetails({ story }: { story: Story }) {
  const [showInsight, setShowInsight] = useState(false);
  const { data: insight, isFetching } = useQuery({
    queryKey: ['insight', story.id],
    queryFn: () => pokerApi.storyInsight(story.id),
    enabled: showInsight,
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        {story.jiraStoryId && <Chip size="small" color="primary" variant="outlined" label={story.jiraStoryId} />}
        <Chip size="small" label={story.type} />
        <Chip size="small" label={story.priority} variant="outlined" />
        {story.labels.map((l) => (
          <Chip key={l} size="small" label={l} sx={{ bgcolor: 'rgba(99,102,241,0.12)' }} />
        ))}
        {story.isLocked && (
          <Chip size="small" color="success" icon={<LockIcon />} label={`Locked · ${cardLabel(story.finalEstimate ?? '')}`} />
        )}
      </Stack>

      <Typography variant="h5" fontWeight={700}>
        {story.title}
      </Typography>

      <Stack spacing={1.5}>
        <Field label="Description" value={story.description} />
        <Field label="Acceptance criteria" value={story.acceptanceCriteria} />
        <Field label="Business rules" value={story.businessRules} />
        <Field label="Dependencies" value={story.dependencies} />
        <Field label="Risks" value={story.risks} />
      </Stack>

      <Divider />
      <Box>
        <Button
          size="small"
          startIcon={<AutoAwesomeIcon />}
          onClick={() => setShowInsight((v) => !v)}
          variant={showInsight ? 'contained' : 'outlined'}
        >
          {showInsight ? 'Hide AI insight' : 'AI complexity insight'}
        </Button>
        <Collapse in={showInsight} sx={{ mt: 1.5 }}>
          {isFetching && <Typography variant="body2">Analysing…</Typography>}
          {insight && (
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  size="small"
                  color={COMPLEXITY_COLOR[insight.complexity]}
                  label={`${insight.complexity} complexity (${insight.complexityScore}/100)`}
                />
                {insight.recommendedEstimate && (
                  <Chip size="small" variant="outlined" label={`Suggested: ${cardLabel(insight.recommendedEstimate)}`} />
                )}
              </Stack>
              {insight.detectedRisks.length > 0 && (
                <Typography variant="body2">
                  <strong>Risks:</strong> {insight.detectedRisks.join(', ')}
                </Typography>
              )}
              {insight.detectedDependencies.length > 0 && (
                <Typography variant="body2">
                  <strong>Dependencies:</strong> {insight.detectedDependencies.join(', ')}
                </Typography>
              )}
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {insight.rationale.map((r, i) => (
                  <li key={i}>
                    <Typography variant="body2" color="text.secondary">
                      {r}
                    </Typography>
                  </li>
                ))}
              </Box>
            </Stack>
          )}
        </Collapse>
      </Box>
    </Stack>
  );
}

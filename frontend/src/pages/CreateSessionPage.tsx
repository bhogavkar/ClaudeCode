import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import GlassCard from '@/components/GlassCard';
import { pokerApi, type CreateStoryPayload } from '@/services/pokerApi';
import { SCALE_OPTIONS, PRIORITY_OPTIONS, STORY_TYPE_OPTIONS } from '@/utils/constants';
import { useAppDispatch } from '@/store';
import { showToast } from '@/store/slices/uiSlice';

const emptyStory = (): CreateStoryPayload => ({
  title: '',
  jiraStoryId: '',
  description: '',
  acceptanceCriteria: '',
  businessRules: '',
  dependencies: '',
  risks: '',
  labels: [],
  priority: 'MEDIUM',
  type: 'STORY',
});

export default function CreateSessionPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sprintName: '',
    sprintGoal: '',
    estimateScale: 'FIBONACCI',
    customScale: '',
    autoReveal: false,
    scheduledAt: '',
  });
  const [stories, setStories] = useState<CreateStoryPayload[]>([emptyStory()]);

  const setField = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const setStory = (idx: number, key: keyof CreateStoryPayload, value: unknown) =>
    setStories((prev) => prev.map((s, i) => (i === idx ? { ...s, [key]: value } : s)));

  const submit = async () => {
    if (!form.sprintName.trim()) {
      dispatch(showToast({ message: 'Sprint name is required', severity: 'warning' }));
      return;
    }
    const validStories = stories.filter((s) => s.title.trim());
    setSaving(true);
    try {
      const session = await pokerApi.createSession({
        sprintName: form.sprintName,
        sprintGoal: form.sprintGoal || undefined,
        estimateScale: form.estimateScale,
        customScale:
          form.estimateScale === 'CUSTOM'
            ? form.customScale.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
        autoReveal: form.autoReveal,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        stories: validStories.map((s) => ({
          ...s,
          labels: typeof s.labels === 'string' ? (s.labels as string).split(',').map((l) => l.trim()).filter(Boolean) : s.labels,
        })),
      });
      dispatch(showToast({ message: `Session created — code ${session.code}`, severity: 'success' }));
      navigate(`/session/${session.code}`);
    } catch {
      dispatch(showToast({ message: 'Failed to create session', severity: 'error' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Create planning session</Typography>

      <GlassCard>
        <Typography variant="h6" gutterBottom>
          Sprint details
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField label="Sprint name" value={form.sprintName} onChange={(e) => setField('sprintName', e.target.value)} fullWidth required />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              select
              label="Estimate scale"
              value={form.estimateScale}
              onChange={(e) => setField('estimateScale', e.target.value)}
              fullWidth
            >
              {SCALE_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <TextField label="Sprint goal" value={form.sprintGoal} onChange={(e) => setField('sprintGoal', e.target.value)} fullWidth multiline rows={2} />
          </Grid>
          {form.estimateScale === 'CUSTOM' && (
            <Grid item xs={12}>
              <TextField
                label="Custom scale (comma separated)"
                placeholder="1, 2, 3, 5, 8"
                value={form.customScale}
                onChange={(e) => setField('customScale', e.target.value)}
                fullWidth
              />
            </Grid>
          )}
          <Grid item xs={12} md={6}>
            <TextField
              label="Scheduled at"
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => setField('scheduledAt', e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} md={6} sx={{ display: 'flex', alignItems: 'center' }}>
            <FormControlLabel
              control={<Switch checked={form.autoReveal} onChange={(e) => setField('autoReveal', e.target.checked)} />}
              label="Auto-reveal when everyone has voted"
            />
          </Grid>
        </Grid>
      </GlassCard>

      <GlassCard>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6">Stories ({stories.length})</Typography>
          <Button startIcon={<AddIcon />} onClick={() => setStories((p) => [...p, emptyStory()])}>
            Add story
          </Button>
        </Stack>
        <Stack spacing={1.5}>
          {stories.map((story, idx) => (
            <Accordion key={idx} defaultExpanded={idx === 0} disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                  <Chip size="small" label={`#${idx + 1}`} />
                  <Typography sx={{ flexGrow: 1 }}>{story.title || 'Untitled story'}</Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setStories((p) => p.filter((_, i) => i !== idx));
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={8}>
                    <TextField label="Story title" value={story.title} onChange={(e) => setStory(idx, 'title', e.target.value)} fullWidth required />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField label="Jira story ID" value={story.jiraStoryId} onChange={(e) => setStory(idx, 'jiraStoryId', e.target.value)} fullWidth />
                  </Grid>
                  <Grid item xs={6} md={4}>
                    <TextField select label="Priority" value={story.priority} onChange={(e) => setStory(idx, 'priority', e.target.value)} fullWidth>
                      {PRIORITY_OPTIONS.map((p) => (
                        <MenuItem key={p} value={p}>
                          {p}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={6} md={4}>
                    <TextField select label="Type" value={story.type} onChange={(e) => setStory(idx, 'type', e.target.value)} fullWidth>
                      {STORY_TYPE_OPTIONS.map((t) => (
                        <MenuItem key={t} value={t}>
                          {t}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      label="Labels (comma separated)"
                      value={Array.isArray(story.labels) ? story.labels.join(', ') : story.labels}
                      onChange={(e) => setStory(idx, 'labels', e.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField label="Description" value={story.description} onChange={(e) => setStory(idx, 'description', e.target.value)} fullWidth multiline rows={2} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField label="Acceptance criteria" value={story.acceptanceCriteria} onChange={(e) => setStory(idx, 'acceptanceCriteria', e.target.value)} fullWidth multiline rows={3} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField label="Business rules" value={story.businessRules} onChange={(e) => setStory(idx, 'businessRules', e.target.value)} fullWidth multiline rows={3} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField label="Dependencies" value={story.dependencies} onChange={(e) => setStory(idx, 'dependencies', e.target.value)} fullWidth multiline rows={2} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField label="Risks" value={story.risks} onChange={(e) => setStory(idx, 'risks', e.target.value)} fullWidth multiline rows={2} />
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          ))}
        </Stack>
      </GlassCard>

      <Divider />
      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <Button onClick={() => navigate('/dashboard')}>Cancel</Button>
        <Button variant="contained" size="large" onClick={submit} disabled={saving}>
          {saving ? 'Creating…' : 'Create session'}
        </Button>
      </Stack>
    </Stack>
  );
}

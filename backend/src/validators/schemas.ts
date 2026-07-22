import { z } from 'zod';

// ---- Auth ----
export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(80),
  password: z.string().min(8).max(128),
  role: z.enum(['ADMIN', 'SCRUM_MASTER', 'DEVELOPER', 'OBSERVER']).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ---- Stories ----
export const storySchema = z.object({
  jiraStoryId: z.string().max(64).optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(10_000).optional(),
  acceptanceCriteria: z.string().max(10_000).optional(),
  businessRules: z.string().max(10_000).optional(),
  dependencies: z.string().max(5_000).optional(),
  risks: z.string().max(5_000).optional(),
  labels: z.array(z.string().max(40)).max(20).optional(),
  priority: z.enum(['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHEST']).optional(),
  type: z.enum(['STORY', 'BUG', 'TASK', 'EPIC', 'SPIKE']).optional(),
});

// ---- Sessions ----
export const createSessionSchema = z.object({
  sprintName: z.string().min(1).max(120),
  sprintGoal: z.string().max(2_000).optional(),
  projectId: z.string().uuid().optional(),
  sprintId: z.string().uuid().optional(),
  estimateScale: z
    .enum(['FIBONACCI', 'MODIFIED_FIBONACCI', 'T_SHIRT', 'POWERS_OF_TWO', 'LINEAR', 'CUSTOM'])
    .optional(),
  customScale: z.array(z.string().max(10)).max(30).optional(),
  autoReveal: z.boolean().optional(),
  scheduledAt: z.string().datetime().optional(),
  stories: z.array(storySchema).max(100).optional(),
});

export const updateSessionSchema = z.object({
  sprintName: z.string().min(1).max(120).optional(),
  sprintGoal: z.string().max(2_000).optional(),
  autoReveal: z.boolean().optional(),
  scheduledAt: z.string().datetime().optional(),
});

export const joinSchema = z.object({
  role: z.enum(['SCRUM_MASTER', 'DEVELOPER', 'OBSERVER']).optional(),
});

// ---- Votes ----
export const castVoteSchema = z.object({
  roundId: z.string().uuid(),
  value: z.string().min(1).max(20),
});

export const lockSchema = z.object({
  finalEstimate: z.string().min(1).max(20),
});

// ---- Discussion ----
export const discussionSchema = z.object({
  roundId: z.string().uuid(),
  kind: z.enum(['RISK', 'DEPENDENCY', 'ASSUMPTION', 'DECISION', 'COMMENT']).optional(),
  content: z.string().min(1).max(5_000),
});

// ---- Pagination ----
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().max(100).optional(),
});

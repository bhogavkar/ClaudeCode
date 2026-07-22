import api from './api';
import type {
  ConsensusAdvice,
  DiscussionNote,
  Round,
  RoundPresence,
  RevealResult,
  Session,
  SessionStatus,
  Story,
  StoryInsight,
  StoryRoundState,
} from '@/types';

export interface CreateStoryPayload {
  jiraStoryId?: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  businessRules?: string;
  dependencies?: string;
  risks?: string;
  labels?: string[];
  priority?: string;
  type?: string;
}

export interface CreateSessionPayload {
  sprintName: string;
  sprintGoal?: string;
  estimateScale?: string;
  customScale?: string[];
  autoReveal?: boolean;
  scheduledAt?: string;
  stories?: CreateStoryPayload[];
}

export const pokerApi = {
  // Sessions
  listSessions: (status?: SessionStatus) =>
    api.get<{ sessions: Session[] }>('/sessions', { params: { status } }).then((r) => r.data.sessions),
  getSession: (id: string) => api.get<Session>(`/sessions/${id}`).then((r) => r.data),
  getSessionByCode: (code: string) =>
    api.get<Session>(`/sessions/code/${code}`).then((r) => r.data),
  createSession: (payload: CreateSessionPayload) =>
    api.post<Session>('/sessions', payload).then((r) => r.data),
  updateSession: (id: string, payload: Partial<CreateSessionPayload>) =>
    api.put<Session>(`/sessions/${id}`, payload).then((r) => r.data),
  deleteSession: (id: string) => api.delete(`/sessions/${id}`).then((r) => r.data),
  joinSession: (code: string, role?: string) =>
    api.post<{ session: Session }>(`/sessions/code/${code}/join`, { role }).then((r) => r.data.session),
  addStory: (sessionId: string, payload: CreateStoryPayload) =>
    api.post<Story>(`/sessions/${sessionId}/stories`, payload).then((r) => r.data),
  storyInsight: (storyId: string) =>
    api.get<StoryInsight>(`/sessions/stories/${storyId}/insight`).then((r) => r.data),

  // Voting
  getStoryRound: (storyId: string) =>
    api.get<StoryRoundState>(`/votes/stories/${storyId}/round`).then((r) => r.data),
  startRound: (storyId: string) =>
    api.post<Round>(`/sessions/stories/${storyId}/rounds`).then((r) => r.data),
  castVote: (roundId: string, value: string) =>
    api.post<RoundPresence>('/votes', { roundId, value }).then((r) => r.data),
  getPresence: (roundId: string) =>
    api.get<RoundPresence>(`/votes/rounds/${roundId}/presence`).then((r) => r.data),
  reveal: (roundId: string) =>
    api.post<RevealResult>(`/votes/rounds/${roundId}/reveal`).then((r) => r.data),
  getResults: (roundId: string) =>
    api.get<RevealResult>(`/votes/rounds/${roundId}/results`).then((r) => r.data),
  getConsensusAdvice: (roundId: string) =>
    api.get<ConsensusAdvice>(`/votes/rounds/${roundId}/consensus`).then((r) => r.data),
  lockStory: (storyId: string, finalEstimate: string) =>
    api.post<Story>(`/sessions/stories/${storyId}/lock`, { finalEstimate }).then((r) => r.data),

  // Discussion
  addDiscussion: (roundId: string, content: string, kind?: string) =>
    api.post<DiscussionNote>('/votes/discussion', { roundId, content, kind }).then((r) => r.data),
  listDiscussion: (roundId: string) =>
    api.get<{ notes: DiscussionNote[] }>(`/votes/rounds/${roundId}/discussion`).then((r) => r.data.notes),

  // Reports
  reportUrl: (sessionId: string, format: 'json' | 'csv') =>
    `/api/sessions/${sessionId}/report?format=${format}`,
  getReport: (sessionId: string) =>
    api.get(`/sessions/${sessionId}/report`).then((r) => r.data),

  // Jira
  jiraStatus: () =>
    api.get<{ connected: boolean; baseUrl: string | null }>('/integrations/jira/status').then((r) => r.data),
  jiraGetIssue: (issueKey: string) =>
    api.get(`/integrations/jira/issue/${issueKey}`).then((r) => r.data),
};

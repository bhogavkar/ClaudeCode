// Shared API/domain types. Mirror of the backend contract.

export type SystemRole = 'ADMIN' | 'SCRUM_MASTER' | 'DEVELOPER' | 'OBSERVER';
export type ParticipantRole = 'SCRUM_MASTER' | 'DEVELOPER' | 'OBSERVER';
export type SessionStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'VOTING'
  | 'REVEALED'
  | 'LOCKED'
  | 'COMPLETED'
  | 'ARCHIVED';
export type StoryPriority = 'LOWEST' | 'LOW' | 'MEDIUM' | 'HIGH' | 'HIGHEST';
export type StoryType = 'STORY' | 'BUG' | 'TASK' | 'EPIC' | 'SPIKE';
export type RoundStatus = 'OPEN' | 'REVEALED' | 'CLOSED';
export type DiscussionKind = 'RISK' | 'DEPENDENCY' | 'ASSUMPTION' | 'DECISION' | 'COMMENT';

export interface User {
  id: string;
  email: string;
  name: string;
  role: SystemRole;
  avatarUrl: string | null;
}

export interface Participant {
  id: string;
  userId: string;
  role: ParticipantRole;
  isOnline: boolean;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

export interface Story {
  id: string;
  sessionId: string;
  jiraStoryId: string | null;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  businessRules: string | null;
  dependencies: string | null;
  risks: string | null;
  labels: string[];
  priority: StoryPriority;
  type: StoryType;
  order: number;
  finalEstimate: string | null;
  isLocked: boolean;
  jiraStatus: string | null;
}

export interface Session {
  id: string;
  code: string;
  sprintName: string;
  sprintGoal: string | null;
  estimateScale: string;
  customScale: string[];
  autoReveal: boolean;
  status: SessionStatus;
  createdById: string;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; email: string; avatarUrl: string | null };
  stories: Story[];
  participants: Participant[];
}

export interface Round {
  id: string;
  storyId: string;
  roundNumber: number;
  status: RoundStatus;
  winnerEstimate: string | null;
}

export interface RoundPresence {
  roundId: string;
  roundNumber: number;
  status: RoundStatus;
  votedUserIds: string[];
  totalParticipants: number;
}

export interface RevealedVote {
  userId: string;
  name: string;
  avatarUrl: string | null;
  value: string;
  isOutlier: boolean;
}

export interface VoteStatistics {
  totalVotes: number;
  numericVotes: number;
  abstained: number;
  average: number | null;
  median: number | null;
  mode: string[] | null;
  majority: string | null;
  min: number | null;
  max: number | null;
  range: number | null;
  standardDeviation: number | null;
  consensusPercentage: number;
  confidenceScore: number;
  distribution: Record<string, number>;
  suggestedEstimate: string | null;
}

export interface RevealResult {
  roundId: string;
  roundNumber: number;
  votes: RevealedVote[];
  statistics: VoteStatistics;
}

export interface StoryInsight {
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  complexityScore: number;
  recommendedEstimate: string | null;
  detectedRisks: string[];
  detectedDependencies: string[];
  rationale: string[];
}

export interface ConsensusAdvice {
  hasConsensus: boolean;
  suggestion: string;
  outlierUserIds: string[];
  note: string;
}

export interface DiscussionNote {
  id: string;
  roundId: string;
  authorId: string;
  kind: DiscussionKind;
  content: string;
  createdAt: string;
}

export interface StoryRoundState {
  round: { id: string; roundNumber: number; status: RoundStatus; winnerEstimate: string | null } | null;
  presence: RoundPresence | null;
  results: RevealResult | null;
}

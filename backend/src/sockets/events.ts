/** Canonical Socket.IO event names shared by server and client. */
export const SocketEvents = {
  // client -> server
  JOIN_SESSION: 'session:join',
  LEAVE_SESSION: 'session:leave',
  VOTE_CAST: 'vote:cast',
  PING_PRESENCE: 'presence:ping',

  // server -> client
  USER_JOINED: 'user:joined',
  USER_LEFT: 'user:left',
  PRESENCE_UPDATE: 'presence:update',
  VOTE_SUBMITTED: 'vote:submitted', // a member voted (no value leaked)
  ROUND_STARTED: 'round:started',
  VOTES_REVEALED: 'votes:revealed',
  ROUND_CLOSED: 'round:closed',
  STORY_LOCKED: 'story:locked',
  SESSION_UPDATED: 'session:updated',
  DISCUSSION_ADDED: 'discussion:added',
  ERROR: 'error',
} as const;

export type ClientToServer = {
  [SocketEvents.JOIN_SESSION]: (payload: { sessionCode: string }) => void;
  [SocketEvents.LEAVE_SESSION]: (payload: { sessionCode: string }) => void;
  [SocketEvents.VOTE_CAST]: (payload: { roundId: string; value: string }) => void;
  [SocketEvents.PING_PRESENCE]: (payload: { sessionCode: string }) => void;
};

export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './api';

/** Canonical Socket.IO event names — must match backend/src/sockets/events.ts */
export const SocketEvents = {
  JOIN_SESSION: 'session:join',
  LEAVE_SESSION: 'session:leave',
  VOTE_CAST: 'vote:cast',
  PING_PRESENCE: 'presence:ping',
  USER_JOINED: 'user:joined',
  USER_LEFT: 'user:left',
  PRESENCE_UPDATE: 'presence:update',
  VOTE_SUBMITTED: 'vote:submitted',
  ROUND_STARTED: 'round:started',
  VOTES_REVEALED: 'votes:revealed',
  ROUND_CLOSED: 'round:closed',
  STORY_LOCKED: 'story:locked',
  SESSION_UPDATED: 'session:updated',
  DISCUSSION_ADDED: 'discussion:added',
  ERROR: 'error',
} as const;

let socket: Socket | null = null;

/**
 * Get (or lazily create) the shared socket. Auto-reconnect with backoff is
 * enabled so brief network drops recover transparently ("offline recovery").
 */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io('/', {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: getAccessToken() ?? '' }),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { verifyAccessToken } from '../utils/jwt';
import { SocketEvents, sessionRoom } from './events';
import * as sessionService from '../services/session.service';
import * as voteService from '../services/vote.service';

let io: Server | null = null;

interface SocketUser {
  id: string;
  name: string;
  email: string;
}

/** Initialise the Socket.IO server and wire up presence + voting handlers. */
export function initSockets(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    // Ping/pong tuned for prompt disconnect detection and reconnection.
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });

  // JWT handshake auth. Reject sockets without a valid access token.
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.headers.authorization?.replace('Bearer ', ''));
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = verifyAccessToken(token);
      (socket.data as { user: SocketUser }).user = {
        id: payload.sub,
        name: payload.name,
        email: payload.email,
      };
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket.data as { user: SocketUser }).user;
    logger.debug({ socketId: socket.id, userId: user.id }, 'Socket connected');

    socket.on(SocketEvents.JOIN_SESSION, async ({ sessionCode }: { sessionCode: string }) => {
      try {
        const session = await sessionService.getSessionByCode(sessionCode);
        const participant = await sessionService.joinSession(session.id, user.id);
        socket.join(sessionRoom(session.id));
        (socket.data as Record<string, unknown>).sessionId = session.id;

        io?.to(sessionRoom(session.id)).emit(SocketEvents.USER_JOINED, {
          user: { id: user.id, name: user.name },
          participant,
        });
        await broadcastPresence(session.id);
      } catch (err) {
        logger.warn({ err }, 'join session failed');
        socket.emit(SocketEvents.ERROR, { message: 'Unable to join session' });
      }
    });

    socket.on(SocketEvents.VOTE_CAST, async ({ roundId, value }: { roundId: string; value: string }) => {
      try {
        const presence = await voteService.castVote(roundId, user.id, value);
        const sessionId = (socket.data as { sessionId?: string }).sessionId;
        if (sessionId) {
          // Broadcast only that *someone* voted — never the value itself.
          io?.to(sessionRoom(sessionId)).emit(SocketEvents.VOTE_SUBMITTED, {
            userId: user.id,
            presence,
          });
        }
      } catch (err) {
        logger.warn({ err }, 'vote cast failed');
        socket.emit(SocketEvents.ERROR, { message: 'Unable to submit vote' });
      }
    });

    socket.on(SocketEvents.PING_PRESENCE, async ({ sessionCode }: { sessionCode: string }) => {
      try {
        const session = await sessionService.getSessionByCode(sessionCode);
        await sessionService.setParticipantOnline(session.id, user.id, true);
      } catch {
        /* ignore */
      }
    });

    socket.on('disconnect', async () => {
      const sessionId = (socket.data as { sessionId?: string }).sessionId;
      if (sessionId) {
        await sessionService.setParticipantOnline(sessionId, user.id, false).catch(() => undefined);
        io?.to(sessionRoom(sessionId)).emit(SocketEvents.USER_LEFT, { userId: user.id });
        await broadcastPresence(sessionId);
      }
      logger.debug({ socketId: socket.id }, 'Socket disconnected');
    });
  });

  return io;
}

async function broadcastPresence(sessionId: string): Promise<void> {
  const session = await sessionService.getSessionById(sessionId).catch(() => null);
  if (!session) return;
  io?.to(sessionRoom(sessionId)).emit(SocketEvents.PRESENCE_UPDATE, {
    participants: session.participants.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      avatarUrl: p.user.avatarUrl,
      role: p.role,
      isOnline: p.isOnline,
    })),
  });
}

/** Emit a domain event to every client in a session room. Safe no-op pre-init. */
export function emitToSession(sessionId: string, event: string, payload: unknown): void {
  io?.to(sessionRoom(sessionId)).emit(event, payload);
}

export function getIo(): Server {
  if (!io) throw new Error('Socket.IO not initialised');
  return io;
}

// Re-export the shape used by the client & suppress unused-socket lint noise.
export type { Socket };

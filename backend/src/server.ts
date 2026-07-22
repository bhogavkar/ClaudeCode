import { createServer } from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { initSockets } from './sockets';

/**
 * Composition root: build the HTTP server, attach Socket.IO, and start
 * listening. Handles graceful shutdown so in-flight work drains cleanly.
 */
async function bootstrap(): Promise<void> {
  const app = createApp();
  const httpServer = createServer(app);
  initSockets(httpServer);

  httpServer.listen(env.port, () => {
    logger.info(`🃏 Planning Poker API listening on :${env.port} (${env.nodeEnv})`);
    logger.info(`📚 API docs at http://localhost:${env.port}/api/docs`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down...`);
    httpServer.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal error during bootstrap');
  process.exit(1);
});

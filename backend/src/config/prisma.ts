import { PrismaClient } from '@prisma/client';
import { env } from './env';

/**
 * Single shared PrismaClient. A module-level singleton avoids exhausting the
 * Postgres connection pool during hot-reload in development.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProd ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!env.isProd) globalForPrisma.prisma = prisma;

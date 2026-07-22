import pino from 'pino';
import { env } from './env';

/**
 * Structured JSON logger. In development it pretty-prints; in production it
 * emits newline-delimited JSON suitable for log aggregation (ELK, Loki, etc.).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (env.isProd ? 'info' : 'debug'),
  transport: env.isProd
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1 }, // stdout
      },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash'],
    remove: true,
  },
});

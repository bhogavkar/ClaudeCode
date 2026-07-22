import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { logger } from './config/logger';
import { openApiSpec } from './config/swagger';
import { apiLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes';

/**
 * Build the Express application. Security, parsing and observability middleware
 * are applied before the API router; the 404 + error handlers are applied last.
 */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1); // behind NGINX / load balancer

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: env.isProd ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS (credentials for httpOnly refresh cookie)
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  // Rate limiting for the whole API surface
  app.use('/api', apiLimiter);

  // API documentation
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Planning Poker API' }));
  app.get('/api/docs.json', (_req, res) => res.json(openApiSpec));

  // API routes
  app.use('/api', routes);

  // Fallthrough handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

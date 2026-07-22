import { Router } from 'express';
import authRoutes from './auth.routes';
import sessionRoutes from './session.routes';
import voteRoutes from './vote.routes';
import userRoutes from './user.routes';
import integrationRoutes from './integration.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'planning-poker-api', time: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/sessions', sessionRoutes);
router.use('/votes', voteRoutes);
router.use('/users', userRoutes);
router.use('/integrations', integrationRoutes);

export default router;

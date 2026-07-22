import { Router } from 'express';
import * as sessionController from '../controllers/session.controller';
import * as voteController from '../controllers/vote.controller';
import * as reportController from '../controllers/report.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createSessionSchema,
  updateSessionSchema,
  joinSchema,
  storySchema,
  lockSchema,
} from '../validators/schemas';

const router = Router();
router.use(authenticate);

// Session CRUD
router.post(
  '/',
  requireRole('ADMIN', 'SCRUM_MASTER'),
  validate({ body: createSessionSchema }),
  asyncHandler(sessionController.create),
);
router.get('/', asyncHandler(sessionController.list));
router.get('/code/:code', asyncHandler(sessionController.getByCode));
router.post('/code/:code/join', validate({ body: joinSchema }), asyncHandler(sessionController.join));
router.get('/:id', asyncHandler(sessionController.getById));
router.put(
  '/:id',
  requireRole('ADMIN', 'SCRUM_MASTER'),
  validate({ body: updateSessionSchema }),
  asyncHandler(sessionController.update),
);
router.delete('/:id', requireRole('ADMIN', 'SCRUM_MASTER'), asyncHandler(sessionController.remove));

// Stories
router.post(
  '/:id/stories',
  requireRole('ADMIN', 'SCRUM_MASTER'),
  validate({ body: storySchema }),
  asyncHandler(sessionController.addStory),
);
router.get('/stories/:storyId/insight', asyncHandler(sessionController.storyInsight));

// Voting lifecycle (per-session Scrum-Master check happens in the controller)
router.post('/stories/:storyId/rounds', asyncHandler(voteController.startRound));
router.post('/stories/:storyId/lock', validate({ body: lockSchema }), asyncHandler(voteController.lock));

// Reports
router.get('/:id/report', asyncHandler(reportController.sessionReport));

export default router;

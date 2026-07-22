import { Router } from 'express';
import * as voteController from '../controllers/vote.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { castVoteSchema, discussionSchema } from '../validators/schemas';

const router = Router();
router.use(authenticate);

router.post('/', validate({ body: castVoteSchema }), asyncHandler(voteController.castVote));
router.get('/stories/:storyId/round', asyncHandler(voteController.storyRoundState));
router.get('/rounds/:roundId/presence', asyncHandler(voteController.getPresence));
router.post('/rounds/:roundId/reveal', asyncHandler(voteController.reveal));
router.get('/rounds/:roundId/results', asyncHandler(voteController.results));
router.get('/rounds/:roundId/consensus', asyncHandler(voteController.consensusAdvice));

// Discussion notes
router.post('/discussion', validate({ body: discussionSchema }), asyncHandler(voteController.addDiscussion));
router.get('/rounds/:roundId/discussion', asyncHandler(voteController.listDiscussions));

export default router;

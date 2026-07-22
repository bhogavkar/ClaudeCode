import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { paginationSchema } from '../validators/schemas';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

router.get('/', validate({ query: paginationSchema }), asyncHandler(userController.list));
router.get('/:id', asyncHandler(userController.getOne));
router.patch('/:id/role', asyncHandler(userController.updateRole));
router.patch('/:id/active', asyncHandler(userController.setActive));

export default router;

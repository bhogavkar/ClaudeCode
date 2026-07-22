import { Router } from 'express';
import * as integrationController from '../controllers/integration.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate);

// Jira
router.get('/jira/status', asyncHandler(integrationController.jiraStatus));
router.get('/jira/issue/:issueKey', asyncHandler(integrationController.jiraGetIssue));
router.get('/jira/sprint/:sprintId/issues', asyncHandler(integrationController.jiraSprintIssues));
router.put('/jira/issue/:issueKey/points', requireRole('ADMIN', 'SCRUM_MASTER'), asyncHandler(integrationController.jiraUpdatePoints));
router.post('/jira/issue/:issueKey/comment', requireRole('ADMIN', 'SCRUM_MASTER'), asyncHandler(integrationController.jiraAddComment));

// Notifications
router.get('/notifications', asyncHandler(integrationController.listNotifications));
router.post('/notifications/read', asyncHandler(integrationController.markNotificationsRead));

export default router;

import type { Request, Response } from 'express';
import * as jiraService from '../services/jira.service';
import * as notificationService from '../services/notification.service';
import { env } from '../config/env';

// ---- Jira ----
export async function jiraStatus(_req: Request, res: Response): Promise<void> {
  res.json({ connected: env.jira.enabled, baseUrl: env.jira.enabled ? env.jira.baseUrl : null });
}

export async function jiraGetIssue(req: Request, res: Response): Promise<void> {
  const issue = await jiraService.fetchIssue(req.params.issueKey);
  res.json(issue);
}

export async function jiraSprintIssues(req: Request, res: Response): Promise<void> {
  const issues = await jiraService.fetchSprintIssues(
    String(req.query.boardId ?? ''),
    req.params.sprintId,
  );
  res.json({ issues });
}

export async function jiraUpdatePoints(req: Request, res: Response): Promise<void> {
  await jiraService.updateStoryPoints(req.params.issueKey, Number(req.body.points));
  res.status(204).send();
}

export async function jiraAddComment(req: Request, res: Response): Promise<void> {
  await jiraService.addComment(req.params.issueKey, String(req.body.comment));
  res.status(204).send();
}

// ---- Notifications ----
export async function listNotifications(req: Request, res: Response): Promise<void> {
  const notifications = await notificationService.listNotifications(req.user!.id);
  res.json({ notifications });
}

export async function markNotificationsRead(req: Request, res: Response): Promise<void> {
  await notificationService.markAllRead(req.user!.id);
  res.status(204).send();
}

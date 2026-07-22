import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Notification fan-out. Persists an in-app notification and best-effort pushes
 * to configured outbound channels (Slack / Teams incoming webhooks). Channels
 * that are not configured are skipped silently.
 */
export async function notifyUser(params: {
  userId: string;
  type: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      metadata: params.metadata as object | undefined,
    },
  });
}

export async function listNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
}

/** Broadcast a short message to Slack, if a webhook is configured. */
export async function pushToSlack(text: string): Promise<void> {
  if (!env.notifications.slackWebhookUrl) return;
  try {
    await fetch(env.notifications.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    logger.warn({ err }, 'Slack notification failed');
  }
}

/** Broadcast a short message to Microsoft Teams, if a webhook is configured. */
export async function pushToTeams(text: string): Promise<void> {
  if (!env.notifications.teamsWebhookUrl) return;
  try {
    await fetch(env.notifications.teamsWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    logger.warn({ err }, 'Teams notification failed');
  }
}

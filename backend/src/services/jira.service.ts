import { env } from '../config/env';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';

/**
 * Jira Cloud integration via the REST v3 API using Basic auth (email + API
 * token). Every method degrades gracefully: if Jira is not configured the
 * service throws a clear 400 so the feature can be surfaced as "not connected"
 * in the UI rather than crashing the request.
 */

function authHeader(): string {
  const creds = Buffer.from(`${env.jira.email}:${env.jira.apiToken}`).toString('base64');
  return `Basic ${creds}`;
}

function ensureConfigured(): void {
  if (!env.jira.enabled) {
    throw ApiError.badRequest('Jira integration is not configured on this server');
  }
}

async function jiraFetch<T>(path: string, init?: RequestInit): Promise<T> {
  ensureConfigured();
  const res = await fetch(`${env.jira.baseUrl}/rest/api/3${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    logger.warn({ status: res.status, path, body }, 'Jira API error');
    throw new ApiError(res.status === 404 ? 404 : 502, `Jira API error (${res.status})`);
  }
  return (await res.json()) as T;
}

export interface JiraIssue {
  key: string;
  summary: string;
  description: string | null;
  status: string;
  issueType: string;
  priority: string | null;
  storyPoints: number | null;
  labels: string[];
}

interface RawJiraIssue {
  key: string;
  fields: Record<string, any>;
}

function mapIssue(raw: RawJiraIssue): JiraIssue {
  const f = raw.fields;
  return {
    key: raw.key,
    summary: f.summary ?? '',
    description: typeof f.description === 'string' ? f.description : null,
    status: f.status?.name ?? 'Unknown',
    issueType: f.issuetype?.name ?? 'Story',
    priority: f.priority?.name ?? null,
    // customfield_10016 is the default Story Points field in Jira Cloud.
    storyPoints: f.customfield_10016 ?? null,
    labels: f.labels ?? [],
  };
}

export async function fetchIssue(issueKey: string): Promise<JiraIssue> {
  const raw = await jiraFetch<RawJiraIssue>(`/issue/${encodeURIComponent(issueKey)}`);
  return mapIssue(raw);
}

export async function fetchSprintIssues(boardId: string, sprintId: string): Promise<JiraIssue[]> {
  ensureConfigured();
  const res = await fetch(
    `${env.jira.baseUrl}/rest/agile/1.0/sprint/${sprintId}/issue`,
    { headers: { Authorization: authHeader(), Accept: 'application/json' } },
  );
  if (!res.ok) throw new ApiError(502, `Jira sprint fetch failed (${res.status})`);
  const data = (await res.json()) as { issues: RawJiraIssue[] };
  void boardId;
  return data.issues.map(mapIssue);
}

export async function updateStoryPoints(issueKey: string, points: number): Promise<void> {
  await jiraFetch(`/issue/${encodeURIComponent(issueKey)}`, {
    method: 'PUT',
    body: JSON.stringify({ fields: { customfield_10016: points } }),
  });
}

export async function addComment(issueKey: string, comment: string): Promise<void> {
  await jiraFetch(`/issue/${encodeURIComponent(issueKey)}/comment`, {
    method: 'POST',
    body: JSON.stringify({
      body: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: comment }] }],
      },
    }),
  });
}

export async function transitionIssue(issueKey: string, transitionId: string): Promise<void> {
  await jiraFetch(`/issue/${encodeURIComponent(issueKey)}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ transition: { id: transitionId } }),
  });
}

import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralised, validated environment access. Importing this module fails fast
 * (throws at boot) when a required variable is missing, so the rest of the code
 * base can treat `env` values as guaranteed-present.
 */
function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd,
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: optional('CORS_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  databaseUrl: required('DATABASE_URL', 'postgresql://poker:poker@localhost:5432/planning_poker'),

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', isProd ? undefined : 'dev-access-secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', isProd ? undefined : 'dev-refresh-secret'),
    accessTtl: optional('JWT_ACCESS_TTL', '15m'),
    refreshTtl: optional('JWT_REFRESH_TTL', '7d'),
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
  },

  azureAd: {
    tenantId: optional('AZURE_AD_TENANT_ID'),
    clientId: optional('AZURE_AD_CLIENT_ID'),
    clientSecret: optional('AZURE_AD_CLIENT_SECRET'),
    enabled: Boolean(process.env.AZURE_AD_CLIENT_ID),
  },
  google: {
    clientId: optional('GOOGLE_CLIENT_ID'),
    clientSecret: optional('GOOGLE_CLIENT_SECRET'),
    enabled: Boolean(process.env.GOOGLE_CLIENT_ID),
  },
  jira: {
    baseUrl: optional('JIRA_BASE_URL'),
    email: optional('JIRA_EMAIL'),
    apiToken: optional('JIRA_API_TOKEN'),
    enabled: Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_API_TOKEN),
  },
  notifications: {
    slackWebhookUrl: optional('SLACK_WEBHOOK_URL'),
    teamsWebhookUrl: optional('TEAMS_WEBHOOK_URL'),
    smtpUrl: optional('SMTP_URL'),
  },
} as const;

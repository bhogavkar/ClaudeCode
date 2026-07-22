/**
 * Hand-authored OpenAPI 3.0 document. Kept intentionally lightweight (no build
 * step / decorators) and served at /api/docs via swagger-ui-express.
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Planning Poker API',
    version: '1.0.0',
    description:
      'Real-time Agile estimation platform: sessions, anonymous voting, reveal, statistics, rounds, reports and Jira integration.',
  },
  servers: [{ url: '/api', description: 'API root' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Credentials: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string' }, password: { type: 'string' } },
      },
      CastVote: {
        type: 'object',
        required: ['roundId', 'value'],
        properties: { roundId: { type: 'string' }, value: { type: 'string', example: '8' } },
      },
      Lock: {
        type: 'object',
        required: ['finalEstimate'],
        properties: { finalEstimate: { type: 'string', example: '8' } },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': { get: { summary: 'Health check', security: [], responses: { 200: { description: 'OK' } } } },
    '/auth/register': { post: { summary: 'Register', security: [], responses: { 201: { description: 'Created' } } } },
    '/auth/login': {
      post: {
        summary: 'Login',
        security: [],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Credentials' } } } },
        responses: { 200: { description: 'Access token + user' } },
      },
    },
    '/auth/refresh': { post: { summary: 'Rotate refresh token', security: [], responses: { 200: { description: 'New access token' } } } },
    '/auth/logout': { post: { summary: 'Logout', responses: { 204: { description: 'No content' } } } },
    '/auth/me': { get: { summary: 'Current user', responses: { 200: { description: 'User' } } } },

    '/sessions': {
      get: { summary: 'List my sessions', responses: { 200: { description: 'Sessions' } } },
      post: { summary: 'Create session (Scrum Master/Admin)', responses: { 201: { description: 'Created' } } },
    },
    '/sessions/{id}': {
      get: { summary: 'Get session', responses: { 200: { description: 'Session' } } },
      put: { summary: 'Update session', responses: { 200: { description: 'Updated' } } },
      delete: { summary: 'Delete session', responses: { 204: { description: 'Deleted' } } },
    },
    '/sessions/code/{code}': { get: { summary: 'Get session by join code', responses: { 200: { description: 'Session' } } } },
    '/sessions/code/{code}/join': { post: { summary: 'Join a session', responses: { 200: { description: 'Joined' } } } },
    '/sessions/{id}/stories': { post: { summary: 'Add a story', responses: { 201: { description: 'Created' } } } },
    '/sessions/stories/{storyId}/rounds': { post: { summary: 'Start a voting round', responses: { 201: { description: 'Round' } } } },
    '/sessions/stories/{storyId}/lock': {
      post: {
        summary: 'Lock the final estimate',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Lock' } } } },
        responses: { 200: { description: 'Story' } },
      },
    },
    '/sessions/stories/{storyId}/insight': { get: { summary: 'AI story insight', responses: { 200: { description: 'Insight' } } } },
    '/sessions/{id}/report': { get: { summary: 'Export report (json|csv)', responses: { 200: { description: 'Report' } } } },

    '/votes': {
      post: {
        summary: 'Cast/change a vote',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CastVote' } } } },
        responses: { 200: { description: 'Presence' } },
      },
    },
    '/votes/rounds/{roundId}/presence': { get: { summary: 'Who has voted (values hidden)', responses: { 200: { description: 'Presence' } } } },
    '/votes/rounds/{roundId}/reveal': { post: { summary: 'Reveal votes (Scrum Master)', responses: { 200: { description: 'Reveal result' } } } },
    '/votes/rounds/{roundId}/results': { get: { summary: 'Revealed results', responses: { 200: { description: 'Results' } } } },
    '/votes/rounds/{roundId}/consensus': { get: { summary: 'AI consensus advice', responses: { 200: { description: 'Advice' } } } },
    '/votes/discussion': { post: { summary: 'Add a discussion note', responses: { 201: { description: 'Note' } } } },

    '/users': { get: { summary: 'List users (Admin)', responses: { 200: { description: 'Users' } } } },
    '/integrations/jira/status': { get: { summary: 'Jira connection status', responses: { 200: { description: 'Status' } } } },
  },
} as const;

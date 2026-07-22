# Installation Guide

## Prerequisites

- **Node.js 20+** and npm 10+
- **PostgreSQL 14+** (or Docker)
- Optionally **Docker** + **Docker Compose**

---

## Option A — Docker Compose (fastest)

```bash
docker compose up --build
docker compose exec backend npm run seed   # sample data (run once)
```

| Service | URL |
| --- | --- |
| Web (NGINX + SPA) | http://localhost:8080 |
| API | http://localhost:4000 |
| API docs (Swagger) | http://localhost:4000/api/docs |
| PostgreSQL | localhost:5432 (poker/poker) |

Override secrets via env vars or a root `.env`:

```env
JWT_ACCESS_SECRET=<openssl rand -hex 48>
JWT_REFRESH_SECRET=<openssl rand -hex 48>
CORS_ORIGIN=http://localhost:8080
```

---

## Option B — Local development

### 1. Database

Use the compose `db` service (`docker compose up db`) or a local PostgreSQL. Create a
database named `planning_poker`.

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit DATABASE_URL and the JWT secrets in .env
npm install
npx prisma generate
npx prisma migrate dev --name init   # creates tables (or: npx prisma db push)
npm run seed                         # sample users + demo session
npm run dev                          # starts on :4000 with hot reload
```

Useful backend scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server (tsx watch) |
| `npm run build` / `npm start` | Compile & run production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run seed` | Seed sample data |

### 3. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The Vite dev server proxies `/api` and `/socket.io` to `http://localhost:4000`
(see `vite.config.ts`), so no CORS setup is needed in development.

---

## Environment variables (backend)

See `backend/.env.example` for the full list. The important ones:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ✅ (prod) | Generate with `openssl rand -hex 48` |
| `CORS_ORIGIN` | ✅ | Comma-separated allowed browser origins |
| `AZURE_AD_*`, `GOOGLE_*` | optional | SSO providers |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | optional | Jira Cloud integration |
| `SLACK_WEBHOOK_URL`, `TEAMS_WEBHOOK_URL` | optional | Outbound notifications |

---

## Troubleshooting

- **`Missing required environment variable`** at boot → set the JWT secrets and `DATABASE_URL`.
- **Prisma "table does not exist"** → run `npx prisma migrate dev` or `npx prisma db push`.
- **WebSocket won't connect in dev** → ensure the backend is on `:4000`; the Vite proxy expects that port.

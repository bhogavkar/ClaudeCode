# 🃏 Planning Poker — Enterprise Agile Estimation Platform

A production-grade, real-time **Scrum Planning Poker** application. Teams estimate
Jira stories together with **anonymous voting**, **live collaboration over WebSockets**,
rich **statistics & analytics**, multi-round re-voting, discussion capture, AI-assisted
insights and one-click report export.

> Votes stay hidden until the Scrum Master reveals them — keeping estimates unbiased —
> then the platform computes averages, consensus, outliers and charts instantly.

---

## ✨ Features

| Area | What's included |
| --- | --- |
| **Real-time estimation** | Socket.IO rooms, live presence, "vote submitted" indicators, auto-reconnect / offline recovery |
| **Anonymous voting** | Votes stored immediately, values hidden until reveal, changeable until reveal |
| **Reveal & analytics** | Average, median, mode, majority, min/max, range, std-dev, **consensus %**, **confidence score**, distribution — with bar/pie charts and a consensus meter |
| **Multiple rounds** | Unlimited re-votes per story, each round stored with votes, notes, timestamps, winner |
| **Discussion notes** | Capture risks, dependencies, assumptions, decisions and comments per round |
| **AI assistance** (heuristic, offline) | Story complexity detection, risk/dependency detection, recommended estimate, outlier detection, consensus suggestion, EWMA velocity prediction |
| **Auth & RBAC** | JWT access tokens + rotating refresh tokens (httpOnly cookie), roles: Admin / Scrum Master / Developer / Observer |
| **Sessions** | Create with full story metadata, shareable join codes, custom estimate scales |
| **Reports** | Export **PDF / Excel / CSV / JSON** |
| **Jira Cloud** | Fetch issue/sprint, update story points, add comments, transition workflow |
| **Security** | Helmet, CORS, rate limiting, Zod input validation, bcrypt hashing, audit log (who/when/IP/device), Prisma parameterized queries |
| **UI/UX** | React 19 + MUI + Tailwind glassmorphism, dark/light mode, Framer Motion, responsive, keyboard & ARIA accessible |
| **Ops** | Docker, Docker Compose, Kubernetes manifests + HPA, NGINX, GitHub Actions CI/CD, Swagger docs, seed data |

See **[FEATURES.md](docs/FEATURES.md)** for the full requirement-by-requirement status matrix
(what is fully implemented vs. scaffolded for extension).

---

## 🏗️ Architecture

```
┌──────────────┐      HTTPS / WSS      ┌───────────────────────────┐
│  React SPA   │  ───────────────────► │  Express API + Socket.IO  │
│ (Vite+MUI)   │  ◄─────────────────── │  (TypeScript, clean arch) │
└──────────────┘                        └────────────┬──────────────┘
      │ served by NGINX                               │ Prisma ORM
      ▼                                                ▼
   static assets                                ┌────────────┐
                                                │ PostgreSQL │
                                                └────────────┘
```

**Clean, layered backend**: `routes → controllers → services → prisma`.
Cross-cutting concerns (auth, RBAC, validation, rate-limiting, audit, error handling)
live in middleware. Pure domain logic (statistics, estimation scales, AI heuristics)
is isolated and unit-tested.

Tech: **React 19 · TypeScript · MUI · Tailwind · Redux Toolkit · React Query · Framer Motion · Chart.js · Node · Express · Socket.IO · Prisma · PostgreSQL · Zod · JWT · Docker · Kubernetes**.

```
.
├── backend/     # Express + Socket.IO + Prisma API
├── frontend/    # React 19 + Vite SPA
├── k8s/         # Kubernetes manifests (namespace, db, api, web, ingress, HPA)
├── docs/        # Installation, deployment, features, architecture
├── docker-compose.yml
└── .github/workflows/ci.yml
```

---

## 🚀 Quick start (Docker Compose)

```bash
git clone <repo> && cd <repo>
docker compose up --build
# API   → http://localhost:4000  (docs at /api/docs)
# Web   → http://localhost:8080
docker compose exec backend npm run seed   # load sample users + demo session
```

## 🧑‍💻 Quick start (local dev)

```bash
# 1) Postgres (or use the compose db service)
# 2) Backend
cd backend
cp .env.example .env          # edit secrets / DATABASE_URL
npm install
npx prisma generate
npx prisma migrate dev --name init   # or: npx prisma db push
npm run seed
npm run dev                   # http://localhost:4000

# 3) Frontend (new terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxies /api + /socket.io)
```

Full details: **[docs/INSTALLATION.md](docs/INSTALLATION.md)**.

---

## 👤 Sample accounts (after seeding)

All sample users share the password **`Password123!`**.

| Role | Email |
| --- | --- |
| Admin | `admin@planningpoker.dev` |
| Scrum Master | `scrum@planningpoker.dev` |
| Developer | `dev1@planningpoker.dev`, `dev2@…`, `dev3@…` |
| Observer | `observer@planningpoker.dev` |

The seed also creates a demo sprint with three stories and a completed voting round.
Or click **"Try the demo"** on the login page.

---

## 🎮 Session flow

1. **Login** → **Dashboard** (active/completed sessions, velocity, progress)
2. Scrum Master **creates a session** (sprint + stories + estimate scale) → gets a **join code**
3. Team **joins** via code → live presence roster
4. Scrum Master **starts voting** → members vote **anonymously** ("Vote submitted")
5. Scrum Master **reveals** → cards flip, statistics + charts + AI advice appear
6. Team **discusses**, optionally **re-votes** (new round)
7. Scrum Master **locks** the final estimate → story done
8. **Export** the report (PDF/Excel/CSV/JSON)

---

## 🔌 API

Interactive Swagger UI at **`/api/docs`** (spec at `/api/docs.json`).
Key endpoints: `POST /api/auth/login`, `POST /api/sessions`, `POST /api/votes`,
`POST /api/votes/rounds/:id/reveal`, `POST /api/sessions/stories/:id/lock`,
`GET /api/sessions/:id/report`.

---

## 🧪 Testing

```bash
cd backend && npm test        # Vitest unit tests (statistics + AI heuristics)
```

---

## 📦 Deployment

- **Docker Compose** for single-host / demo (above).
- **Kubernetes**: `kubectl apply -f k8s/` — Deployments, Services, Ingress (TLS),
  StatefulSet Postgres and an HPA sized for 500+ concurrent users.
  ⚠️ Multi-replica Socket.IO requires sticky sessions (configured in the Ingress) or
  the Socket.IO Redis adapter — see **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## 📄 License

MIT — see source headers. Built as a reference enterprise application.

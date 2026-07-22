# Feature Status Matrix

This document maps the requested scope onto what is **fully implemented and verified**,
what is **partially implemented / scaffolded** (interfaces present, ready to extend), and
what is **roadmap** (documented but not built). Honesty here is deliberate: the core
estimation experience is complete and tested; several enterprise integrations are
scaffolded with clean seams so they can be finished without rework.

Legend: ✅ done & working · 🟡 partial / scaffolded · ⬜ roadmap

## Core estimation
| Requirement | Status | Notes |
| --- | --- | --- |
| Anonymous voting (hidden until reveal) | ✅ | Values never leave the server pre-reveal; only presence is broadcast |
| Change vote before reveal | ✅ | `Vote` upsert while round is `OPEN` |
| Reveal (name, avatar, card) | ✅ | Scrum-Master–gated |
| Multiple rounds / re-vote | ✅ | Unlimited rounds per story, each persisted |
| Lock final estimate | ✅ | Auto-completes session when all stories locked |
| Estimation scales (Fibonacci, special cards, custom) | ✅ | Named scales + org custom scale |
| Statistics (avg, median, mode, majority, min/max, range, std-dev, consensus %, confidence) | ✅ | Pure module, **unit-tested** |
| Discussion notes (risk/dependency/assumption/decision/comment) | ✅ | Per round, live-broadcast |

## Real-time
| Requirement | Status | Notes |
| --- | --- | --- |
| Socket.IO join/left/vote-submitted/reveal/lock/session-updated/discussion | ✅ | JWT-authenticated handshake, room per session |
| Auto-reconnect / offline recovery | ✅ | Client reconnection with backoff; state re-hydrates on reconnect |
| Presence (online members) | ✅ | Live roster with online + voted indicators |

## Analytics & visuals
| Requirement | Status | Notes |
| --- | --- | --- |
| Bar chart, Pie chart | ✅ | Chart.js, accessible palette |
| Consensus meter | ✅ | Animated SVG gauge |
| Outlier detection | ✅ | >1σ from mean, flagged on reveal |
| Heat map, Voting timeline, Trend analysis | 🟡 | Data is available in reports/rounds; dedicated visuals not yet built |

## AI (heuristic, offline — no external model calls)
| Requirement | Status | Notes |
| --- | --- | --- |
| Complexity detection | ✅ | Text + risk-signal scoring, **unit-tested** |
| Risk / dependency detection | ✅ | Signal-word extraction |
| Recommended estimate | ✅ | Complexity mapped onto the scale |
| Outlier vote detection | ✅ | Statistical |
| Consensus suggestion | ✅ | With outlier call-outs |
| Historical velocity prediction | 🟡 | EWMA function implemented + tested; surfaced as avg velocity on dashboard, no dedicated analytics page |

> The AI layer is intentionally deterministic and explainable. Interfaces are shaped so a
> hosted LLM (Claude / Azure OpenAI) can be dropped in behind them without changing callers.

## Auth & security
| Requirement | Status | Notes |
| --- | --- | --- |
| JWT access + rotating refresh tokens | ✅ | Refresh stored hashed (sha256), httpOnly cookie |
| RBAC (Admin/Scrum Master/Developer/Observer) | ✅ | Global role middleware + per-session participant role checks |
| Helmet, CORS, rate limiting | ✅ | Global + stricter auth limiter |
| Input validation, SQL-injection & XSS protection | ✅ | Zod validation; Prisma parameterised queries |
| Password hashing | ✅ | bcrypt |
| Audit log (who/when/IP/device/action) | ✅ | Written for auth, session, vote, reveal, lock, export |
| CSRF protection | 🟡 | Refresh cookie is `SameSite=Lax`, scoped path; add a CSRF token if you move away from bearer-in-header for state changes |
| Azure AD / Entra ID / Google OAuth | 🟡 | `upsertSsoUser` service + env config present; OAuth redirect/callback flow (MSAL/passport) not wired |

## Integrations & notifications
| Requirement | Status | Notes |
| --- | --- | --- |
| Jira Cloud (fetch issue/sprint, update points, comment, transition) | 🟡 | Fully coded against Jira REST v3; requires credentials, not tested against a live tenant |
| In-app notifications | ✅ | Persisted; REST endpoints |
| Slack / Teams notifications | 🟡 | Webhook push implemented; not surfaced in UI |
| Browser / Email (SMTP) notifications | ⬜ | Env placeholders; not implemented |
| Calendar (Google / Outlook) | ⬜ | Roadmap |

## Dashboard & admin
| Requirement | Status | Notes |
| --- | --- | --- |
| Dashboard (active/completed/upcoming, velocity, progress) | ✅ | |
| Admin: manage users | 🟡 | Read/list UI built; role/disable endpoints exist, edit UI minimal |
| Admin: manage workspaces/projects | 🟡 | Data models + seed exist; management UI not built |

## Reports
| Requirement | Status | Notes |
| --- | --- | --- |
| JSON / CSV | ✅ | Server-generated |
| Excel / PDF | ✅ | Client-side (HTML-workbook `.xls`; print-to-PDF) — swap in `xlsx`/`pdfmake` for pixel-perfect output |

## UI / UX / a11y
| Requirement | Status | Notes |
| --- | --- | --- |
| Glassmorphism, Agile theme, dark/light | ✅ | |
| Responsive (desktop/tablet/mobile) | ✅ | CSS grid / flex layouts |
| Animations | ✅ | Framer Motion (card flips, transitions) |
| Keyboard nav / ARIA / screen-reader | ✅ | Cards are focusable buttons with `aria-pressed`; meters have `aria-label`. Full WCAG audit is roadmap |

## Ops
| Requirement | Status | Notes |
| --- | --- | --- |
| Docker + Docker Compose | ✅ | Multi-stage, non-root backend, healthchecks |
| Kubernetes manifests + HPA + Ingress | ✅ | Sticky sessions for Socket.IO |
| NGINX | ✅ | SPA + API/WS proxy |
| GitHub Actions CI/CD | ✅ | Lint/typecheck/test + image build/push |
| Swagger / OpenAPI | ✅ | `/api/docs` |
| Seed data / sample users / sample stories | ✅ | |

## Testing
| Requirement | Status | Notes |
| --- | --- | --- |
| Unit tests (statistics, AI) | ✅ | Vitest, 11 tests passing |
| Integration / Socket / E2E / load / security | ⬜ | Structure ready (`backend/tests`); suites not authored |

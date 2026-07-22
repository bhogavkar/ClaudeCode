# Deployment Guide

The platform ships as two container images (`backend`, `frontend`) plus PostgreSQL.

## Images

```bash
docker build -t planning-poker-backend ./backend
docker build -t planning-poker-frontend ./frontend
```

CI (`.github/workflows/ci.yml`) builds and pushes both to GHCR on every push to `main`:
`ghcr.io/<owner>/<repo>-backend` and `-frontend`.

---

## Kubernetes

Manifests live in `k8s/` and are numbered in apply order:

```bash
kubectl apply -f k8s/00-namespace.yaml
# Create real secrets (do NOT use the placeholder Secret in prod):
kubectl -n planning-poker create secret generic pp-secrets \
  --from-literal=DATABASE_URL='postgresql://poker:<pw>@pp-postgres:5432/planning_poker?schema=public' \
  --from-literal=JWT_ACCESS_SECRET=$(openssl rand -hex 48) \
  --from-literal=JWT_REFRESH_SECRET=$(openssl rand -hex 48) \
  --from-literal=POSTGRES_PASSWORD='<pw>'
kubectl apply -f k8s/01-config-secret.yaml   # ConfigMap only, if using real Secret above
kubectl apply -f k8s/02-postgres.yaml
kubectl apply -f k8s/03-backend.yaml
kubectl apply -f k8s/04-frontend.yaml
kubectl apply -f k8s/05-ingress.yaml
kubectl apply -f k8s/06-hpa.yaml
```

Set the image references in `03-backend.yaml` / `04-frontend.yaml` to your registry,
and the host in `05-ingress.yaml`.

### ⚠️ Scaling Socket.IO horizontally

With more than one backend replica, WebSocket events must reach clients connected to
*other* pods. Two supported approaches:

1. **Sticky sessions** (default): the Ingress pins a client to one pod via a cookie
   (`nginx.ingress.kubernetes.io/affinity: cookie`). Simple and correct for most teams.
2. **Redis adapter** (best for large scale): add `@socket.io/redis-adapter` and a Redis
   service so all pods share a pub/sub backplane. Wire it up in `backend/src/sockets/index.ts`:

   ```ts
   import { createAdapter } from '@socket.io/redis-adapter';
   import { createClient } from 'redis';
   const pub = createClient({ url: process.env.REDIS_URL });
   const sub = pub.duplicate();
   await Promise.all([pub.connect(), sub.connect()]);
   io.adapter(createAdapter(pub, sub));
   ```

### Database migrations

- The backend `initContainer` runs `prisma db push` for convenience.
- For controlled rollouts, replace it with a Kubernetes **Job** running
  `prisma migrate deploy` against committed migration files.

---

## Cloud notes

| Cloud | Managed Postgres | Container platform |
| --- | --- | --- |
| **Azure** | Azure Database for PostgreSQL | AKS / Container Apps |
| **AWS** | RDS / Aurora PostgreSQL | EKS / ECS Fargate |
| **OCI** | OCI Database with PostgreSQL | OKE |

Point `DATABASE_URL` at the managed instance, keep secrets in the cloud secret manager
(Azure Key Vault / AWS Secrets Manager / OCI Vault) surfaced via
[external-secrets](https://external-secrets.io/), and terminate TLS at the ingress/load balancer.

---

## Production checklist

- [ ] Strong, rotated `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- [ ] `CORS_ORIGIN` restricted to your web origin(s)
- [ ] TLS everywhere (`secure` cookies are enabled automatically when `NODE_ENV=production`)
- [ ] Managed PostgreSQL with backups
- [ ] Sticky sessions **or** Redis adapter for Socket.IO
- [ ] Log aggregation for the JSON logs (pino)
- [ ] Resource requests/limits + HPA tuned to load

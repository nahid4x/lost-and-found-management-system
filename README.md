# FindIt — Lost & Found, together

A secure, real-time lost-and-found platform: report lost/found items, get explainable AI-style match suggestions,
verify ownership privately, chat and call inside the app, and close the case. Built as six Node.js microservices
behind an Nginx gateway, with a React glassmorphism frontend.

> **Read `docs/SECURITY_AUDIT.md` first.** It lists exactly what was verified (and how), what was *not* run in the
> build environment, and the residual risks.

## Architecture

```
Browser ──HTTPS/WSS──▶ gateway (Nginx: TLS, rate limits, headers, admin pre-check, routing)   ← only published ports (80/443)
                         ├─ /            ─▶ frontend  (static React build, Nginx)
                         ├─ /api/auth    ─▶ auth      (accounts, sessions, admin users)        :4001
                         ├─ /api/items   ─▶ items     (reports, uploads, search, map, status)  :4002
                         ├─ /api/claims  ─▶ claims    (claims, proofs, decisions, AUDIT LOG)   :4004
                         ├─ /api/realtime, /socket.io ─▶ realtime (chat, presence, WebRTC signalling) :4005
                         └─ /api/notify  ─▶ notify    (in-app + email notifications)           :4006
                      matching :4003  — internal only, no public endpoint (scoring engine, event-driven)

MongoDB (one database + one least-privilege user per service) · Redis (events pub/sub, rate-limit store, presence, Socket.IO adapter)
```

* **Events** (`item.created`, `match.created`, `claim.approved`, …) flow over Redis pub/sub; services keep their own
  projections and never read another service's database. Event payloads contain no secrets and no message bodies.
* **Item status** (`open → matched → claimed → verified → returned → closed`) is owned by *Items* and driven by events,
  with actor + timestamp history. The **audit log** is owned by *Claims*, which aggregates `audit.record` events from every service.
* **Privacy by construction:** public item views only ever contain an ~1 km-rounded location. Exact location, "held at"
  and the finder's contact note go only to the owner, an admin, or the **approved claimant**. Verification questions are
  shown only to a signed-in non-owner claimant; correct answers are never stored.

## Quick start (Docker)

Requirements: Docker + Docker Compose v2, a free Cloudinary account (for image uploads).

```bash
./scripts/init-env.sh            # creates .env with freshly generated random secrets (refuses to overwrite)
$EDITOR .env                     # set CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET (and APP_URL, CORS_ORIGINS, SMTP_URL for real domains)
docker compose up --build        # gateway on https://localhost (self-signed dev certificate is generated)
```

Create the first admin (the password is supplied at run time and never written to a file):

```bash
docker compose run --rm -e ADMIN_EMAIL=you@example.com -e ADMIN_NAME="Your Name" -e ADMIN_PASSWORD='a-long-unique-passphrase' \
  auth node src/seed-admin.js
```

Open <https://localhost> (accept the dev certificate), register users, report items, and sign in as the admin for `/admin`.

Services **refuse to start** if a required variable is missing, a secret is shorter than 32 characters or still looks like
a placeholder (`CHANGE_ME`), or the refresh secret equals the access secret.

### Optional: calls behind strict NATs (TURN)

```bash
# .env: TURN_URLS=turn:YOUR_PUBLIC_HOST:3478?transport=udp   TURN_SECRET=<generated>
docker compose --profile turn up -d coturn
```
Credentials handed to browsers are short-lived HMAC credentials (1 h); the shared secret never leaves the server.
coturn needs public UDP ports — the one deliberate exception to "only the gateway publishes ports".

### Production

```bash
# real certificate in /etc/letsencrypt/live/$APP_DOMAIN (fullchain.pem + privkey.pem)
APP_DOMAIN=findit.example.com docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env up -d --build
```
Checklist: DNS + TLS cert, `APP_URL`/`CORS_ORIGINS` set to the exact https origin, SMTP configured, MongoDB backups
(`mongodump` cron or a managed cluster), Redis persistence, pin image digests, enable Dependabot, run
`./scripts/gateway-probe.sh` against the live URL.

## Local development without Docker

```bash
# needs MongoDB 7 and Redis running locally
cd services && npm ci && npm test          # backend tests (78) with coverage
cd ../frontend && npm ci && npm test       # frontend unit tests (13)
npm run dev                                # Vite dev server; /api and /socket.io proxy to VITE_DEV_GATEWAY (default https://localhost)
node scripts/e2e-local.mjs                 # boots all 6 services as processes and drives the full flow (33 checks)
./scripts/gateway-probe.sh                 # black-box checks of the gateway (headers, blocked paths, admin pre-check, rate limit…)
cd frontend && npx playwright test         # browser E2E against a running stack (see docs/SECURITY_AUDIT.md: not run in the build sandbox)
```

## Configuration

All configuration comes from environment variables (see `.env.example`); nothing secret is in the repo or the browser bundle.

| Variable | Purpose |
|---|---|
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_SERVICE_TOKEN` | independent 32+ char secrets (`openssl rand -hex 32`) |
| `MONGO_*_PASSWORD`, `REDIS_PASSWORD` | per-service DB users and Redis auth (hex only) |
| `CLOUDINARY_*` | server-side image storage (public photos + private proof images) |
| `SMTP_URL`, `MAIL_FROM` | Nodemailer transport; empty `SMTP_URL` = log-only |
| `APP_URL`, `CORS_ORIGINS` | exact public origin(s); used for links and the Origin guard |
| `STUN_URLS`, `TURN_URLS`, `TURN_SECRET`, `TURN_REALM` | WebRTC ICE servers |
| `MATCH_THRESHOLD` (45), `MATCH_RADIUS_KM` (2) | matching engine tuning |
| `MONGO_AUTO_INDEX` | build indexes on boot (default true) |

## API overview (via the gateway, prefix `/api/<service>`)

| Service | Highlights |
|---|---|
| auth | `POST /register /login /refresh /logout /logout-all`, `GET /me`, `/password/forgot|reset|change`, `/email/verify|resend`, admin: `/admin/users`, `/admin/stats` |
| items | `GET /` (search: q, type, category, dates, lat/lng/radius), `/map`, `/stats`, `/mine`, `/:id`, `POST /` (multipart ≤5 images), `PATCH /:id`, `POST /:id/close`, `GET /:id/matches`, `POST /:id/matches/:mid/dismiss`, admin: `/admin/items`, `/admin/stats` |
| claims | `GET /questions/:itemId`, `POST /` (answers + ≤3 private proofs), `/mine`, `/received`, `/:id`, `POST /:id/decision|withdraw|returned`, admin: `/admin/claims`, `/admin/audit`, `/admin/stats` |
| realtime | `GET /conversations`, `/conversations/:id/messages?after=`, `POST /conversations/:id/read`, `/unread-count`, `/calls/ice`; Socket.IO: `message:send|read`, `typing`, `call:invite|accept|reject|end|offer|answer|ice` |
| notify | `GET /notifications`, `/notifications/unread-count`, `POST /notifications/read`, `GET|PUT /preferences` |

## Matching engine

`services/matching/src/scoring.js` → `matchingService.score(a, b)` returns `{ score 0–100, reasons[] }`:
TF-IDF text similarity (45) · category (12) · colour/brand/marks keyword overlap (13) · date plausibility (10) ·
distance decay beyond a radius (20). Every point is explained to the user ("Why?"). The single `score` function is the seam
for swapping in embeddings later.

## Repository layout

```
services/{shared,auth,items,matching,claims,realtime,notify}   Node 22 ESM workspaces (+ tests, one Dockerfile each)
frontend/                       React 18 + Vite, glassmorphism design system, Leaflet, Socket.IO client, Playwright specs
gateway/                        Nginx template, snippets, TLS entrypoint
docker/mongo-init.sh            per-service MongoDB users
scripts/                        init-env.sh, e2e-local.mjs, gateway-probe.sh, gateway-ws.mjs
docs/SECURITY_AUDIT.md          verification evidence, gaps, residual risks
.github/                        CI (lint, tests, audit, gitleaks, build, Trivy, stack smoke) + Dependabot
```

## Troubleshooting

* *Gateway returns 502 right after start* — services are still booting; `docker compose ps` and wait for `healthy`.
* *"Invalid environment configuration"* — read the listed variables; regenerate with `./scripts/init-env.sh` on a fresh checkout.
* *Uploads fail* — Cloudinary credentials missing/incorrect (Items/Claims logs show the error, never the secret).
* *Calls connect on Wi-Fi but not on mobile data* — configure TURN (above).
* *Behind another load balancer* — set `TRUST_PROXY_HOPS` to the real number of proxies, or rate limiting keys on the wrong IP.

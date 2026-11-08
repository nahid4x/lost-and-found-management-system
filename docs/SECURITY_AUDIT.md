# FindIt — Security & Verification Report

Scope: the code in this repository, verified in the build sandbox (Node 22, Redis 7, **FerretDB 1.24 as a MongoDB-compatible
database, real Nginx 1.24**). **No Docker daemon, no browser and no external SaaS access were available there.**
Status legend: ✅ verified by an automated check that was run · 🔎 verified by code review/grep only · ⚠️ NOT run here — run it before go-live · ❌ known gap.

## 1. What was actually executed (evidence)

| Check | Result |
|---|---|
| Backend tests (`services`, vitest, real Redis + FerretDB, real Socket.IO clients) | ✅ **78 / 78** passing; coverage **89.3 % statements, 92.9 % lines, 79.9 % branches** (matching 99 %, claims 92 %, auth 93 %, realtime 90 %, items 88 %, notify 85 %) |
| Frontend unit tests (vitest + jsdom) | ✅ **13 / 13** |
| Cross-service end-to-end (`scripts/e2e-local.mjs`: 6 real service processes, Redis event bus, internal tokens, live chat, audit aggregation, admin seed) | ✅ **33 / 33** checks |
| Gateway black-box probe (`scripts/gateway-probe.sh` against **real Nginx** running the shipped config) | ✅ **41 / 41** (+ admin allow-path 4/4, WebSocket and long-polling through the proxy 3/3) |
| ESLint with `eslint-plugin-security` | ✅ 0 errors, 0 warnings (3 documented suppressions on escaped/bounded regexes) |
| `npm audit` (services incl. dev, and frontend incl. dev) | ✅ 0 vulnerabilities (React Router 6 → 7 upgrade done to clear an open-redirect advisory) |
| gitleaks over working tree **and** git history | ✅ no leaks (one fake test password allow-listed by path in `.gitleaks.toml`) |
| Production bundle scan (`frontend/scripts/check-dist-secrets.mjs`, also run in the Docker build) | ✅ no secrets, no source maps shipped |
| Production-only dependency install per service from the lockfile (emulates the Docker `deps` stage) + module load | ✅ all 6 services |
| Boot with Compose-style empty `TURN_*`; boot refusal on placeholder / short / missing secrets | ✅ |

### Defects found *by* this verification and fixed
1. **Socket.IO lost-event race** — handlers were registered after async setup, so a client emitting immediately after `connect` could lose events (flaky test exposed it). Handlers now register synchronously first.
2. **Gateway would not start** — duplicate `proxy_read_timeout` in the WebSocket location (found only by running real Nginx).
3. **Mongoose `sanitizeFilter` pitfalls** — three of my own operator filters were silently neutralised (reset-token expiry, stats, admin stats); fixed with `trusted({...})` and covered by tests.
4. **Admin seed / admin update** failed on FerretDB with `findAndModify` projections; replaced by portable `updateOne` + read.
5. Compose passed an empty `TURN_SECRET` that the Realtime schema rejected; fixed.
6. Dev/test-only: login rate limiter correctly throttled my own flood test (cleared Redis keys to continue).

## 2. Checklist

### Secrets & configuration
| Item | Status | Evidence |
|---|---|---|
| No secrets in repo/history/bundle/images | ✅ | gitleaks (tree + history), dist scan; `.dockerignore` excludes `.env*`; secrets only via env |
| Env validated at boot, weak/placeholder/short secrets refused, refresh ≠ access secret | ✅ | `shared/test` + boot check + `createAuthApp` guard |
| Separate access vs refresh secrets; internal token separate; each service gets only the env it needs | ✅/🔎 | tests; `docker-compose.yml` per-service `environment` blocks |
| `.env.example` has placeholders only; admin password never stored | 🔎 | `seed-admin.js` takes password at run time (✅ exercised in e2e) |

### Authentication & sessions
| Item | Status | Evidence |
|---|---|---|
| bcrypt (cost ≥ 12 in production, enforced), password policy + common-password list | ✅ | auth tests; `costFor()` |
| Generic login error, constant-time-ish compare for unknown users, progressive lockout, per-IP and per-email limits | ✅ | auth tests (lockout, generic error), gateway flood → 429 |
| JWT HS256 pinned; `none`, wrong audience/issuer, expired, tampered rejected; 15 min access TTL | ✅ | auth + shared tests |
| Refresh in httpOnly, Secure, SameSite=Strict, `Path=/api/auth` cookie; rotation + **reuse detection revokes the family**; logout, logout-all, password change/reset revoke sessions | ✅ | auth tests; gateway probe verified cookie flags through TLS |
| Access token only in memory (no web storage) | ✅/🔎 | api client unit test; grep: no `localStorage` use |
| Reset/verify tokens: random 256-bit, stored hashed, single-use, expiring; reset never reveals existence | ✅ | auth tests |
| Deactivated user: refresh refused, sockets dropped (`user.deactivated`) | ✅ | auth + realtime tests |
| Email verification enforced before posting | ❌ | verified flag is tracked but not enforced (design choice, easy to add) |
| Registration reveals "email already registered" (enumeration) | ❌ | accepted trade-off; login/reset do not leak |

### Authorization / IDOR / mass assignment
| Item | Status | Evidence |
|---|---|---|
| Ownership checks return **404** (not 403) for others' items/claims/notifications/conversations | ✅ | items, claims, notify, realtime tests |
| Admin = JWT **and** role/isActive read from the database; forged `role: admin` token denied | ✅ | auth test; gateway `auth_request` verified (401/403/allow) |
| Private fields (exact location, held-at, contact, questions, history) only for owner/admin/approved claimant | ✅ | items tests + e2e |
| Zod `.strict()` everywhere: unknown fields (`role`, `status`, `owner`, `score`) rejected | ✅ | items, claims, auth, notify tests |
| Internal endpoints need the service token and are blocked at the gateway; matching has no public route | ✅ | matching tests, gateway probe |

### Input validation & injection
| Item | Status | Evidence |
|---|---|---|
| NoSQL operators stripped/rejected (`$ne`, dotted keys), `sanitizeFilter` on, ObjectId validation | ✅ | auth/items/notify tests, gateway probe |
| Regex search input escaped; text search via `$text` | ✅/⚠️ | tests; **`$text` and geo radius execute only on real MongoDB — FerretDB lacks them (see §3)** |
| XSS: React escaping, no `dangerouslySetInnerHTML`/`innerHTML`/`eval`, server strips `<>` from stored text, emails HTML-escaped | ✅/🔎 | component + items + notify tests; grep |
| Body-size caps (10 kb JSON, gateway 64 k/16–26 m uploads), JSON parse errors safe, no stack traces | ✅ | gateway probe, tests |
| SSRF: no server-side fetch of user-supplied URLs | 🔎 | grep: only `internalFetch` to fixed service URLs |

### File uploads
| Item | Status | Evidence |
|---|---|---|
| Magic-byte type check (JPEG/PNG/WebP), size/count limits, re-encode to WebP, **EXIF/GPS stripped**, random IDs | ✅ | `shared.test.js` with a real EXIF-bearing JPEG |
| Proof images stored as Cloudinary `authenticated` assets, shown via 5-min signed URLs to the finder only | 🔎/⚠️ | code review; **not exercised against real Cloudinary** |

### Transport, headers, CORS/CSRF
| Item | Status | Evidence |
|---|---|---|
| HTTP→HTTPS redirect, TLS 1.2/1.3, HSTS (sent once), no server version | ✅ | real-Nginx probe |
| CSP: `script-src 'self'`, `frame-ancestors 'none'`, `connect-src 'self' wss://$host`, `object-src 'none'` + nosniff, frame DENY, referrer, permissions policy, COOP | ✅ | probe |
| `style-src 'unsafe-inline'` is allowed (Leaflet/inline styles) | ❌ (accepted) | scripts remain strict |
| CORS exact allow-list, no wildcard, preflight denied for foreign origins; Origin guard on state-changing requests; CSRF header on cookie endpoints | ✅ | probe + auth tests |
| Dotfiles/backups/source maps/internal paths hidden | ✅ | probe |

### Abuse controls
| Item | Status | Evidence |
|---|---|---|
| Gateway rate limits (429) + Redis-backed per-service limits (login, register, reset, uploads, claims, search) | ✅ | probe (32/40 login flood throttled); unit tests for limits |
| Claim limits: one per item/user, max active, lock after repeated rejections, per-item cap | ✅ | claims tests |
| Socket: handshake auth, Origin allow-list, max 5 sockets/user, 20 msg/10 s, payload ≤ 32 kB, schema validation, token-expiry disconnect | ✅ | realtime tests |
| Socket rate limits are per instance (in memory) | ❌ | move to Redis if scaling out |

### Real-time & calls
| Item | Status | Evidence |
|---|---|---|
| Only conversation participants can message/type/read/call; idempotent `clientId`; reconnect catch-up; delivered/read receipts | ✅ | realtime tests |
| Call signalling restricted to the two parties, busy/offline handling, size-limited signals; media is peer-to-peer | ✅ | realtime tests |
| TURN credentials short-lived HMAC; shared secret never sent | ✅ | realtime test |
| Real two-browser audio/video call, TURN relay | ⚠️ | needs browsers + coturn |

### Logging, errors, privacy
| Item | Status | Evidence |
|---|---|---|
| Structured JSON logs with redaction of passwords, tokens, cookies, emails, answers, message text; request IDs | ✅ | logger test |
| Generic client errors, details only in server logs | ✅ | tests + probe |
| Audit log: logins, registrations, claim create/approve/reject/return, item create/close, admin actions, with actor/IP/time | ✅ | e2e (9 entries from 3 services) |
| Account deletion / data export | ❌ | not implemented |
| Chat messages are not encrypted at rest | ❌ | stored as plain text in MongoDB |

### Containers & infrastructure
| Item | Status | Evidence |
|---|---|---|
| Only the gateway publishes ports; Mongo/Redis/services on an `internal: true` network; only items/claims/notify can reach the internet | 🔎 | `docker-compose.yml` (YAML parsed; **not started**) |
| Non-root, read-only FS, `cap_drop: ALL`, `no-new-privileges`, pids/memory limits, healthchecks, production-only deps | 🔎/✅ | compose/Dockerfiles; prod-only install emulation ✅ |
| Per-service MongoDB users (readWrite on own DB only); Redis password | 🔎 | `docker/mongo-init.sh` |
| Image build, `docker compose up`, Trivy image scan | ⚠️ | no Docker daemon in the sandbox; CI job `containers` runs all three |

## 3. Not run in the build environment (do these before go-live)
1. **`docker compose up --build`** and `./scripts/gateway-probe.sh` against it; Trivy image scan (CI does both). The container hardening flags (`read_only`, `cap_drop: ALL`, `no-new-privileges`, tmpfs paths) were never exercised; stock `mongo`, `redis`, `nginx-unprivileged` and `coturn` images may need a capability or tmpfs adjusted on first run — check `docker compose logs` and loosen only what is required.
2. **Playwright specs** (`frontend/e2e`: full journey with two browsers, XSS, open-redirect, storage, responsive, a11y basics) — browsers cannot be downloaded in the sandbox. They are syntax-checked only.
3. **Real MongoDB**: search with `$text` and the radius filter (`$geoWithin/$centerSphere`), 2dsphere/text index creation. Query *construction* is unit-tested; execution needs a real MongoDB (`MONGO_AUTO_INDEX=true`, CI uses `mongo:7`).
4. **Cloudinary** (public + `authenticated` uploads, signed URLs), **SMTP** delivery, **coturn** relay.
5. OWASP ZAP baseline, Lighthouse (performance/a11y/best-practices ≥ 90), `k6`/load test, device testing at 375/768/1440 px and in Safari/Firefox (layout uses standard CSS with a `backdrop-filter` fallback; not visually verified in a browser here).
6. Penetration test / external review before handling real users' data.

## 4. Residual risks & design limits
* **Redis pub/sub is at-most-once**: if a consumer is down when an event fires, that match/notification/projection update is lost. For stronger guarantees move to Redis Streams or an outbox.
* **Access tokens live 15 minutes** after deactivation (other services do not hit the DB on every request; admin routes and refresh do).
* **Single MongoDB/Redis instance**, no backup schedule configured; no HA.
* **TURN** uses plain `turn:` by default; add TLS (`turns:`) and keep the shared secret rotated.
* **Matching is heuristic** (TF-IDF + rules), not ML; thresholds are configurable.
* Rate limiting by IP depends on a correct `TRUST_PROXY_HOPS`; behind extra proxies adjust it.
* The dev certificate is self-signed and valid 30 days; production must mount a real certificate.
* Local gateway verification used Nginx 1.24 (the container uses a newer image); the only adaptation was the `http2` directive syntax.

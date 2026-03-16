# Rental CRM Backend (Multi-project Portal)

## Scope
Backend serves three isolated auth contexts on one server:
- `apitchenkov` (rental CRM)
- `cinetools` (sales CRM)
- `admin` (user management for both)

Portal entry points:
- `/`
- `/apitchenkov/login/` -> `/apitchenkov/dashboard/`
- `/cinetools/login/` -> `/cinetools/dashboard/`
- `/admin/login/` -> `/admin/dashboard/`

You can keep CineTools files outside `/var/www/rental` by setting:
- `CINETOOLS_WEB_ROOT=/var/www/cinetools`

## Run (local)
```bash
cd server
npm install
cp .env.example .env
npm start
```

## Required migrations
Run on existing DB:

```bash
mysql rental < sql/migrations/20260314_items_mvp.sql
mysql rental < sql/migrations/20260316_auth_users_portal.sql
mysql rental < sql/migrations/20260316_auth_login_attempts.sql
mysql rental < sql/migrations/20260316_user_logs_and_activity.sql
mysql rental < sql/migrations/20260316_utf8mb4_for_pdf_text.sql
```

## Environment and hardening
Configuration is validated at startup (`utils/validateEnv.js`).

Production requirements:
- strong `SESSION_SECRET` (>= 32 chars)
- `REDIS_URL` configured (no MemoryStore in production)
- explicit `CORS_ALLOWED_ORIGINS`
- all required admin credential env vars configured
- HTTPS expected behind reverse proxy (`TRUST_PROXY=1`, `REQUIRE_HTTPS_IN_PROD=true`)

Use:
- `npm run auth:hash -- "StrongPassword"` to generate `scrypt` hash

### Auth credential env vars
- `APITCHENKOV_ADMIN_USERNAME`
- `APITCHENKOV_ADMIN_PASSWORD_HASH`
- `CINETOOLS_ADMIN_USERNAME`
- `CINETOOLS_ADMIN_PASSWORD_HASH`
- `PORTAL_ADMIN_USERNAME`
- `PORTAL_ADMIN_PASSWORD_HASH`

Development-only fallback accounts are allowed only when:
- `NODE_ENV=development`
- `ENABLE_DEV_AUTH_FALLBACK=true` (explicit opt-in)

## Security controls implemented
- `helmet` security headers
- strict session cookie policy (`httpOnly`, `secure` in production, `sameSite=strict` in production)
- session fixation mitigation (`req.session.regenerate` on successful login)
- Redis session store in production via `connect-redis`
- login and session rate limiting (`express-rate-limit`)
- CORS allowlist by env
- server-side guards for dashboard routes (redirect to login if unauthenticated)
- audit table for login attempts (`auth_login_attempts`)

## Auth endpoints
- `GET /api/auth/projects`
- `GET /api/auth/:project/session`
- `POST /api/auth/:project/login`
- `POST /api/auth/:project/logout`

Login errors are neutral (`Invalid credentials`) to avoid account enumeration.

## Protected API zones
- `/api/projects`, `/api/items`, `/api/estimates*` -> requires `apitchenkov` session
- `/api/cinetools/*` -> requires `cinetools` session
- `/api/admin/*` -> requires `admin` session

## Admin users API
- `GET /api/admin/users?project=apitchenkov|cinetools`
- `POST /api/admin/users`
- `PUT /api/admin/users/:id`
- `GET /api/admin/users/:id/logins`
- `GET /api/admin/users/:id/activity`
- `POST /api/admin/change-password`

## Audit logging
Every login attempt (success/failure) is written to `auth_login_attempts` with:
- `project_slug`
- `username`
- `ip_address`
- `user_agent`
- `success`
- `failure_reason`
- `attempted_at`

Additional per-user audit tables:
- `user_login_logs` (login history by `user_id`)
- `user_activity_logs` (actions by `user_id`)

## HTTPS and nginx guidance (production)
Recommended nginx setup:
- terminate TLS at nginx
- forward `X-Forwarded-Proto https`
- proxy to backend over localhost
- keep backend private (not publicly exposed)

Example essentials:
- `proxy_set_header X-Forwarded-Proto $scheme;`
- `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
- `proxy_set_header Host $host;`

Recommended nginx-level extras:
- request rate limiting for `/api/auth/*`
- HSTS header (if managed at nginx layer)
- deny unwanted methods on static paths

## PDF
`GET /api/estimates/:id/pdf`

Use `GET /api/estimates/:id/pdf?download=1` to force attachment download.

Cyrillic smoke test:
```bash
npm run pdf:smoke:ru
```

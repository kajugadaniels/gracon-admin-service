# Admin Service

> Part of the ID Verification Platform microservice architecture.
> Handles all administrative operations — user management, audit trails,
> security monitoring, and platform statistics.

---

## What This Service Does

This service is the internal admin backend. It is never accessible to
regular users. It provides:

- **Admin authentication** — separate JWT system with its own secret,
  shorter expiry (8h access / 24h refresh), and token type enforcement
- **User management** — view all users, search, filter, deactivate,
  reactivate, force revoke sessions, manually set ID verification status
- **Sensitive data access** — SUPER_ADMIN can decrypt NIDs and PIDs with
  full audit logging of every reveal
- **Admin account management** — SUPER_ADMIN creates ADMIN accounts via
  invite-link flow. New admins receive an email, click a link, set their
  own password, and are activated.
- **ID verification audit** — full history of every verification attempt
  across all users with scores, fail reasons, and IP addresses
- **Admin audit log** — immutable trail of every admin action
- **Security event log** — real-time feed of security events written by
  the auth service (failed logins, rate limit hits, token reuse, etc.)
- **Platform statistics** — aggregated metrics for the dashboard

---

## Architecture Position
```
app/admin (Next.js admin frontend)
      │
      ▼
api/admin (this service — port 3001)
      │
      ▼
Neon Postgres (shared with api/auth — read/write, no migrations)
```

This service shares the Neon Postgres database with `api/auth/` but
**never runs `prisma migrate`**. Only `api/auth/` owns schema migrations.
This service runs `prisma generate` only.

---

## Key Security Properties

- Uses a completely separate `ADMIN_JWT_SECRET` — user tokens are
  cryptographically rejected on every admin endpoint
- JWT payload includes `type: "admin"` — provides a secondary check
  even if secrets were accidentally shared
- NID and PID decryption requires `SUPER_ADMIN` role and is logged
  to `AdminAuditLog` on every call
- All admin actions are logged to an immutable audit trail
- Swagger docs protected by basic auth in production
- Rate limiting: 30 requests/min general, 5/min auth, 10/10min strict

---

## Admin Roles

| Role | Created by | Can do |
|---|---|---|
| `SUPER_ADMIN` | Prisma seed script only | Everything including creating ADMINs |
| `ADMIN` | SUPER_ADMIN via admin panel | All actions except decrypt NID/PID and create admins |

---

## Admin Account Invite Flow

1. SUPER_ADMIN submits new admin form (name, email, phone)
2. Service creates Admin record with `isVerified=false`, `passwordHash=null`
3. 48-hour invite token generated and emailed to the new admin
4. New admin clicks link → `/set-password` page
5. Admin sets their password → account activated → redirected to login

---

## Running Locally
```bash
# 1. Copy schema from auth service (never edit independently)
cp ../auth/prisma/schema.prisma prisma/schema.prisma

# 2. Install dependencies
npm install

# 3. Generate Prisma client (never run prisma migrate here)
npx prisma generate

# 4. Start in development mode
npm run start:dev
```

Service: `http://localhost:3001/api/v1`
Docs:    `http://localhost:3001/docs`

> The SUPER_ADMIN must be seeded in `api/auth/` before this service
> can authenticate any admin. Run `npx prisma db seed` in `api/auth/`.

---

## Related Services

| Service | Location | Purpose |
|---|---|---|
| Auth Service | `api/auth/` | User auth, owns DB migrations |
| AI Engine | `engine/` | Face comparison, liveness |
| User App | `app/app/` | User-facing frontend |
| Admin App | `app/admin/` | Admin dashboard frontend |
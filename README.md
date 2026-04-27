# API Admin

Admin control-plane backend for the Gracon platform.

This service owns administrator authentication, admin invitations, audit-log access, security-event inspection, verification review, user oversight, and dashboard statistics. It shares the main Postgres database with `api/auth`, but it is a separate security boundary with its own JWT secret and its own guards. The stats layer now also feeds foreign identity registry analytics into the admin dashboard.

## Overview

- Runtime: NestJS + TypeScript
- Default port: `3001`
- Database: shared Neon/Postgres via Prisma
- Auth model: `ADMIN_JWT_SECRET` only
- Primary consumers: `app/admin`

## What This Service Owns

- Admin login, refresh, logout, and invite-based set-password flow
- Admin account lifecycle
- Platform-wide admin audit trail
- Verification review surfaces
- Security event inspection
- User listing and limited user-management actions
- Reason-gated, audited NID and PID decrypt endpoints for SUPER_ADMIN
- Dashboard metrics for the admin frontend, including foreign identity registry analytics

## Core Skills Needed

- NestJS module/controller/service architecture
- Prisma on shared schemas without cross-service drift
- Admin-grade access control and auditability
- Email invite flows with hashed one-time tokens
- Secure token rotation and throttling

## Techniques Used

- Separate admin JWT trust boundary from user JWTs
- `AdminAuthGuard` plus role enforcement through `@RequireRole(...)`
- SHA-256 hashing for invite-token storage
- bcrypt password hashing
- AES decryption for protected user identifiers when admin views require it
- Mailer-backed invite onboarding
- Audit-on-write discipline for every state-changing endpoint

## Main Modules

```text
src/
  common/
    audit/          shared audit logging service
    crypto/         identifier decryption helpers
    guards/         AdminAuthGuard and supporting auth utilities
    mailer/         invite and notification email delivery
    prisma/         Prisma service/module
    security/       helmet, CORS, docs auth
  modules/
    auth/           admin auth and invite password setup
    admins/         admin lifecycle management
    audit/          audit-log read APIs
    security-events/platform stats
    users/          user oversight endpoints
    verifications/  verification review surfaces
```

## Folder Structure

```text
api/admin/
  prisma/
  src/
    common/
    modules/
  test/
  package.json
  nest-cli.json
  tsconfig*.json
```

## Local Commands

```bash
npm install
npm run start:dev
npm run build
npm run test
npm run lint
```

## Environment Notes

Key variables:

```env
APP_PORT=3001
DATABASE_URL=
ADMIN_JWT_SECRET=
ENCRYPTION_SECRET=
MAIL_HOST=
MAIL_PORT=
MAIL_USER=
MAIL_PASS=
MAIL_FROM=
FRONTEND_URL=http://localhost:4001
DOCS_BASIC_AUTH_USER=
DOCS_BASIC_AUTH_PASS=
```

## Integration Boundaries

- Receives requests only from `app/admin`
- Reads the shared auth database, but does not become the auth issuer
- Must never accept user JWTs from `api/auth`
- Should never call unrelated platform services directly for business logic

## Important Rules

- Always protect private endpoints with `AdminAuthGuard`
- Use `@RequireRole(AdminRole.SUPER_ADMIN)` for high-impact operations
- Log every mutation through the audit service
- Never run Prisma migrations here; `api/auth` owns the shared schema lifecycle
- Never expose decrypted identifiers or internal admin secrets in responses

## Contribution Checklist

- Add DTO validation and Swagger metadata together
- Keep mutations auditable
- Check that user-token and admin-token trust boundaries are still isolated
- Build before committing

## Testing Rule

- If code is pure logic or can be mocked cleanly, add a unit test.
- If code depends on Nest bootstrapping, DB wiring, or HTTP flow, prefer e2e or integration tests.

# api/admin Admin Boundary Rules

This file covers admin-only business behavior.

## Auth Boundary

- Admin authentication belongs to `api/admin`.
- User authentication belongs to `api/auth`.
- Do not mix JWT strategies, guards, or secrets between these services.

## Role Rules

- SUPER_ADMIN gates are mandatory for high-impact operations.
- Lower admin roles should receive only the data and actions they need.
- Do not implement frontend-only role checks as a substitute for backend checks.

## Audit-On-Write

- Every mutation must write an audit event.
- Mutations include invites, admin lifecycle changes, verification review, decrypt attempts, certificate review, and sanctions.
- Failed privileged actions should be auditable when useful for investigation.

## Integration Rules

- Calls to `api/signature` are limited to the certificate-review bridge.
- Do not call unrelated services directly for admin convenience.

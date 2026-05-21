# api/admin Security Rules

`api/admin` is a separate trust boundary from user authentication.

## Non-Negotiable Rules

- Never accept user JWTs issued by `api/auth`.
- Never share `ADMIN_JWT_SECRET` with user-domain services.
- Never expose decrypted NID, PID, FIN, passport, certificate secrets, or admin credentials in logs or responses.
- Every privileged mutation must be audit logged.
- SUPER_ADMIN-only actions must use explicit role checks.

## Identifier Access

- Decrypt endpoints require a reason and role enforcement.
- Return decrypted identifiers only through narrowly scoped endpoints.
- Do not cache decrypted identifiers.

## Audit Rules

- Audit every state-changing endpoint.
- Include actor, action, target, IP address, and safe metadata.
- Do not put secrets or plaintext identifiers into audit metadata.

## Certificate Oversight

- Approval, rejection, revocation, bans, and ban lifting are high-impact actions.
- Keep signature-service bridge credentials server-only.
- Map upstream bridge errors clearly without leaking internal secrets.

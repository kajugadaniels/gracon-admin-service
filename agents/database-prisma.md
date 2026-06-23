# api/admin Database and Prisma Rules

`api/admin` reads and writes the shared database but does not own migrations.

## Migration Rule

- Never run Prisma migrations from this project.
- Shared schema changes must start in `api/database/prisma/schema.prisma`.
- Regenerate Prisma here after shared schema or enum changes.

## Query Rules

- Use `select` for every admin response query.
- Avoid unbounded lists; use pagination helpers.
- Prefer stable metadata correlation keys when enum rollout may differ across environments.

## Sensitive Data

- Do not expose encrypted fields.
- Decrypt only inside reason-gated, audited service methods.
- Do not log decrypted values.

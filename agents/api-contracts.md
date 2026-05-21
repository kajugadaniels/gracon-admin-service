# api/admin API Contract Rules

## Controller Rules

- Every controller must use `@ApiTags`.
- Every endpoint must use `@ApiOperation`.
- Every endpoint must declare important `@ApiResponse` cases.
- Protected endpoints must use `AdminAuthGuard`.
- Role-gated endpoints must use `@RequireRole(...)`.

## DTO Rules

- Every DTO field must have Swagger metadata.
- Every input field must have class-validator decorators.
- Validate reason fields on privileged decrypt or sanction endpoints.

## Response Rules

- Select only fields required by admin surfaces.
- Never return password hashes, token hashes, encrypted identifiers, or internal bridge credentials.
- Prefer stable response DTOs over direct Prisma records.

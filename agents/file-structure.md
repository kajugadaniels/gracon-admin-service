# api/admin File Structure Rules

## Required File Shape

- Every file must start with a short purpose comment.
- Every exported class, function, enum, and interface must have JSDoc.
- Every public controller/service method must have JSDoc.
- Security-sensitive blocks must explain the risk being controlled.

## TypeScript Rules

- No `any`.
- Prefer explicit DTOs and interfaces.
- Use `const` unless reassignment is required.
- Do not return raw Prisma records from controllers.
- Delete commented-out dead code.

## Naming Rules

- Files use `kebab-case.ts`.
- Classes and DTOs use `PascalCase`.
- Variables and functions use `camelCase`.
- Constants use `UPPER_SNAKE_CASE`.

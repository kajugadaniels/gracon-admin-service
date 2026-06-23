# api/admin Folder Structure Rules

This service is the admin control-plane backend. Keep admin-only business rules inside this project.

## Source Layout

```text
src/
  common/           admin infrastructure shared across modules
  modules/          admin business domains
test/               e2e and integration tests
agents/             AI execution rules for this service
```

## Placement Rules

- Put admin HTTP routes in `src/modules/<domain>/<domain>.controller.ts`.
- Put admin business rules and Prisma access in services.
- Put request and response contracts in `dto/`.
- Put shared audit, crypto, guard, mailer, pagination, Prisma, and security code under `src/common/`.
- Put certificate-review helpers beside the certificate module that owns them.

## Do Not Create

- Do not create user-auth logic here.
- Do not introduce user JWT validation.
- Do not run Prisma migrations here.
- Do not put unrelated product-service logic in admin modules.

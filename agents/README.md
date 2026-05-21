# api/admin Agent Guide

This directory contains project-local execution rules for AI agents working in `api/admin`.

Use these files after reading the monorepo root guide and the service README.

## Reading Order

1. Read `../../AGENTS.md`.
2. Read `../README.md`.
3. Read this file.
4. Read the topic file that matches the task.
5. Inspect the source code before editing.

## Topic Files

- [folder-structure.md](./folder-structure.md) — where admin modules, DTOs, helpers, tests, and docs belong.
- [file-structure.md](./file-structure.md) — naming, comments, TypeScript style, and exported API rules.
- [security.md](./security.md) — admin trust boundary, sensitive identifiers, logs, and abuse-case rules.
- [api-contracts.md](./api-contracts.md) — controller, DTO, Swagger, validation, and response rules.
- [database-prisma.md](./database-prisma.md) — shared-schema read model rules and migration restrictions.
- [admin-boundary.md](./admin-boundary.md) — admin roles, audit-on-write, certificate review, and sanctions.
- [testing.md](./testing.md) — test expectations and validation commands.
- [git.md](./git.md) — copy-paste commit command format for this project.
- [documentation.md](./documentation.md) — README, `.env.example`, Swagger, and root-guide update rules.

## Scope

These rules apply only inside `api/admin`. If work touches `api/auth`, `api/signature`, or `api/foreign-identity`, read that project's guide too.

## Conflict Rule

If a local rule conflicts with `../../AGENTS.md`, the root guide wins.

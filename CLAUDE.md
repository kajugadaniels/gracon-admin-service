# CLAUDE.md — Gracon Platform Root Guide

This is the monorepo-level guide for AI agents and senior contributors working inside Gracon.

Project-specific operational docs now live in `README.md` files inside each real project directory. Read this file first, then open the relevant project README before making changes.

## Monorepo Overview

Gracon is a multi-service platform for:

- identity and account management
- admin control-plane operations
- personal digital signatures
- institution-managed stamping
- collaborative document authoring and signing
- internal AI-backed identity verification

The codebase is split into separate deployable services and separate frontend apps. Security boundaries are intentional and must stay that way.

## Project Map

Backend services:

- [api/auth/README.md](./api/auth/README.md)
- [api/admin/README.md](./api/admin/README.md)
- [api/signature/README.md](./api/signature/README.md)
- [api/stamp/README.md](./api/stamp/README.md)
- [api/institution/README.md](./api/institution/README.md)
- [api/documents/README.md](./api/documents/README.md)
- [engine/README.md](./engine/README.md)

Frontend apps:

- [app/app/README.md](./app/app/README.md)
- [app/admin/README.md](./app/admin/README.md)
- [app/documents/README.md](./app/documents/README.md)

## Current Architecture

```text
api/auth        NestJS   :3000  user auth, registration, verification, profile
api/admin       NestJS   :3001  admin-only backend with separate JWT trust boundary
api/signature   NestJS   :3002  personal signature keys, certificates, signing
api/stamp       NestJS   :3003  institutional stamping and dual-signature proof
api/institution NestJS   :3004  institutions, authority, institution keys
api/documents   NestJS   :3005  documents, sharing, invitations, signing workflow
engine          FastAPI  :8000  internal AI verification engine

app/app         Next.js  :4000  user-facing auth/profile/signature frontend
app/admin       Next.js  :4001  admin frontend
app/documents   Next.js  :4002  document workspace
```

## Service Communication Rules

```text
app/app       -> api/auth
app/app       -> api/signature

app/admin     -> api/admin
app/admin     -> api/foreign-identity

app/documents -> api/documents
app/documents -> api/signature   through Next.js proxy routes
app/documents -> api/auth        only through local helper/proxy routes for session recovery

api/auth      -> engine

api/stamp     -> shared DB + aligned crypto contracts with api/institution and api/signature
```

Do not casually introduce new cross-service calls. If a service boundary changes, the design needs an explicit reason.

## Important Current State

- `app/app` owns the identity-verification UI again
- `app/documents` redirects to `app/app` when login or identity verification is required
- the temporary shared verification package was rolled back and removed from active app dependencies
- the admin app now also manages the foreign-identity registry through api/foreign-identity
- signing and locking are separate document actions
- owner signing is explicit, not implicit
- invitation acceptance is gated by login, OTP proof, and identity verification proof
- document page layout is now persisted as document metadata and consumed by the editor and export paths
- the documents app now includes a polished page-setup surface with presets and live printable-area preview
- the documents ruler now supports direct horizontal margin dragging backed by persisted layout metadata
- the documents ruler now also reflects active paragraph indentation from the current editor selection
- the documents ruler now supports paragraph-indent dragging through schema-backed editor commands
- paragraph ruler interactions surface mixed multi-block selections instead of hiding selection complexity
- typed paragraph tab stops are schema-backed, ruler-visible, and preserved through DOCX import/export
- ruler tab stops expose a direct alignment popover for left, center, right, and decimal stops
- ruler tab-stop markers can be dragged horizontally to reposition existing typed stops
- live editor tab-stop rendering uses ProseMirror decorations over real tab characters to preserve selection, copy/paste, and export semantics
- document layout export parity is covered by pure regression tests for margins, indents, hanging indents, and tab stops
- DOCX import now maps paragraph indents, inline tabs, and typed paragraph tab-stop positions back into the same schema-backed editor layout model
- insert-menu work should use the typed `INSERT_ACTION_IDS` / `INSERT_ACTIONS` registry before adding new editor commands or dialogs
- quick insert-menu actions should stay undo-safe by routing through TipTap commands, not direct DOM mutation
- editor links in `app/documents` must pass through the safe URL normalization helper before being written into TipTap content
- editor images in `app/documents` should be stored as stable `api/documents` render URLs backed by private S3 objects; never store base64 uploads inside document JSON
- editor image resizing should use TipTap image node attributes and visible canvas handles so image size persists through autosave/export paths

## Agent Role and Standard

Operate like a senior engineer with security, product, and architecture responsibility.

Required behavior:

- challenge unsafe or weak implementation ideas directly
- reason about abuse cases before coding
- keep service boundaries intact unless the change explicitly redesigns them
- prefer durable architecture over fast duplication
- never ship placeholder security logic
- keep frontend UX understandable, not just visually complete

## Core Skills Expected In This Monorepo

- NestJS service/controller/module design
- Prisma schema discipline on shared databases
- Next.js App Router, middleware, and server/client boundary handling
- Zustand session state patterns
- Tiptap/ProseMirror editor integration
- PKI and encrypted key-material lifecycle design
- internal-service trust modeling
- audit trail and event-history design
- FastAPI + Pydantic internal service work
- secure S3 asset handling

## Techniques Used Across The Platform

- hashed token persistence instead of storing raw tokens
- AES or derived-key encryption for sensitive identifiers and private keys
- separate JWT trust boundaries for admin and user domains
- limited-token vs full-token progression in identity verification
- proxy routes in Next.js where browser-to-backend direct calls are not appropriate
- audit-first design for privileged or security-relevant actions
- staged document workflow: draft, finalise, sign, owner lock
- shared document-layout normalization between persisted metadata, editor paper, rulers, and exports
- premium settings-surface patterns for document page setup without breaking editor/export consistency
- optimistic in-canvas ruler interactions that preview immediately and persist once on release
- schema-backed paragraph layout attributes so ruler readouts do not depend on fragile DOM-only parsing
- paragraph indent edits flow through the editor document model and existing autosave path instead of a sidecar UI state
- multi-block editor formatting should be explicit in UI feedback, especially when selected blocks have mixed attributes
- editor layout features should be backed by document schema attributes before adding direct-manipulation UI
- when editor layout features affect export, add pure conversion tests so PDF/DOCX behavior cannot drift silently
- when editor layout features affect import, map external document metadata into schema attributes before TipTap JSON generation
- when adding rich editor marks such as links, update editor registration, import parsing, export parity, and pure helper tests together
- public verification through immutable hashes and preserved signing evidence

## Non-Negotiable Security Rules

- never hardcode secrets or credentials
- never store passwords, refresh tokens, invitation tokens, NID, PID, or private keys in plain text
- use constant-time comparison for secrets
- avoid leaking internal failure detail to clients
- treat logs as production artifacts; no biometric, key, or token leakage
- keep admin auth completely separate from user auth
- never move private-key material to the client
- do not expose the engine publicly

## Quality Rules

- one function, one job
- extract helpers before files become unmaintainable
- no accidental N+1 or unbounded list loading
- select only needed Prisma fields
- parallelize independent async work
- validate input close to the edge
- keep UI state transitions explicit, especially around auth, verification, and signing
- if code is pure logic or can be mocked cleanly, add a unit test
- if code depends on Nest bootstrapping, DB wiring, or HTTP flow, prefer e2e or integration tests over forced unit tests

## Frontend Rules

- tokens belong in Zustand + sessionStorage, not localStorage
- use hard navigation for cross-origin app handoff
- keep auth app, admin app, and documents app responsibilities separate
- when UX is confusing, redesign the information hierarchy instead of adding more copy
- avoid flat generic UI; keep interactions intentional and understandable

## Backend Rules

- auth issuance belongs to `api/auth`
- admin issuance belongs to `api/admin`
- validation-only services should validate existing JWTs, not mint new ones
- document access decisions belong in the documents service layer, not just controller checks
- crypto contracts shared between services must change together or not at all

## Recommended Working Process For Agents

1. Read this root guide.
2. Open the relevant project README.
3. Inspect the actual code before assuming the docs are complete.
4. Identify the true boundary of the change.
5. Implement the smallest change that preserves platform invariants.
6. Validate with build/test/typecheck where possible.
7. Report exact files changed and any remaining risks.

## Documentation Rule

- root `CLAUDE.md` stays as the AI-agent instruction file
- each project directory uses `README.md` for project-specific context
- when project architecture changes, update both the relevant project README and this root guide if the cross-project picture changed

## When To Push Back

Push back when a request would:

- merge unrelated service boundaries
- duplicate security-sensitive logic across apps
- store sensitive material in the wrong place
- make admin and user trust boundaries overlap
- weaken invitation, signing, or verification proofs
- introduce UI complexity that hides the primary action

## Quick Navigation

- Identity and tokens: [api/auth/README.md](./api/auth/README.md), [app/app/README.md](./app/app/README.md)
- Admin control plane: [api/admin/README.md](./api/admin/README.md), [app/admin/README.md](./app/admin/README.md)
- Documents and collaboration: [api/documents/README.md](./api/documents/README.md), [app/documents/README.md](./app/documents/README.md)
- PKI and stamping: [api/signature/README.md](./api/signature/README.md), [api/institution/README.md](./api/institution/README.md), [api/stamp/README.md](./api/stamp/README.md)
- AI verification engine: [engine/README.md](./engine/README.md)
- No `any` types in TypeScript — use proper interfaces or generics
- No commented-out dead code — delete it, git history preserves it
- Use `const` by default — only use `let` when reassignment is necessary
- Error handling must be explicit — never swallow errors silently
- Every public method and every exported function must have a JSDoc or
  docstring comment explaining what it does, its parameters, and return value

### Naming Conventions
- Files: `kebab-case.ts` for TypeScript, `snake_case.py` for Python
- Classes and interfaces: `PascalCase`
- Functions, variables, methods: `camelCase` (TS) / `snake_case` (Python)
- Constants: `UPPER_SNAKE_CASE`
- React components: `PascalCase` — one component per file

### Comments
- Write comments that explain **why**, not **what**
- Every file must have a top-level comment describing its purpose
- Security-sensitive blocks must explain the security concern
- Complex business logic must have inline comments

---

## NestJS API Documentation (all NestJS services)

Every controller and every endpoint must be fully documented with
NestJS Swagger decorators. This is mandatory — not optional.

```typescript
// On every controller:
@ApiTags('Auth')
@Controller('auth')
export class AuthController {}

// On every endpoint:
@Post('login')
@ApiOperation({ summary: 'User login', description: '...' })
@ApiBody({ type: LoginDto })
@ApiResponse({ status: 200, description: 'Login successful' })
@ApiResponse({ status: 401, description: 'Invalid credentials' })
async login(@Body() dto: LoginDto) {}

// On every DTO property:
@ApiProperty({ example: 'user@example.com', description: '...' })
@IsEmail()
email: string;
```

### Swagger access control in `main.ts`:
```typescript
if (configService.get('APP_ENV') !== 'production') {
  // Mount Swagger normally in development
} else {
  // Protect /docs, /docs/json, /redoc with basic auth middleware
  // Uses DOCS_BASIC_AUTH_USER and DOCS_BASIC_AUTH_PASS from .env
  app.use(['/docs', '/docs/json', '/redoc'], basicAuthMiddleware);
}
```

---

## Responsive Design — All Screen Sizes

Every UI component and page must work on all four breakpoints:

| Breakpoint | Width          | Target devices              |
|------------|----------------|-----------------------------|
| Mobile     | 320px – 767px  | Phones (portrait)           |
| Tablet     | 768px – 1023px | Tablets, phones (landscape) |
| Laptop     | 1024px – 1439px| Laptops, small desktops     |
| Desktop    | 1440px+        | Large desktops, monitors    |

### Rules:
- Mobile first — base styles target 320px, then scale up with breakpoints
- Use CSS Grid with `auto-fit` / `minmax` for adaptive layouts
- Use `clamp()` for fluid typography and spacing
- Touch targets must be at least 44×44px on mobile
- No horizontal scrolling on any screen size — ever
- Test every new component at 320px width minimum
- Forms must stack vertically on mobile — never side by side below 480px
- Modals must be full-screen or near-full-screen on mobile
- Tables must scroll horizontally or reflow to card layout on mobile
- Font sizes must never go below 13px on any device
- The Navbar must work on all screen sizes — hamburger menu below 768px

### Tailwind 4 responsive prefix order (always mobile first):
```
base  →  sm:  →  md:  →  lg:  →  xl:
```

---

## Design System — Glassmorphism UI

This platform uses a consistent glassmorphism dark design system.
Never deviate from these values. Never use gradients on backgrounds.

```
Background:        #07071a
Primary:           #5B23FF
Primary hover:     #4a1be0
Primary glow:      rgba(91, 35, 255, 0.35)
Success:           #10b981
Error:             #f43f5e
Warning:           #f59e0b
Font:              DM Sans (loaded via Next.js font optimization)

Glass card:
  background:      rgba(255, 255, 255, 0.04)
  backdrop-filter: blur(24px)
  border:          1px solid rgba(255, 255, 255, 0.10)
  border-radius:   16px

Strong glass (modals, primary cards):
  background:      rgba(255, 255, 255, 0.07)
  backdrop-filter: blur(40px)
  border:          1px solid rgba(255, 255, 255, 0.14)

Button (3D press effect):
  background:       var(--color-primary) = #5B23FF
  box-shadow rest:  0 4px 0 0 #3d16c0, 0 6px 16px rgba(91,35,255,0.30)
  box-shadow hover: 0 6px 0 0 #3d16c0, 0 8px 24px rgba(91,35,255,0.40)
  transform active: translateY(3px) + shadow collapses to 1px
```

**Never use:**
- `background: linear-gradient(...)` on any container or card
- Hard white or black backgrounds on cards
- Any font other than DM Sans
- Color values not in `globals.css` CSS variables
- Hardcoded hex color values inline in component files

**Always use:**
- CSS variables from `globals.css` — never hardcode hex inline
- The `.glass` or `.glass-strong` utility class for all cards
- `var(--color-primary)` for all primary action elements
- `animate-fade-up` for page and modal enter animations
- `toast.success()` / `toast.error()` from `@/components/ui` for all feedback

---

## Commit Message Format

All commit messages must follow Conventional Commits format.

### Format:
```
type(scope): short description in lowercase
```

### Types:

| Type       | When to use                                      |
|------------|--------------------------------------------------|
| `feat`     | New feature, endpoint, or component              |
| `fix`      | Bug fix                                          |
| `refactor` | Restructure without behavior change              |
| `chore`    | Config, deps, tooling, barrel exports            |
| `docs`     | Documentation, comments, Swagger decorators      |
| `style`    | Formatting only — no logic change                |
| `test`     | Adding or updating tests                         |
| `security` | Security fix or hardening                        |
| `perf`     | Performance improvement                          |

### Scopes:

| Scope          | Project                  | When to use                               |
|----------------|--------------------------|-------------------------------------------|
| `auth`         | `api/auth`               | Auth flows, tokens, strategies            |
| `users`        | `api/auth`               | User profile, registration                |
| `verification` | `api/auth`               | ID verification flow                      |
| `citizen`      | `api/auth`               | Citizen API lookup                        |
| `admin`        | `api/admin`              | Admin auth, invite flow, admin management |
| `audit`        | `api/admin`              | Audit log writes                          |
| `signature`    | `api/signature`          | PKI, key pairs, certificates, signing     |
| `stamp`        | `api/stamp`              | Document stamping, dual-signature         |
| `institution`  | `api/institution`        | Institution CRUD, stamp authority         |
| `documents`    | `api/documents`          | Document lifecycle, collaboration         |
| `engine`       | `engine/`                | AI verification engine                    |
| `prisma`       | any `api/`               | Schema, migrations, seed                  |
| `s3`           | any `api/`               | File upload, presigned URLs               |
| `mailer`       | `api/auth` or `api/admin`| Email templates and service               |
| `ui`           | any `app/`               | Primitive UI components                   |
| `shared`       | any `app/`               | Shared layout components                  |
| `middleware`   | any `app/`               | Next.js middleware                        |
| `guards`       | any `api/`               | Auth guards, role guards                  |
| `editor`       | `app/documents`          | Rich text editor components               |

### Good examples:
```
feat(auth): add password reset flow with 1-hour expiring tokens
fix(verification): resolve 401 on page refresh with sessionStorage fallback
security(guards): enforce role check on all admin-protected routes
feat(documents): add collaborator invitation with 7-day expiring token
feat(signature): generate RSA-4096 key pair with encrypted private key storage
feat(stamp): implement dual-signature stamp with institution + personal keys
feat(institution): add stamp authority grant/revoke endpoints
fix(editor): preserve query params in middleware redirect for invitation flow
perf(citizen): add in-memory cache for NID lookup responses
feat(ui): add responsive mobile navigation with hamburger menu
```

---

## CRITICAL — Git Commands Must Be Copy-Paste Ready

Claude must **NEVER** run git commands automatically.

**Always present git commands in this exact format:**

```
git add "src/path/to/specific/file.ts"
git commit -m "feat(scope): description"
```

### Non-negotiable git rules:

1. **Always quote the file path** — `git add "src/modules/auth/auth.service.ts"`
2. **One file per `git add`** — never `git add .` or `git add -A`
3. **Path is relative to the project root** (where `package.json` lives):
   - ✅ `src/modules/auth/auth.service.ts` (inside `api/auth/`)
   - ❌ `api/auth/src/modules/auth/auth.service.ts`
   - ✅ `src/modules/documents/documents.service.ts` (inside `api/documents/`)
   - ❌ `api/documents/src/modules/documents/documents.service.ts`
4. **Never include `cd project-name`** in git command blocks
5. **Never run `git push`** — the developer decides when to push
6. **One logical change per commit** — never bundle unrelated files
7. **Present commands as text to copy** — never execute them

---

## Environment Variables

- `.env` is never committed — always in `.gitignore`
- `.env.example` is always committed and always kept current
- When adding a new variable, add it to `.env.example` first with a
  descriptive comment and generation instructions:

```env
# JWT signing secret — min 64 characters
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your_value_here
```

### Shared secrets across services (must be identical values):
- `JWT_SECRET` — shared between `api/auth`, `api/signature`, `api/stamp`,
  `api/institution`, `api/documents` (all validate; only `api/auth` issues)
- `ENCRYPTION_SECRET` — shared between `api/auth`, `api/admin`,
  `api/documents` (NID/PID decryption)
- `INSTITUTION_ENCRYPTION_SECRET` — shared between `api/institution`
  (generates) and `api/stamp` (decrypts)
- `SIGNATURE_ENCRYPTION_SECRET` — shared between `api/signature`
  (generates) and `api/stamp` (decrypts)

### Service-exclusive secrets (must never be shared):
- `ADMIN_JWT_SECRET` — `api/admin` only, completely separate from `JWT_SECRET`
- `ENGINE_API_KEY` — used by `api/auth` to call `engine/` internally

---

## What Claude Must Never Do

- Never run `git add .` — always specify the exact file path
- Never run `git push` — the developer controls this
- Never run database migrations without explicitly informing the developer
- Never delete files without explicit instruction
- Never install packages without explaining why they are needed
- Never modify `.env` — only `.env.example`
- Never use `console.log` for production debugging — use the Logger service
- Never generate placeholder or TODO code and present it as complete
- Never skip `npm run build` before declaring a solution complete
- Never put a real or realistic-looking secret in any code example
- Never write code that stores passwords, tokens, NIDs, PIDs, or private
  keys in plain text
- Never cross service boundaries (e.g. `app/admin` calling `api/auth`,
  or `app/documents` calling `api/auth` directly for business logic)

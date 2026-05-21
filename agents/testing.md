# api/admin Testing Rules

## Add Tests When

- A role gate changes.
- An audit-on-write path changes.
- Certificate review or sanction behavior changes.
- Decrypt or identifier access behavior changes.
- Pagination or filtering helpers change.

## Validation Commands

```bash
npm run build
npm run test
```

Docs-only changes do not require a build. Say that explicitly.

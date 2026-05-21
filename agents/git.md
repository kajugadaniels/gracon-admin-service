# api/admin Git Rules

Codex must never run git commands automatically.

Use paths relative to `api/admin`.

```bash
git add "src/modules/admins/admins.service.ts"
git commit -m "feat(admin): add admin lifecycle audit"
```

Rules:

- One file per `git add`.
- Never use `git add .` or `git add -A`.
- Never include `cd api/admin`.
- Never run `git push`.
- Use Conventional Commits.

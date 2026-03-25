# Documentation maintenance

Docs drift when code changes without updates. Use a light process so README and `docs/` stay trustworthy.

---

## When to update (always)

In the **same PR** as the change:

- New or renamed **environment variables** → `.env.example`, [SECRETS.md](./SECRETS.md), and README if it’s user-facing.
- New **npm scripts** → `package.json` and README “Scripts” / [SETUP.md](./SETUP.md).
- **Deploy or domain** changes → [VERCEL_DEPLOY.md](../VERCEL_DEPLOY.md), [DOMAIN_SETUP.md](../DOMAIN_SETUP.md), or [EXPO_AND_VERCEL.md](./EXPO_AND_VERCEL.md) as appropriate.
- **Architecture** shifts (e.g. new backend) → short note in [adr/](./adr/) or README.

---

## Periodic review (e.g. quarterly)

Spend ~15 minutes:

1. Run `npm run verify` on `main` and confirm [CI](../.github/workflows/ci.yml) is green on GitHub.
2. From a clean clone, follow [SETUP.md](./SETUP.md) until the app starts; fix any broken command or path.
3. Skim README “Quick start” vs actual scripts; align if needed.
4. Confirm `.env.example` lists every `EXPO_PUBLIC_*` and that Vercel-only vars are still listed in [SECRETS.md](./SECRETS.md).

---

## Outdated docs

If a root-level markdown file is superseded, add one line at the top: **“See docs/SETUP.md for current setup”** (or retire the file in a dedicated PR). Avoid duplicate procedures in two places without a single source of truth.

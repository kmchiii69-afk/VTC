# Setup on new device — start here

This file is for whoever (or whichever Claude) picks up this project on a new
machine. Follow it top to bottom.

## 0. What this project is
- A **Next.js** app (client portal + admin for Goh Consulting).
- ⚠️ **Read `AGENTS.md` first.** This repo runs a Next.js version with breaking
  changes vs. what you may know. Before writing code, read the relevant guide in
  `node_modules/next/dist/docs/`. Heed deprecation notices.
- Package manager: **npm** (there is a `package-lock.json`; do not switch to
  yarn/pnpm).
- Built and verified locally on **Node v24.15.0 / npm 11.12.1**. Use Node 24.x.

## 1. Get the code onto the machine
You arrived here from a zip (`Goh-Consulting--transfer.zip`) synced via cloud
storage. Unzip it to wherever you want the project to live. That's it — the zip
already contains the full `.git` history, all branches, the stash, and
`.env.local`.

> If for any reason the zip is unavailable, you can instead
> `git clone https://github.com/kmchiii69-afk/Goh-Consulting-` — `main` is fully
> current on GitHub. But a fresh clone will **NOT** include `.env.local` (see §3),
> so you'd have to copy that over separately.

## 2. Install dependencies
```bash
npm install
```
This rebuilds `node_modules/` (~688 MB) and `.next/` on first run — both were
intentionally excluded from the transfer because they regenerate.

## 3. Confirm secrets are present
The app will not run without `.env.local` (Supabase, Discord, AI keys, etc.).
```bash
ls -la .env.local     # must exist at the project root
```
It's included in the zip. If you cloned from GitHub instead, `.env.local` is
gitignored and will be missing — copy it over from the old machine.
**Treat `.env.local` as sensitive; don't commit it or leave copies in shared folders.**

## 4. Run it
```bash
npm run dev
```
Next dev server (typically http://localhost:3000, or :3001 if 3000 is taken).
Other scripts: `npm run build`, `npm start`, `npm run lint`.

## 5. Git state — read this so you don't get confused
Verify after unzip:
```bash
git status        # clean tree, on branch main
git branch        # main, integration, fathom-checkin-integration
git log -1        # tip: "Add member to-dos, monthly check-in gate, ..." (937db44)
git stash list    # stash@{0}: wip-before-team-sync
```

- **`main` is the source of truth and is fully pushed to GitHub (`origin/main`).**
  This is where all current work lives. Keep working on `main` (or feature
  branches off it).
- **`fathom-checkin-integration`** is an **OLD, obsolete branch (June 3)**.
  `main` moved ~40k lines past it and already contains the Fathom check-in
  feature. Do **not** try to merge this branch — it would be a massive backward
  diff. It's kept only as historical backup. Safe to ignore or delete.
- **`integration`** is also stale (behind `origin/main`). Ignore.
- **`stash@{0}` ("wip-before-team-sync")** is just a one-line dependency add
  (`@vercel/speed-insights` in package.json). Likely already handled by the
  `vercel/install-vercel-speed-insights` branch on the remote. Drop it unless you
  know you need it: `git stash drop` after checking `git stash show -p`.

## 6. Deploy
Pushing `main` auto-deploys to **gohconsulting.app** (Vercel). Only push when you
intend to deploy. `git push`/`fetch`/`pull` must be run from a real terminal with
your GitHub credentials.

## 7. Where things left off
`main`'s latest commit added: member to-dos, a monthly check-in gate, a dedicated
AI channel, and a home redesign. The `.git` history and commit messages are the
authoritative record of recent work — read `git log --oneline -20` for context.

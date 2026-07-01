# Deployment — gatewaydebthelp.frontend

> **Read this before attempting any deploy.** Mirrors the deploy authority already in
> place for the sister frontends (`debthelpform.frontend`, `debtreliefguard.frontend`) —
> same design, same trust boundary, same backend.

## TL;DR
- This repo is **PUBLIC**. It holds **no Cloudflare secrets** and **must not**.
- Production is deployed from the **PRIVATE** repo **`Darpadebt-Inc/debthelpform.backend`**,
  workflow **"Deploy Frontends to Cloudflare Pages"** (`.github/workflows/deploy-frontends.yml`).
- That backend workflow holds the only `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
  and deploys all three public frontends (`debthelpform.frontend`, `debtreliefguard.frontend`,
  `gatewaydebthelp.frontend`).

## Why route deploys through the backend (security rationale — keep this)
The Cloudflare API token can edit/deploy production. The frontends are **public**;
the backend is **private**. A production-deploy credential living in a public repo is a
real risk (broad visibility, fork/PR exfiltration, accidental exposure). Centralizing it
in one private repo gives: a single rotation point, least privilege, and no secret sprawl
across public repos.

**Do NOT add `CLOUDFLARE_*` secrets to this public repo.** The backend is the source of truth.

## Automated deploy (proxy-mediated — Horizon Sync)
A push to this repo's `main` triggers a production deploy **automatically** — no manual
step required. `.github/workflows/trigger-deploy.yml` mints an **ephemeral GitHub OIDC
token** (no secret is stored in this public repo) and calls the backend proxy worker
`069-deploy-trigger`, which verifies the token (signature + strict claim allowlist) and
forwards a `repository_dispatch` to the backend **"Deploy Frontends to Cloudflare Pages"**
workflow. The manual `workflow_dispatch` path below still works unchanged as a fallback.

The forwarding credential lives only as a Cloudflare Worker secret — this repo stays
sterile. Full design: backend **`docs/HORIZON-SYNC-DEPLOY-TRIGGER.md`**.

## How to deploy manually (fallback path)
1. Merge your changes to this repo's `main` (the backend workflow deploys `main`).
2. Ensure the backend repo's Actions secrets are valid:
   - `CLOUDFLARE_API_TOKEN` — Cloudflare token with **Account → Cloudflare Pages → Edit**
   - `CLOUDFLARE_ACCOUNT_ID` — `edc1ec2ddc9e28cc26bc647ade3c091d`
   - Set at: GitHub → `Darpadebt-Inc/debthelpform.backend` → Settings → Secrets and variables → Actions
3. Run **`debthelpform.backend` → Actions → "Deploy Frontends to Cloudflare Pages" → Run workflow**.
4. The hardened workflow pins the exact Pages project (`gatewaydebthelp-frontend`),
   fails RED on missing/rejected creds, and runs a post-deploy production smoke check
   (so "green" means actually live).

## Pinned Cloudflare Pages project
| Frontend repo             | Pages project                | Domain                |
|----------------------------|-------------------------------|------------------------|
| gatewaydebthelp.frontend   | `gatewaydebthelp-frontend`    | gatewaydebthelp.com   |

> **Prerequisite this deploy does not create:** a Cloudflare Pages project named
> `gatewaydebthelp-frontend` must exist in the account before the first automated or
> manual deploy succeeds. If it does not exist yet, the backend workflow's project
> resolution step fails RED with a clear "no matching Pages project" error rather than
> silently deploying nowhere — create the project once (Cloudflare dashboard or
> `wrangler pages project create gatewaydebthelp-frontend`), then re-run.

## Common failure: `code 10000 Authentication error`
The token in the backend secret is invalid/expired/revoked. Generate a **new** token
(Account → Cloudflare Pages → Edit), set it as `CLOUDFLARE_API_TOKEN` in the backend
repo secrets, then re-run the backend workflow.

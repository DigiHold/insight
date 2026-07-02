# Insight

A private, personal analytics tool for all of Nicolas's sites (Amabrik, LinkedGrow, DigiHold, nicolas-lecocq, and future ones).
Real time, clear, richer than GA4, self-hosted on a Contabo VPS. No caps, fixed price.

The full spec (data, schema, sources, AI detection, deployment) lives in **[docs/data.md](docs/data.md)**. Read it before writing any code.

## Stack

- Next.js 15 + TypeScript strict + Tailwind v4 (dashboard and collector)
- ClickHouse (events, self-hosted, no cap)
- SQLite (config: admin account, sites, 2FA)
- Docker Compose, listens only on 127.0.0.1:8787
- Auth.js + TOTP 2FA, noindex + robots.txt (strictly private)

> The Contabo VPS already hosts the DigiHold sites. Insight is isolated: its own network and volumes,
> no port 80/443, and the existing reverse proxy serves the subdomain. See [docs/deploy-vps.md](docs/deploy-vps.md).

## Build status

- [x] Infra: docker-compose, Caddyfile, ClickHouse schema, `t.js` tracker, scripts
- [ ] Phase 1: Next.js app (collector `/api/collect` + `/api/ai-hit`)
- [ ] Phase 2: source classification + GeoIP + UA parsing
- [ ] Phase 3: AI bot detection (UA + IP verification)
- [ ] Phase 4: real-time dashboard
- [ ] Phase 5: auth + 2FA + noindex
- [ ] Phase 6: Contabo deployment + backups
- [ ] Phase 7: install the tracker on the 4 sites

## Local start

```bash
cp .env.example .env      # fill in the secrets
docker compose up -d clickhouse   # just the database until the app is scaffolded
```

## Deployment (VPS)

Runs automatically on every push to `main` via GitHub Actions (`.github/workflows/deploy.yml`).
Secrets to set in the GitHub repo: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

## Backups

`scripts/backup.sh` runs in cron at 3 a.m.: ClickHouse dump (Native) + SQLite, with 7-day rotation.

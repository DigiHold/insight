# Insight CLI

Read your analytics from the terminal. It talks to your Insight server over HTTPS
with a read-only token, so it works from any machine and lets an assistant answer
questions like "how many visitors in the last 30 days, and the top pages".

## 1. Create the token on the server

Set a long random token in the server environment and restart the container:

```bash
INSIGHT_API_TOKEN=$(openssl rand -hex 32)
```

The token is read-only. It can read stats and list sites. It cannot change
anything, and it never unlocks the dashboard, which still needs the password and
2FA.

## 2. Configure the CLI on your machine

Either export two variables:

```bash
export INSIGHT_URL="https://insight.example.com"
export INSIGHT_TOKEN="the-token-you-set-on-the-server"
```

or write `~/.config/insight/config.json`:

```json
{ "url": "https://insight.example.com", "token": "the-token-you-set-on-the-server" }
```

## 3. Use it

```bash
node cli/insight.mjs sites                 # list sites (id, name, url)
node cli/insight.mjs stats                 # all sites, last 30 days
node cli/insight.mjs stats 7d              # last 7 days
node cli/insight.mjs stats today --site amabrik.com
node cli/insight.mjs stats --from 2026-06-01 --to 2026-06-30
node cli/insight.mjs stats 30d --json      # raw JSON
```

`--site` accepts a site id, name, or domain. Omit it for all sites. Periods are
`today`, `7d`, `30d`, `90d`.

To call it as `insight`, symlink it onto your PATH:

```bash
chmod +x cli/insight.mjs
ln -s "$(pwd)/cli/insight.mjs" /usr/local/bin/insight
insight stats 30d
```

The report shows visitors, pageviews, bounce rate, average time, revenue (when
Stripe is connected), new vs returning, and the top pages, sources, referrers,
countries, devices and browsers for the period.

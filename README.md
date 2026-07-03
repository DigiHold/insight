<p align="center">
  <img src="https://insightsite.nicolaslecocq.com/og.svg" alt="Insight — cookieless, self-hosted web analytics" width="640">
</p>

<h1 align="center">Insight</h1>

<p align="center">
  Cookieless, self-hosted web analytics. Real-time visitors, revenue and AI crawlers,<br>
  on your own server, with nothing stored on your visitors' devices.
</p>

<p align="center">
  <a href="https://insightsite.nicolaslecocq.com">Website</a> ·
  <a href="docs/setup.md">Setup guide</a> ·
  <a href="cli/README.md">CLI</a> ·
  <a href="LICENSE">MIT license</a>
</p>

---

## What is this?

Insight is a web analytics dashboard you run on your own server. You install it once with Docker, paste one script tag on your sites, and open a dashboard that shows you, in real time, who is visiting, from where, what they read, what they buy, and which AI bots crawl your pages.

There is no SaaS, no account to create anywhere, and no third party. Every byte stays in a database on the machine you chose.

## Why people use it

- **No cookie banner.** By default the tracker sets nothing on the visitor's device: no cookies, no localStorage. Visitors are counted with a salted hash that rotates daily and raw IP addresses are never stored.
- **Real time that feels real.** The dashboard refreshes every 5 seconds. "Online now" is engagement-based, so an abandoned tab drops off in about a minute instead of haunting your live count for hours.
- **Money, not just traffic.** Connect Stripe with a read-only key and see which channels and campaigns bring paying customers, refunds included.
- **The AI angle.** Insight logs every fetch by ChatGPT, Claude, Perplexity, Googlebot and friends, per page, even though bots never run JavaScript. You see exactly what the AI answers are reading.
- **Yours.** MIT licensed. Fork it, change it, run it forever. No pricing page will ever appear.

## What you get

| Area | Details |
|---|---|
| Audience | Visitors, pageviews, bounce rate, engaged time, new vs returning, live feed, live 3D world map with per-visitor detail |
| Acquisition | Channels (search, social, AI, referral, direct), referrers, campaigns, full UTM breakdown, Search Console keywords |
| Content | Top pages, landing pages, exit pages, outbound clicks |
| Locations | Countries, regions, cities, languages |
| Revenue | Stripe revenue net of refunds, conversion rate, revenue per visitor, source and campaign attribution from your own purchase events |
| Behavior | Funnels (2 to 4 steps), weekly retention cohorts, busy-hours heatmap |
| Bots | AI and indexing crawlers per page, split into AI answers, indexing and training |
| Comfort | Today / 7d / 30d / 90d / custom range, chart notes, light and dark themes, drag-and-drop dashboard customization, read-only CLI |

Optional connections, each one takes a few minutes and is covered in the [setup guide](docs/setup.md): Google Analytics 4 (same numbers as GA4 for history), Google Search Console (keywords), Stripe (revenue), Mapbox (the globe).

## Quick start

You need a small Linux server (1 vCPU / 2 GB RAM is plenty) and a domain.

```bash
# 1. On a fresh Ubuntu server: Docker, firewall, auto security updates
curl -fsSL https://raw.githubusercontent.com/DigiHold/insight/main/scripts/provision.sh | bash

# 2. Get the code and configure it
git clone https://github.com/DigiHold/insight /opt/insight && cd /opt/insight
cp .env.example .env
nano .env        # set ADMIN_EMAIL, ADMIN_PASSWORD, AUTH_SECRET, CLICKHOUSE_PASSWORD

# 3. Start it
docker compose up -d
```

Then point a subdomain (for example `insight.yourdomain.com`) at the server with HTTPS, open it, sign in, add your site, and paste the one-line script it gives you into your site's `<head>`:

```html
<script defer data-site="YOUR_SITE_ID" src="https://insight.yourdomain.com/t.js?s=YOUR_SITE_ID"></script>
```

Visits appear on the dashboard within seconds. The [setup guide](docs/setup.md) walks through every step in detail, including HTTPS, backups and the optional integrations.

## Privacy, honestly stated

Words like "compliant" get thrown around a lot, so here is exactly what Insight does:

- **No cookies, and by default nothing else on the device either.** The EU storage rule (the one behind cookie banners) covers localStorage the same way it covers cookies, so Insight's default mode stores nothing at all client-side.
- **Visitors are counted with a salted SHA-256 hash that rotates every day.** The raw IP address is never written to the database and cannot be recovered from the hash.
- **All data stays on your server**, in the country and jurisdiction you picked. No third party receives anything.
- **Optional precise mode.** Adding `data-persist="true"` to the script tag stores a random first-party id in localStorage for exact returning-visitor and retention tracking. If you enable it, treat it like a cookie: mention it in your privacy policy and, for EU audiences, in your consent flow. The default does not need any of that.

One honest caveat: no analytics tool can make your website "GDPR compliant" on its own, because compliance is about everything you do with personal data, not one script. What Insight gives you is an analytics setup designed to be used without a consent banner and without retaining personal data.

## Ask your terminal (or your AI assistant)

Insight ships a read-only CLI. Set one token on the server and you can do:

```bash
insight stats 30d
insight stats today --site myshop.com
insight sites
```

It prints visitors, pageviews, revenue, top pages, sources, countries, devices and browsers for any period. Point Claude or any assistant at it and ask questions in plain words. The token can only read; it never unlocks the dashboard. See [cli/README.md](cli/README.md).

## Security model

- The dashboard has **no public sign-up and no register endpoint**. The only admin is the email and password you set in the server environment, compared in constant time.
- **2FA is mandatory**: the first login shows a QR code to scan with any authenticator app, and every login after that requires the 6-digit code.
- Sessions are HMAC-signed with your `AUTH_SECRET` and expire after 30 days.
- The dashboard is `noindex` and disallowed in robots.txt.
- Secrets live only in your `.env` on your server. The repository contains none.

## Stack

Next.js 15 (App Router, standalone) + React 19 + TypeScript + Tailwind CSS v4. ClickHouse for events, SQLite for configuration. Mapbox GL for the globe, Recharts for charts. Two containers via Docker Compose, and an optional GitHub Actions workflow that builds the image and deploys to your server over SSH on every push.

## License

[MIT](LICENSE). Built by [Nicolas Lecocq](https://nicolaslecocq.com).

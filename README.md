# Insight

Self-hosted, privacy-first web analytics you run on your own VPS. It gives you the real-time visitor map and the clean dashboard of a commercial analytics tool, plus revenue, AI-crawler tracking, funnels and retention, without cookies, without a consent banner, and without sending a single byte to a third party.

Everything lives on your server: a Next.js app, a ClickHouse database for events, and a small SQLite file for configuration. You own the data.

## What it tracks

**Audience**
- Real-time visitors on an interactive 3D globe, with per-visitor detail (country, device, browser, current page, session time). Presence is engagement-based, so a visitor who leaves drops off in about a minute, the same way GA4 behaves.
- Visitors, page views, bounce rate and average engaged time, each with the change against the previous period.
- New vs returning visitors.
- A live feed of pageviews as they happen.

**Acquisition**
- Channels (search, social, AI, referral, direct), referrers, and campaigns.
- Full UTM breakdown: source, medium, campaign, term, content.
- Search Console keywords with position, impressions, clicks and CTR when Google Search Console is connected.

**Content**
- Top pages, landing pages, exit pages, and outbound link clicks.

**Locations**
- Countries, regions, cities and visitor languages.

**Revenue**
- Stripe revenue over any period, net of refunds, with new vs refunded amounts and daily bars on the chart.
- Conversion rate and revenue per visitor.
- Revenue attribution: which traffic source and which campaign actually bring the money, using your own purchase events.

**Behavior**
- Funnels of 2 to 4 pages with the pass-through rate at each step.
- Weekly retention cohorts.
- A busy-hours heatmap (day of week against hour) so you know when your audience is around.

**AI and indexing crawlers**
- Which AI and search bots fetch your pages (ChatGPT, Google, Bing, Gemini, Amazon, Anthropic, Meta and more), split into AI answers, indexing and training, with the exact pages each one crawled. Detection is server-side, so it works even though bots never run JavaScript.

**Everything else**
- Any period: today, 7, 30 or 90 days, or a custom date range with a real calendar.
- Dated notes on the chart to explain traffic spikes.
- Light and dark themes that follow the system.

## Privacy

Insight is cookieless and needs no consent banner. Visitors are counted with a salted hash and never with a stored raw IP address. Nothing leaves your server. Data-center traffic and known bots are filtered out, so a visitor count means real people.

## How it works

The tracking script is a single line in your site's `<head>`. It sends pageviews and a light heartbeat to `/api/collect` on your own domain. Events go into ClickHouse. The dashboard reads from ClickHouse in real time for today, and reads Google Analytics live for the 7, 30 and 90 day periods when GA4 is connected, so the numbers match GA4 exactly. Stripe revenue is pulled with a read-only key.

## Stack

- Next.js 15 (App Router, standalone) and React 19, TypeScript, Tailwind CSS v4.
- ClickHouse for events, SQLite for configuration.
- Mapbox GL for the globe, Recharts for charts.
- Runs as two containers with Docker Compose. An optional GitHub Actions workflow builds the image and deploys over SSH on every push.

## Quick start

1. Get a VPS from any provider. On a fresh Ubuntu box, `scripts/provision.sh` installs Docker, a firewall and automatic security updates.
2. Clone this repo into `/opt/insight`, copy `.env.example` to `.env`, and fill in the values.
3. Run `docker compose up -d`.
4. Point a subdomain at `127.0.0.1:8787` through your existing reverse proxy or panel, with HTTPS.
5. Open the dashboard, add your site, and paste the one-line script into your site's `<head>`.

The full guide is in [docs/setup.md](docs/setup.md). It covers connecting GA4, Search Console and Stripe, enabling revenue events and funnels, and how the one-click Google connection works.

## License

Personal project, provided as-is. Use it, fork it, run it on your own infrastructure.

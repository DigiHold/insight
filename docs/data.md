# DATA - Build plan for the personal analytics tool (code name: Insight)

> This file is the build contract. A Claude assistant that opens this folder should be able to
> build the tool exactly as described here, without guessing. Goal: replace GA4 with a real-time,
> very clear, fully personal dashboard for all of Nicolas's sites (current and future),
> hosted on his Contabo VPS. The aim is a clean, readable interface.

---

## 0. Decisions already made (do not reopen)

- Hosting: **Contabo VPS** (already owned). No Vercel for collection or the database.
- Events database: **self-hosted ClickHouse**. No cap, fixed cost of the VPS.
- No tracking of X/Reddit mentions (too expensive via API). We keep only the server-side **AI bot detection**, which is free.
- Strictly private tool: password access + 2FA, invisible to search engines and AI (noindex + robots.txt).
- The project lives in a **private** git repo under `~/Documents/GitHub/insight` (name to confirm).
- The VPS must **auto-deploy on every commit** to `main` and run a **daily backup**.

---

## 1. Technical guarantee

Yes, everything below is fully doable on the VPS:

- **Real time**: ClickHouse answers in under a second over millions of rows. The dashboard queries "the last 5 minutes" every 3 to 5 seconds. You see visitors live.
- **Where visitors come from**: HTTP referrer + UTM parameters + classification into clear categories (Google, X, LinkedIn, Facebook, Reddit, AI, direct, etc.).
- **Which link or social channel they clicked**: we capture the full referrer and the destination URL.
- **Which AI crawled or cited the site**: server-side detection by user-agent + verification of the IP against the official ranges each vendor publishes.
- **More data than GA4**: in particular the AI signal (crawl and citation) that GA4 does not provide at all.

One honest limit to know (also true for GA4): some native apps (Instagram, sometimes LinkedIn/Facebook in-app, some AI apps) **strip the referrer**. In that case the visitor lands as "direct / unknown". We reduce this with UTM tags on the links Nicolas posts himself, and the server-side AI signal stays fully reliable because it is based on the verified IP, not on a referrer.

---

## 2. Architecture

```
  Your sites (Amabrik, LinkedGrow, DigiHold, Nicolas, future ones)
        |  <script src="https://insight.yourdomain.com/t.js"></script>  (1 kb)
        v
  [ Caddy ]  reverse proxy + auto HTTPS (Let's Encrypt)
        |
        +--> /api/collect   (ingestion route)   --->  [ ClickHouse ]  events + ai_hits + revenue
        +--> /api/ai-hit    (bot middleware)     --->  [ ClickHouse ]
        +--> /              (Next.js dashboard, protected by login + 2FA)
        |                                        <---  [ Postgres ] users, sites, config
        +--> Stripe / LemonSqueezy / Polar webhooks  --->  attributed revenue
```

A single Contabo VPS runs all of this through **Docker Compose**:
`caddy`, `app` (Next.js), `clickhouse`, `postgres`.

---

## 3. Exact stack (all verified, all free or fixed price)

| Role | Tech | Cost | Note |
|---|---|---|---|
| Framework | Next.js 15 (App Router, RSC) + TypeScript strict | free | Nicolas's usual stack |
| UI | Tailwind v4 + shadcn/ui (customized) | free | clear dashboard |
| Charts | Recharts or visx | free | real-time curve + bars |
| Events database | ClickHouse (official Docker) | free | no cap |
| Config/auth database | Postgres 16 (Docker) | free | users, sites, keys |
| Reverse proxy / HTTPS | Caddy 2 (Docker) | free | automatic certificate |
| Auth + 2FA | Auth.js (NextAuth) credentials + TOTP | free | a single admin account |
| GeoIP | MaxMind GeoLite2 (local file) | free | country / city, free account required |
| UA parsing | ua-parser-js | free | browser / OS / device |
| Referrer parsing | Snowplow referer-parser list | free | source / medium |
| ClickHouse client | @clickhouse/client | free | batch insert + query |
| Backup | clickhouse-backup + pg_dump + cron | free | daily |
| CI/CD | GitHub Actions (private repo) | free | SSH deploy on push |

The only real cost: the **Contabo VPS, already paid for**. Nothing else bills you. No hidden tiers.

---

## 4. Security and invisibility

- Dedicated subdomain, e.g. `insight.yourdomain.com`, A record to the VPS IP.
- **Mandatory login** (Auth.js) + **2FA TOTP** (Google Authenticator / 1Password). A single account: Nicolas.
- `robots.txt` = `User-agent: *` / `Disallow: /` to block everything.
- Meta `noindex, nofollow` + `X-Robots-Tag: noindex` header on every page.
- Optional: restrict by IP at the Caddy level, or put Cloudflare Access in front, so only you are exposed.
- Forced HTTPS, HSTS enabled.
- The `/api/collect` endpoint is public (the site scripts have to call it) but it only accepts events, returns no data, and is rate-limited.

---

## 5. Captured data (ClickHouse schema)

### Table `events` (each pageview / click)
```sql
CREATE TABLE events (
  ts            DateTime64(3) DEFAULT now64(),
  site_id       LowCardinality(String),      -- amabrik, linkedgrow, digihold, nicolas...
  visitor_id    String,                        -- hash(ip + ua + daily salt) => cookieless
  session_id    String,
  event_type    LowCardinality(String),        -- pageview | click | custom | conversion
  url           String,
  pathname      String,
  query         String,
  referrer      String,                         -- full raw referrer
  source        LowCardinality(String),         -- google | x | linkedin | facebook | reddit | chatgpt | direct...
  source_type   LowCardinality(String),         -- search | social | ai | referral | direct
  utm_source    String,
  utm_medium    String,
  utm_campaign  String,
  utm_term      String,
  utm_content   String,
  landing_page  String,
  click_target  String,                         -- for event_type = click: clicked href
  country       LowCardinality(String),
  region        String,
  city          String,
  device        LowCardinality(String),         -- desktop | mobile | tablet
  browser       LowCardinality(String),
  os            LowCardinality(String),
  language      LowCardinality(String),
  screen_w      UInt16,
  duration_ms   UInt32
) ENGINE = MergeTree
ORDER BY (site_id, ts);
```

### Table `ai_hits` (crawl and citation by an AI, server-side)
```sql
CREATE TABLE ai_hits (
  ts          DateTime64(3) DEFAULT now64(),
  site_id     LowCardinality(String),
  path        String,
  bot_name    LowCardinality(String),           -- GPTBot | ChatGPT-User | ClaudeBot | PerplexityBot...
  vendor      LowCardinality(String),           -- openai | anthropic | perplexity | google | xai...
  category    LowCardinality(String),           -- answer | search | training
  ua_string   String,
  ip          String,
  verified    UInt8,                             -- 1 if IP validated against the official range
  status_code UInt16                             -- useful to spot the 404s an AI tries to read
) ENGINE = MergeTree
ORDER BY (site_id, ts);
```

### Table `revenue` (revenue attribution)
```sql
CREATE TABLE revenue (
  ts          DateTime64(3) DEFAULT now64(),
  site_id     LowCardinality(String),
  visitor_id  String,
  amount      Decimal(12,2),
  currency    LowCardinality(String),
  provider    LowCardinality(String),           -- stripe | lemonsqueezy | polar
  source      LowCardinality(String),           -- attributed source (first touch)
  campaign    String
) ENGINE = MergeTree
ORDER BY (site_id, ts);
```

Postgres keeps only: the admin account (email, hash, TOTP secret), the list of sites with their public tracking key, and the config.

---

## 6. Source classification (the "clarity" point)

The collector turns the raw referrer into a **readable category** before insertion. Priority rule: explicit UTM > known referrer > direct.

**Search (`source_type = search`)**
`google.*`, `bing.com`, `duckduckgo.com`, `search.brave.com`, `ecosia.org`, `qwant.com`, `yahoo.*`.

**Social (`source_type = social`)**
- X: `x.com`, `twitter.com`, `t.co`
- LinkedIn: `linkedin.com`, `lnkd.in`
- Facebook: `facebook.com`, `fb.com`, `l.facebook.com`, `m.facebook.com`
- Reddit: `reddit.com`, `out.reddit.com`, `redd.it`
- Instagram: `instagram.com`, `l.instagram.com`
- YouTube: `youtube.com`, `youtu.be`
- TikTok: `tiktok.com`
- Threads: `threads.net`

**AI referral, a human clicked a link INSIDE an AI answer (`source_type = ai`)**
- ChatGPT: `chatgpt.com`, `chat.openai.com`
- Claude: `claude.ai`
- Perplexity: `perplexity.ai`
- Gemini: `gemini.google.com`
- Grok: `grok.com`, `x.ai`
- Copilot: `copilot.microsoft.com`

**Direct / unknown**: referrer empty or stripped by the app.

The dashboard shows these categories with an icon per platform, exactly like a very readable "where my visitors come from" view.

---

## 7. AI bot detection (crawl and citation)

Two mandatory steps for each incoming request, in a server middleware:
1. The user-agent contains a known token (list below).
2. The request IP is validated against the official range published by the vendor. `verified = 1` only if both match (otherwise it is a spoofer, we log it as `verified = 0`).

**Tokens and IP sources to verify**
| Vendor | User-agent tokens | Official IP source |
|---|---|---|
| OpenAI | `GPTBot` (training), `OAI-SearchBot` (search), `ChatGPT-User` (live citation) | openai.com/gptbot.json, openai.com/searchbot.json, openai.com/chatgpt-user.json |
| Anthropic | `ClaudeBot`, `Claude-SearchBot`, `Claude-User` | IP list published by Anthropic |
| Perplexity | `PerplexityBot`, `Perplexity-User` | IP ranges published by Perplexity |
| Google | `Googlebot`, `Google-Extended`, `GoogleOther` (Gemini uses Google's infra) | Google's googlebot.json |
| xAI (Grok) | xAI crawler | xAI ranges |
| Others | `Bytespider`, `Amazonbot`, `Applebot`, `CCBot`, `meta-externalagent` | per vendor |

**Interpretation for the dashboard**:
- `category = answer` (ChatGPT-User, Perplexity-User, Claude-User) => "the AI used this page to answer someone live". This is the citation signal.
- `category = search` => indexing for AI search.
- `category = training` => collection for training.

The IP lists are refreshed by a small cron (once a day) and cached.

---

## 8. The dashboard (clear, real time)

Site selector at the top (the most recently added site selected by default). Period selector. Everything updates live.

**Real-time block**
- A "X visitors online now" counter (active sessions over the last 5 minutes), refreshed every 3 to 5 s.
- A mini map or list of the countries active right now.

**Acquisition block (the core)**
- A large graph of visitors over time.
- Breakdown by source with icons: Google, X, LinkedIn, Facebook, Reddit, Instagram, AI (ChatGPT / Claude / Gemini / Grok / Perplexity), Direct.
- Top pages, top countries, devices, browsers.
- Top outbound links clicked.

**AI block (what GA4 does not have)**
- "Which AIs read or cited your pages": list of bots, category (citation / search / training), pages involved, hit count, verified yes/no.
- Shows the AI logo next to each entry.

**Revenue block (if connected)**
- Revenue by source, revenue per visitor, conversions.

Everything must stay readable at a glance. No useless vanity metrics, no GA4-style bloat.

---

## 9. Contabo deployment

**VPS prerequisites** (to check / provision):
- OS: Ubuntu 24.04 LTS recommended.
- Docker + Docker Compose installed.
- A non-root user with sudo + SSH key.
- Firewall: open 80 and 443 only (ClickHouse and Postgres stay internal to the Docker network, never exposed).
- DNS: A record `insight.yourdomain.com` to the VPS IP.

**Auto-update on every commit**:
- Private git repo on GitHub.
- GitHub Actions on push to `main`: connects over SSH to the VPS, runs `git pull`, `docker compose build`, `docker compose up -d`. Secrets (SSH key, host) stored in the repo's GitHub Secrets.
- Simpler alternative if you prefer: a small webhook listener on the VPS that runs pull + up when it receives the push. We go with GitHub Actions by default.

**Daily backup**:
- Cron at 3 a.m.: `clickhouse-backup create` + `pg_dump` of Postgres.
- Local rotation over 7 days, plus an optional copy to cheap object storage (Backblaze B2, a few cents) to survive a disk failure.
- Script `scripts/backup.sh` versioned in the repo.

---

## 10. The tracker (script on your sites)

A `t.js` file of about 1 kb, served by the tool. Paste it on each site (one line). It sends via `navigator.sendBeacon` to `/api/collect`: url, referrer, UTM, language, screen size, and a duration ping. No personal data stored in clear text, visitor_id = daily hash, cookieless by default (an optional cookie is available for more precise attribution).

Integration per stack:
- Amabrik (Astro): tag in the layout.
- Nicolas (Astro): same.
- LinkedGrow (Next.js): a `<Script>` component in the root layout.
- DigiHold (WordPress): snippet in the header (or a small mu-plugin).

---

## 11. What I need from you to start

In order:
1. **The domain**: buy it (or pick a subdomain of a domain you already own) and tell me which. Create the A record `insight.<domain>` to the Contabo IP.
2. **Contabo access**: the VPS public IP, the installed OS, and SSH access (ideally a sudo user + my key, or tell me how you want to handle it). Also give the specs (RAM / vCPU / disk) so I can size ClickHouse.
3. **The repo name**: I suggest `insight` under `~/Documents/GitHub/`. Confirm or change it.
4. **MaxMind GeoLite2 account** (free): create it, I will tell you where to paste the license key.
5. **Optional later**: the Stripe / LemonSqueezy / Polar webhook keys if you want revenue.

With the domain + SSH access + the repo, I can build and deploy everything.

---

## 12. Build order (phases)

1. **Scaffold**: Next.js repo + Tailwind + Docker Compose (app, clickhouse, postgres, caddy). It all starts locally.
2. **Ingestion**: `t.js` + `/api/collect` + ClickHouse schema. We see the first events arrive.
3. **Source classification** + GeoIP + UA parsing. The data becomes readable.
4. **AI detection**: bot middleware + IP verification + `ai_hits` table.
5. **Dashboard**: real time, acquisition, AI.
6. **Auth + 2FA + noindex + robots.txt**. The tool becomes private.
7. **Contabo deployment** + Caddy HTTPS + GitHub Actions auto-deploy.
8. **Daily backup** + rotation.
9. **Install the tracker** on the 4 sites. Check the real data live.
10. **Revenue** (optional) via webhooks.

End of plan.

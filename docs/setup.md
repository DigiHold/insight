# Setup and usage

Everything you need to run Insight, connect your integrations, and turn on events. Read the sections in order the first time.

## 1. What you need

- A VPS from any provider (a small one is enough; ClickHouse is light for a personal or small-business volume).
- A domain or subdomain you can point at the server, for example `analytics.yourdomain.com`.
- Docker and Docker Compose on the server.

Country geolocation needs no key. City and region come from GA4 when you connect it, or from Cloudflare's visitor location headers if you enable them (see section 3). There is no MaxMind and no GeoIP database to manage.

## 2. Install

On a fresh Ubuntu server, as root:

```bash
# 1. Prepare the box (Docker, firewall, automatic security updates)
bash scripts/provision.sh

# 2. Get the code and configure it
git clone <your-repo-url> /opt/insight
cd /opt/insight
cp .env.example .env
```

Fill in `.env`:

- `PUBLIC_HOST` your public domain, for example `analytics.yourdomain.com`.
- `CLICKHOUSE_PASSWORD` a strong password (`openssl rand -hex 24`).
- `AUTH_SECRET` a long random string (`openssl rand -hex 32`). This also salts visitor hashing, so keep it stable.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` your dashboard login.
- `MAPBOX_TOKEN` a Mapbox public token, restricted to your domain (see section 6).
- `INSIGHT_TZ` (optional) your timezone as an IANA name, for example `Europe/Zurich`. It decides when "today" starts and drives the heatmap, retention weeks and the revenue overlay. Defaults to `UTC`.

Then start it:

```bash
docker compose up -d
curl -s http://127.0.0.1:8787/api/health   # should return {"status":"ok","clickhouse":"up"}
```

The app listens only on `127.0.0.1:8787`. ClickHouse has no published port and stays internal. The database and its schema are created automatically on first start.

## 3. Put it behind HTTPS

Insight never serves port 80 or 443 itself. Point your subdomain at `127.0.0.1:8787` through the reverse proxy or panel you already have.

Nginx:

```nginx
server {
    server_name analytics.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
        proxy_set_header CF-IPCountry $http_cf_ipcountry;
    }
    listen 443 ssl;
    # certificate from your existing panel or certbot
}
```

With a panel (Plesk, CloudPanel and similar), add the domain, enable its Let's Encrypt SSL, and set a reverse proxy to `http://127.0.0.1:8787`.

**Cloudflare (recommended).** Put the subdomain behind Cloudflare with the orange proxy on. Cloudflare then adds the visitor country for free through the `CF-IPCountry` header, and the real visitor IP through `CF-Connecting-IP`. To also get cities and regions without GA4, open Cloudflare, go to Rules, Transform Rules, Managed Transforms, and turn on "Add visitor location headers". Insight reads `CF-IPCity` and `CF-Region` from there.

## 4. Add a site and install the tracker

Log in to the dashboard, click "Add site", and give it a name and its URL. You get a one-line script:

```html
<script defer data-site="your-site-id" src="https://analytics.yourdomain.com/t.js?s=your-site-id"></script>
```

Put it once in your site's `<head>`. That single line handles pageviews, the live heartbeat, outbound-link clicks, and the server-side AI-crawler detection. There is nothing else to install.

### Privacy default, and the optional precise mode

By default the tracker stores **nothing** on the visitor's device: no cookies and no localStorage. Visitors are counted server-side with a salted hash that rotates daily, and raw IP addresses are never stored. This is the mode that keeps the "no consent banner" claim true, because the EU storage rule covers localStorage exactly like cookies.

The trade-off: a visitor who returns on a later day counts as new again, so "new vs returning" and retention cohorts are approximations beyond a single day.

If you want precise returning-visitor and retention tracking, add one attribute:

```html
<script defer data-site="your-site-id" data-persist="true" src="https://analytics.yourdomain.com/t.js?s=your-site-id"></script>
```

With `data-persist="true"` the tracker stores a random first-party id in localStorage (never a cookie, never fingerprinting). Treat it like a cookie legally: mention it in your privacy policy and, for EU audiences, in your consent flow. Only you can decide which mode fits your site.

## 5. Create the admin account and 2FA (self-hosted auth)

Auth is fully self-hosted. There is no external identity provider and no account on any server but yours. The dashboard has no public sign-up page and no "register" endpoint, so an admin account cannot be created over the network on your instance. The only admin is the one whose credentials you place in the server environment, and only someone with shell or `.env` access to your own box can set them.

Create the account by setting three values in `.env` before the first start:

```bash
# A long random string. It signs sessions and salts visitor hashing, so keep it stable.
AUTH_SECRET=$(openssl rand -hex 32)
# Your login. Use a real address you control and a long, unique password.
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<a long random password from a password manager>
```

Then enroll 2FA on the first login:

1. Open the dashboard and enter that email and password. Wrong credentials never reach the 2FA step, so nobody can start enrollment without the password you set.
2. Insight generates a TOTP secret and shows a QR code. Scan it with an authenticator app such as Google Authenticator, 1Password, or Authy, then enter the 6-digit code.
3. From then on the code is required on every login. The secret is written to `auth.json` inside your data volume and never leaves the server.

Why this stays secure on a public codebase:

- Credentials live only in your server environment, never in the code or the repository. Anyone can read the source without learning how to reach your dashboard.
- Enrollment is gated by the password, and the password is compared in constant time. The QR code and secret are returned only after the correct password.
- Sessions are HMAC-signed with `AUTH_SECRET` and expire after 30 days. If `AUTH_SECRET` is weak, sessions can be forged, so generate it with `openssl rand -hex 32` and keep it private.
- The dashboard is `noindex` and disallowed in `robots.txt`, so it never shows up in search.

To reset access, change the values in `.env`, delete `auth.json` in the data volume to force a fresh 2FA enrollment, then restart the container.

## 6. Connect Mapbox (the globe)

The live map uses Mapbox GL, which needs a public token.

1. Create a free Mapbox account and copy a public token (starts with `pk.`).
2. In the Mapbox token settings, add a URL restriction for your domain, for example `https://analytics.yourdomain.com/*`. A public token is meant to be visible in the browser, and the URL restriction makes it useless anywhere else.
3. Put it in `.env` as `MAPBOX_TOKEN` and restart, or paste it in the dashboard.

## 7. Connect Stripe (revenue)

1. In Stripe, create a restricted key with read access to Charges and Balance.
2. In Insight, open the site menu, click "Connect Stripe", and paste the key.

Revenue then shows over any period, net of refunds, with the new vs refunded split and daily bars on the chart. This covers total revenue. To attribute revenue to a traffic source, use events (section 9).

## 8. Connect GA4 and Search Console

When GA4 is connected, Insight reads Google Analytics live for the 7, 30 and 90 day periods, so those numbers match GA4 exactly, and it uses GA4's cities, regions and languages. Search Console adds your organic keywords.

This uses a Google service account, which is a robot Google account with its own
email address that you let read your Analytics. It is free, and you create it once.
The whole thing takes about five minutes.

### 8a. Create the service account and its JSON key

1. Open the Google Cloud console at https://console.cloud.google.com and sign in with the Google account that owns your GA4 property.
2. Create a project: click the project selector in the top bar, then "New project", give it a name such as `insight-analytics`, and click "Create". Wait a few seconds and make sure that project is selected in the top bar.
3. Enable the APIs. Go to "APIs & Services" then "Library". Search for "Google Analytics Data API" and click "Enable". Then search for "Google Search Console API" and click "Enable" (skip this second one if you will not use Search Console).
4. Create the service account. Go to "APIs & Services" then "Credentials", click "Create credentials", and choose "Service account". Give it a name such as `insight`, click "Create and continue", skip the optional role and access steps, and click "Done".
5. Copy its email. You now have a service account with an email that looks like `insight@your-project-id.iam.gserviceaccount.com`. Google builds this address automatically from the name and your project id, so yours is different from anyone else's. This is the address you will grant access to.
6. Create the JSON key. Click the service account you just made, open the "Keys" tab, click "Add key" then "Create new key", pick "JSON", and click "Create". A `.json` file downloads. That file is the key Insight needs. Keep it private and never commit it.

### 8b. Grant access and connect

7. In GA4, click Admin, then Property Access Management, then the "+" and "Add users". Paste the service account email from step 5, set the role to Viewer, uncheck "Notify by email", and click Add.
8. For Search Console (optional), open your property's Settings, then Users and permissions, add the same email, and give it "Full" or "Restricted" access.
9. In Insight, click "Connect GA4", paste the contents of the JSON file once (it is saved globally and reused for every site), and enter your GA4 property id. You find the property id in GA4 under Admin, Property, Property Settings (a number like `123456789`).

After the JSON is saved, the Connect dialog shows your own service account email so you can copy it into GA4, and each site only needs its property id.

A one-click Google connection (OAuth), which replaces the whole service account
flow with a single consent popup, is described in section 11.

## 9. Turn on events: signups, purchases, and exact attribution

The script exposes a small API on `window.insight`. Use it to record goals and purchases. Both are attributed to the visitor's traffic source, so you can see the full path from source to signup to payment.

**A goal (for example a signup).** Call this when the action happens, for example on the signup confirmation:

```js
window.insight('signup')
```

Any short name works. It records a `goal` event for the current visitor with their source and campaign.

**A purchase.** Call this on your thank-you or payment-success page:

```js
window.insight('purchase', { amount: 99, currency: 'usd' })
```

`amount` is in your normal units (99 means 99.00). This writes to the revenue table with last-touch attribution, which feeds the "Revenue attribution" card: revenue by source and by campaign.

**A complete funnel: source to signup to payment.**

1. Keep the tracking script on every page (already done in section 4).
2. Fire `window.insight('signup')` on your signup success.
3. Fire `window.insight('purchase', { amount, currency })` on your payment success.
4. In Insight, open the Funnel card, click "Set up", and enter the steps as page paths in order, for example `/pricing` then `/signup` then `/welcome`. A visitor counts for a step if they hit the pages in that order within 7 days. The card shows how many make it through each step and the drop-off between them.

Attribution follows the visitor id. In the default (storage-free) mode the id is stable within a day, so same-day journeys from source to payment line up. With `data-persist="true"` (section 4) the id is stable across days, and multi-day journeys attribute precisely too.

## 10. Backups

`scripts/backup.sh` dumps the ClickHouse tables and the SQLite config, with a 7-day rotation. Wire it to cron once:

```bash
( crontab -l 2>/dev/null | grep -v insight/scripts/backup.sh; \
  echo "0 3 * * * /opt/insight/scripts/backup.sh >> /var/log/insight-backup.log 2>&1" ) | crontab -
```

Backups land in `/opt/insight/backups`. For off-server copies, add an `rclone copy` line to object storage at the end of the script.

## 11. One-click Google connection (OAuth), self-hosted

> Planned. Today GA4 and Search Console connect through the service account in section 8. This section describes the one-click flow that replaces it.

The service-account flow in section 8 works but takes a few manual steps. The one-click alternative uses your own Google OAuth app, so connecting GA4 and Search Console becomes a single consent popup that then lists your properties in a dropdown.

Because Insight is self-hosted, each operator uses their own Google OAuth app. That keeps it free and avoids Google's app-verification review, which only applies to a central published app. Setup, once per install:

1. In Google Cloud, create a project. Enable the "Google Analytics Data API" and the "Google Search Console API".
2. Configure the OAuth consent screen as "External", and add yourself as a test user (a self-hosted app can stay in testing indefinitely for your own accounts).
3. Create an OAuth client of type "Web application". Add the redirect URI `https://analytics.yourdomain.com/api/oauth/google/callback`.
4. Copy the client ID and client secret into Insight's settings.

After that, "Connect Google" opens the Google consent popup, you approve read-only access to Analytics and Search Console once, and Insight stores the refresh token on your server and lists your GA4 properties and Search Console sites to pick from. No JSON, no property ID, no manual user invites.

## 12. Read-only CLI (terminal and AI assistants)

Insight ships a small CLI so you can read your stats from a terminal, a script, or an AI assistant, without opening the dashboard.

1. On the server, set a token in `.env` and restart: `INSIGHT_API_TOKEN=$(openssl rand -hex 32)`. The token is read-only; it can list sites and read stats, nothing else, and it never unlocks the dashboard (which still needs the password and 2FA).
2. On your machine, export `INSIGHT_URL` and `INSIGHT_TOKEN`, or write them to `~/.config/insight/config.json`.
3. Run it:

```bash
node cli/insight.mjs sites
node cli/insight.mjs stats 30d
node cli/insight.mjs stats today --site myshop.com
node cli/insight.mjs stats --from 2026-06-01 --to 2026-06-30 --json
```

Full reference in [cli/README.md](../cli/README.md).

## Auto-deploy (optional)

The repo ships a GitHub Actions workflow that builds the image, pushes it to the registry, and deploys over SSH on every push to `main`. Set these repository secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `MAPBOX_TOKEN`. Add the server's public key as a read-only deploy key so the box can pull the repo.

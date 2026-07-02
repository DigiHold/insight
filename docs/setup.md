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

## 5. Dashboard login and 2FA (self-hosted auth)

Auth is fully self-hosted. There is no external identity provider and no account on any server but yours.

- The admin account is the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you set in `.env`.
- On the first successful login, Insight shows a QR code. Scan it with an authenticator app (Google Authenticator, 1Password, Authy) and enter the 6-digit code. Two-factor is then required on every login.
- Sessions are signed with `AUTH_SECRET` and last 30 days. The dashboard is `noindex` and disallowed in `robots.txt`, so it never shows up in search.

To reset access, change the values in `.env`, delete `auth.json` in the data volume to re-enroll 2FA, and restart the container.

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

Today this uses a Google service account:

1. In Google Cloud, create a project and a service account, then create a JSON key for it.
2. Enable the "Google Analytics Data API" and the "Google Search Console API" in that project.
3. In GA4, go to Admin, Property Access Management, and add the service account email as a Viewer.
4. In Search Console, add the same service account email as a user of the property.
5. In Insight, click "Connect GA4", paste the JSON once, and enter your GA4 property ID.

A one-click Google connection (OAuth) is described in section 11.

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

Because the visitor id is stable (stored first-party in the browser), a visitor keeps the same identity across pages and days, so source, signup and payment line up on the same person.

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

## Auto-deploy (optional)

The repo ships a GitHub Actions workflow that builds the image, pushes it to the registry, and deploys over SSH on every push to `main`. Set these repository secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `MAPBOX_TOKEN`. Add the server's public key as a read-only deploy key so the box can pull the repo.

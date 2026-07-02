# Deployment on the VPS (which already hosts other production sites)

> Absolute rule: do not touch anything that already exists. Insight lives in `/opt/insight`,
> listens only on `127.0.0.1:8787`, and the reverse proxy already in place serves the subdomain.

## Step 0: read-only inspection (before anything else)

Once SSH access is ready, first identify what is running, without changing anything:

```bash
# which web server / panel serves the existing sites?
sudo ss -tlnp | grep -E ':80|:443'
systemctl list-units --type=service --state=running | grep -Ei 'nginx|apache|caddy|plesk|litespeed|cloudpanel'
docker ps 2>/dev/null        # if the existing sites already run in Docker
```

Depending on the result, wire the subdomain into the existing server.

## Step 1: start Insight (isolated)

```bash
cd /opt/insight
cp .env.example .env    # fill in the secrets
docker compose up -d
curl -s http://127.0.0.1:8787/api/health   # must respond ok
```

## Step 2: point the subdomain at the existing proxy

### With Nginx
```nginx
server {
    server_name analytics.example.com;
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
        proxy_set_header CF-IPCountry $http_cf_ipcountry;
    }
    listen 443 ssl;
    # certificate managed by the existing panel / certbot
}
```

### With Apache
```apache
<VirtualHost *:443>
    ServerName analytics.example.com
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:8787/
    ProxyPassReverse / http://127.0.0.1:8787/
    RequestHeader set X-Forwarded-Proto "https"
</VirtualHost>
```

### With a panel (Plesk / CloudPanel / etc.)
Add a domain, enable the panel's Let's Encrypt SSL, and set a reverse proxy to
`http://127.0.0.1:8787` in the vhost settings.

## HTTPS and visitor country

Two cases, depending on how the subdomain is routed in Cloudflare:

- **Cloudflare proxy on (orange cloud)**: Cloudflare handles HTTPS at the edge and, most
  importantly, adds the `CF-IPCountry` header (visitor country) and `CF-Connecting-IP`
  (real IP) for free. In this case set `GEO_MODE=cloudflare`, no MaxMind needed for country.
- **DNS only (grey cloud)**: the VPS server handles HTTPS (certbot/panel). Country then
  comes from MaxMind GeoLite2 (`GEO_MODE=maxmind`), or stays empty if not configured.

City-level accuracy only comes with MaxMind GeoLite2 (free). Country alone is usually
enough, so you can start without MaxMind.

## Auto-deploy

GitHub Actions (`.github/workflows/deploy.yml`) connects over SSH and, on every push to
`main`, pulls the new image and runs `docker compose up`. It only touches the Insight
containers, never anything else on the box.

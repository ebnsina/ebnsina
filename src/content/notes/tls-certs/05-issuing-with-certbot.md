---
title: "Issuing Your First Cert with certbot"
subtitle: "From bare DNS A record to working HTTPS in ten minutes. Concrete commands, every flag explained, every common failure addressed."
chapter: 5
level: "beginner"
readingTime: "11 min"
topics: ["certbot", "letsencrypt", "nginx", "http-01", "tls"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Applying for a driver's license — you prove identity once, get a credential, and renew before it expires.

</Callout>

## Prereqs

Before running certbot, three things must be true:

1. **You own a domain** — purchased from any registrar. `.com`, `.dev`, `.io`, anything. ~$10/year.
2. **DNS A record points at your VPS's public IPv4.** (And AAAA for IPv6 if you want.)
3. **Ports 80 and 443 are reachable from the public internet.** Both your VPS firewall and any cloud firewall must allow them.

Verify each:

```bash
# Domain DNS resolves to your IP
dig +short example.com
# 49.13.123.45

# Port 80 reachable
curl -I http://example.com/
# HTTP/1.1 200 OK (or whatever nginx serves)

# Port 443 should fail (nothing there yet)
curl -I https://example.com/
# Connection refused — fine for now
```

If `dig` returns nothing, your DNS is not set up. If `curl http://` times out, your firewall is blocking port 80 (revisit chapter 7 of Linux & VPS).

<Callout type="info">

**DNS propagation.** New A records can take up to an hour to propagate, though typical times are 1–5 minutes. If `dig +short` returns nothing right after creating the record, wait. Trying certbot too early will fail with `DNS problem: NXDOMAIN`.

</Callout>

## Install certbot

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```

The `python3-certbot-nginx` plugin auto-edits nginx configs to add the TLS settings. You can also run certbot in "certonly" mode (chapter 7) and edit nginx by hand, which is what serious sysadmins prefer for predictability.

## A clean nginx server block to start from

Create or edit `/etc/nginx/sites-available/example.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    root /var/www/example.com;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

Enable it:

```bash
sudo mkdir -p /var/www/example.com
echo '<h1>hello</h1>' | sudo tee /var/www/example.com/index.html

sudo ln -s /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Confirm it works:

```bash
curl -I http://example.com/
# HTTP/1.1 200 OK
```

Now you have an HTTP-only site, ready for certbot.

## Run certbot

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

Walk through the prompts:

1. **Email address.** Used for renewal failure notifications and security advisories. Worth setting to a real inbox.

2. **Terms of Service.** Type `Y`. (You read them. Of course.)

3. **EFF newsletter.** Up to you.

4. **Choose redirect.**
   - `1: No redirect` — leave HTTP working.
   - `2: Redirect` — HTTP→HTTPS 301. Pick this for almost everything.

certbot does the work. Output looks like:

```text
Account registered.
Requesting a certificate for example.com and www.example.com

Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/example.com/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/example.com/privkey.pem
This certificate expires on 2026-07-30.

Deploying certificate
Successfully deployed certificate for example.com to /etc/nginx/sites-enabled/example.com
Successfully deployed certificate for www.example.com to /etc/nginx/sites-enabled/example.com
Congratulations! You have successfully enabled HTTPS on https://example.com and https://www.example.com
```

Verify:

```bash
curl -I https://example.com/
# HTTP/2 200
# server: nginx/1.24.0
```

It works. Browsers will trust it without warnings.

## What certbot actually changed

Inspect the modified nginx config:

```bash
sudo cat /etc/nginx/sites-enabled/example.com
```

certbot added these lines:

```nginx
server {
    server_name example.com www.example.com;

    root /var/www/example.com;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = www.example.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    if ($host = example.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 404; # managed by Certbot
}
```

The first server block now serves HTTPS using the Let's Encrypt cert. The second server block listens on port 80 and 301-redirects every request to HTTPS.

The `include /etc/letsencrypt/options-ssl-nginx.conf` pulls in safe defaults (TLS 1.2/1.3, modern ciphers, OCSP stapling). You can override or replace these in chapter 7.

## Inspect the certificate

```bash
$ sudo openssl x509 -in /etc/letsencrypt/live/example.com/cert.pem -text -noout | head -20
Certificate:
    Data:
        Version: 3 (0x2)
        Serial Number: 03:e1:0a:...
        Signature Algorithm: ecdsa-with-SHA384
        Issuer: C = US, O = Let's Encrypt, CN = R3
        Validity
            Not Before: Apr  1 12:00:00 2026 GMT
            Not After : Jun 30 12:00:00 2026 GMT
        Subject: CN = example.com
        Subject Public Key Info:
            Public Key Algorithm: id-ecPublicKey
                Public-Key: (256 bit)
                ...
        X509v3 Subject Alternative Name:
            DNS:example.com, DNS:www.example.com
```

Two domains in SAN, ECDSA P-256 key, valid for 90 days. Exactly what we asked for.

## Test the renewal — without actually renewing

```bash
sudo certbot renew --dry-run
```

Output:

```text
Processing /etc/letsencrypt/renewal/example.com.conf
Account registered.
Simulating renewal of an existing certificate for example.com and www.example.com

Successfully renewed certificate for example.com
Congratulations, all simulated renewals succeeded:
  /etc/letsencrypt/live/example.com/fullchain.pem (success)
```

`--dry-run` uses the staging server, so it does not consume rate limits or replace your cert. If this command succeeds, real renewals will too.

## The renewal timer

Already installed by the certbot package:

```bash
$ systemctl list-timers certbot
NEXT                         LEFT          LAST                         PASSED   UNIT
Mon 2026-05-04 12:42:11 UTC  10h left      Sun 2026-05-03 22:42:11 UTC  1h ago   certbot.timer
```

Twice a day, the timer runs `certbot renew`. Renewal happens 30 days before expiration. The hook reloads nginx automatically.

You can inspect the timer:

```bash
sudo systemctl cat certbot.timer
```

```ini
[Timer]
OnCalendar=*-*-* 00,12:00:00
RandomizedDelaySec=43200
Persistent=true
```

Twice daily, with up to 12 hours of jitter, persistent across reboots. Rock solid.

## Common failures and fixes

**`Detail: Fetching http://example.com/.well-known/acme-challenge/abc... Connection refused`**

Your VPS is not reachable on port 80 from outside. Check:

```bash
sudo nft list ruleset | grep 'tcp dport 80'
sudo ss -tlnp | grep ':80'
```

Open the port (chapter 7 of Linux & VPS), make sure nginx is listening on it.

**`Detail: ... 404 Not Found`**

certbot placed the challenge file but nginx is not serving it. Usually because of a wrong document root or a `location /` that catches everything before the well-known prefix is matched.

Add this snippet *above* any other `location /` block:

```nginx
location /.well-known/acme-challenge/ {
    root /var/www/letsencrypt;
    default_type "text/plain";
}
```

Make sure `/var/www/letsencrypt` exists and is readable by nginx.

**`DNS problem: NXDOMAIN looking up A for example.com`**

Your A record is missing or unpropagated. Check:

```bash
dig +short example.com @1.1.1.1
dig +short example.com @8.8.8.8
```

If both return nothing, the record isn't published. If one returns the IP and another doesn't, propagation is in flight — wait.

**`Too many failed authorizations recently`**

You hit the 5-failures-per-hour rate limit. Switch to staging, fix your config, then come back:

```bash
sudo certbot certonly --staging --nginx -d example.com
```

After everything works in staging, run the production command. The staging cert will be replaced cleanly.

**`There were too many requests of a given type`**

You hit a duplicate cert or new-order rate limit. Wait a few hours and retry, or reduce the number of names you are requesting at once.

## Adding more domains to an existing cert

To extend your cert with a new subdomain (`api.example.com`):

```bash
sudo certbot --nginx -d example.com -d www.example.com -d api.example.com
```

The same command, with the new name added. certbot replaces the existing cert. The new cert covers all three names.

To remove names later, edit `/etc/letsencrypt/renewal/example.com.conf` (the renewal-time domain list) — but more reliably, delete and reissue:

```bash
sudo certbot delete --cert-name example.com
sudo certbot --nginx -d example.com -d www.example.com
```

## Storing certs separately per domain

By default, certbot creates one cert with multiple SAN entries. If you prefer one cert per domain (different lifecycles, different servers), use:

```bash
sudo certbot --nginx -d example.com         # cert "example.com"
sudo certbot --nginx -d api.example.com     # separate cert "api.example.com"
```

Each cert lives in its own directory under `/etc/letsencrypt/live/`. Both renew on the same timer.

## Removing certbot's nginx-managed config

If you decide later you want to manage nginx by hand:

```bash
sudo certbot certonly --nginx -d example.com
```

`certonly` issues the cert but does **not** modify nginx. You then edit nginx yourself, pointing at `/etc/letsencrypt/live/example.com/{fullchain,privkey}.pem` (chapter 7 covers the recommended config).

For mixed setups (some sites managed by certbot, others by hand), this is fine.

## Sanity check from outside

Run an SSL Labs scan:

```text
https://www.ssllabs.com/ssltest/analyze.html?d=example.com
```

A fresh certbot install should score A or A+. If you see lower, the next chapters cover the dials to tune.

## Recap

- Install: `apt install certbot python3-certbot-nginx`. Run: `sudo certbot --nginx -d <domain>`.
- Prereqs: domain pointing at the VPS, ports 80/443 open, basic nginx server block in place.
- certbot writes `fullchain.pem` and `privkey.pem` to `/etc/letsencrypt/live/<domain>/` and edits nginx automatically.
- A systemd timer renews twice daily, 30 days before expiration, with a reload hook.
- `certbot renew --dry-run` is the safe way to test renewal without burning rate limits.
- Failures usually trace back to: port 80 unreachable, location matching, or DNS propagation.
- For more control, use `certonly` and edit nginx by hand.

Next chapter: when HTTP-01 is not enough — wildcards and DNS-01 challenges.


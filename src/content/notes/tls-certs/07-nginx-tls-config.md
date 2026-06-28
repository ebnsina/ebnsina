---
title: 'Configuring nginx for TLS'
subtitle: 'A complete TLS server block — protocols, ciphers, OCSP stapling, HSTS, modern key types, perfect forward secrecy. The config that scores A+ without copy-paste cargo.'
chapter: 7
level: 'intermediate'
readingTime: '13 min'
topics: ['nginx', 'tls', 'ssl', 'hsts', 'ocsp']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Installing a lock — the certificate is the key, the nginx config is how you wire the lock to the door.

</Callout>

## What "good TLS config" means

After 30 years of TLS evolution, "good" has settled into a small set of choices:

- **TLS 1.2 and 1.3 only.** Everything older has known attacks.
- **Modern AEAD ciphers.** AES-GCM and ChaCha20-Poly1305. No CBC, no RC4, no DES.
- **Forward secrecy.** ECDHE for key exchange. No static RSA.
- **OCSP stapling.** Saves the client a round-trip to the CA.
- **HSTS.** Tells browsers "always use HTTPS."
- **HTTP/2.** Often HTTP/3 too.
- **Strong key types.** ECDSA P-256 or RSA 2048+ — modern certbot defaults are fine.

Mozilla maintains a [SSL Configuration Generator](https://ssl-config.mozilla.org/) that produces config for nginx, Apache, HAProxy, and others, at three levels: modern (TLS 1.3 only, breaks anything before iOS 13/Chrome 70), intermediate (TLS 1.2+1.3, what most should use), and old (back to Windows XP — avoid).

This chapter is the config that lands at A+ on SSL Labs without copying random gists.

## The complete server block

```nginx
# /etc/nginx/sites-available/example.com
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;

    server_name example.com www.example.com;
    root /var/www/example.com;

    # Cert
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;

    # Protocol versions
    ssl_protocols TLSv1.2 TLSv1.3;

    # Cipher suites — Mozilla intermediate
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';

    # TLS 1.3 cipher selection is fixed; no need to configure
    ssl_prefer_server_ciphers off;

    # Session cache
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # OCSP stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 1.1.1.1 8.8.8.8 valid=300s;
    resolver_timeout 5s;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

    # Other security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        try_files $uri $uri/ =404;
    }
}

# Redirect HTTP -> HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

This is the template. Every line is doing real work. Below we walk through each block.

## Listen and HTTP/2

```nginx
listen 443 ssl;
listen [::]:443 ssl;
http2 on;
```

- `listen 443 ssl` — TCP port 443 over IPv4, with TLS.
- `listen [::]:443 ssl` — same on IPv6.
- `http2 on` — modern syntax for enabling HTTP/2. Older configs say `listen 443 ssl http2;` — same thing.

For HTTP/3 (QUIC) — still emerging, optional:

```nginx
listen 443 quic reuseport;
listen [::]:443 quic reuseport;

add_header Alt-Svc 'h3=":443"; ma=86400';
```

The `Alt-Svc` header tells the browser "you can also reach me on HTTP/3 at port 443" — subsequent requests upgrade. Requires nginx 1.25+ with QUIC support compiled in.

## Cert files

```nginx
ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;
```

- **`fullchain.pem`** — leaf + intermediates. **Always this file**, never `cert.pem` alone, or some clients see "untrusted cert" errors.
- **`privkey.pem`** — the private key. Keep `chmod 600` and root-owned (chapter 3).
- **`chain.pem`** — intermediates only, used by `ssl_stapling_verify`.

## Protocols and ciphers

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:...';
ssl_prefer_server_ciphers off;
```

- **`ssl_protocols TLSv1.2 TLSv1.3`** — only modern TLS. TLS 1.0 and 1.1 are deprecated and disabled in every modern browser.
- **`ssl_ciphers`** — only matters for TLS 1.2. TLS 1.3 has a fixed, small set of ciphers chosen by the spec; no per-server config.
- **`ssl_prefer_server_ciphers off`** — let the client pick. With modern clients all options are equally safe; the client knows which cipher its hardware accelerates best.

The cipher list above is Mozilla's "intermediate" recommendation. Every cipher:

- Starts with `ECDHE` or `DHE` — ephemeral key exchange, gives forward secrecy.
- Uses AES-GCM or ChaCha20-Poly1305 — authenticated encryption (AEAD).

If you serve only modern browsers (anything from the last 5 years), you can drop the `DHE` lines for ECDHE-only. If you need to support IE 11 or very old Android, you would drop down to Mozilla's "old" profile — don't, unless you have a specific compatibility requirement.

## Session cache

```nginx
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;
```

A returning client can resume a previous TLS session, skipping the full handshake. nginx caches session keys in shared memory.

- `shared:SSL:10m` — name `SSL`, 10MB shared memory. ~40,000 sessions.
- `ssl_session_timeout 1d` — sessions valid for 24 hours.
- `ssl_session_tickets off` — disable an alternative session-resumption mechanism that has historical security issues if not rotated frequently. Disabling and using only the cache is safer.

## OCSP stapling

```nginx
ssl_stapling on;
ssl_stapling_verify on;
resolver 1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout 5s;
```

OCSP (Online Certificate Status Protocol) lets a browser ask the CA "is this cert revoked?" Without stapling, the browser makes that request every time it sees the cert — slow, leaky (the CA learns who is visiting your site), and a single point of failure.

With **stapling**, _your nginx_ makes the OCSP request periodically, caches the response, and includes it in the TLS handshake. The browser sees a fresh CA-signed "still valid" response without doing a separate request.

- `ssl_stapling on` — fetch and cache OCSP responses.
- `ssl_stapling_verify on` — verify the OCSP response with `ssl_trusted_certificate` before serving it.
- `resolver` — DNS server nginx uses to look up the OCSP responder URL. Public DNS (1.1.1.1, 8.8.8.8) is fine.

Verify stapling works:

```bash
echo | openssl s_client -connect example.com:443 -status 2>/dev/null \
  | grep -A 2 "OCSP response"
```

If you see `OCSP Response Status: successful (0x0)`, stapling is working.

## HSTS

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
```

HTTP Strict Transport Security: the browser remembers "this domain must use HTTPS" for `max-age` seconds. Even if the user types `http://example.com` after that, the browser silently upgrades to HTTPS without ever sending an unencrypted request.

- `max-age=63072000` — 2 years. Standard recommendation.
- `includeSubDomains` — apply to every subdomain too. Be sure all your subdomains are HTTPS-only before adding this.
- `preload` — ask Chrome/Firefox to ship your domain in the browser's preload list. Means the very first request from a fresh install upgrades to HTTPS. Apply at [hstspreload.org](https://hstspreload.org/) — but **only** when you are absolutely committed; removal is slow.

<Callout type="warn">

**HSTS is sticky.**

Once a browser has seen a long `max-age`, it remembers — even if you remove the header. To go back to HTTP for that domain, every visiting browser would need to revisit and see `max-age=0` (or wait out the original max-age). Plan accordingly. For staging or testing domains, use a very short max-age until you are confident.

</Callout>

## Why no Diffie-Hellman parameters

Older nginx configs include:

```nginx
ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
```

This was needed for `DHE_*` cipher suites. With modern Mozilla intermediate config, the DHE ciphers are at the bottom of the list and rarely chosen. With Mozilla "modern" config (TLS 1.3 only), there is no DHE at all.

If you keep DHE in the cipher list, generating proper DH params is a one-time:

```bash
sudo openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
```

certbot installs a default. If you are not concerned about IE 11, you can drop DHE entirely.

## Sharing TLS config across many sites

Repeating that whole TLS block in every site is tedious. Pull it into a snippet:

```bash
sudo nano /etc/nginx/snippets/ssl-modern.conf
```

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
ssl_prefer_server_ciphers off;

ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;

ssl_stapling on;
ssl_stapling_verify on;
resolver 1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout 5s;

add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

Then in each site:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;
    include snippets/ssl-modern.conf;

    # ... rest of the server block
}
```

One file, one place to update when standards evolve.

## Adding HTTPS in front of an existing app

If you already have a backend on `127.0.0.1:8080` and want nginx in front with TLS:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;
    include snippets/ssl-modern.conf;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

This is the canonical "TLS termination at the edge, plain HTTP to the backend" setup. Your app runs unchanged; nginx handles all the TLS.

## Verify with tools

**SSL Labs:** https://www.ssllabs.com/ssltest/analyze.html?d=example.com

A score of A or A+ is the goal. The detailed report tells you exactly which ciphers and protocols are accepted and any weaknesses.

**testssl.sh** — local tool, no external scan:

```bash
docker run --rm -ti drwetter/testssl.sh https://example.com
```

Comprehensive output, saves a JSON or HTML report.

**curl** for sanity checks:

```bash
curl -I https://example.com/
# Look for:
#   HTTP/2 200
#   Strict-Transport-Security: max-age=...
#   server: nginx
```

If `curl --tlsv1.0` connects, you have TLS 1.0 enabled — fix it. Production should refuse:

```bash
curl --tlsv1.0 --tls-max 1.0 https://example.com
# curl: (35) error:0A0000BF:SSL routines::no protocols available
```

## Recap

- Mozilla "intermediate" config + TLS 1.2/1.3 + modern ciphers + ECDHE = A+ on SSL Labs.
- Always use `fullchain.pem` for `ssl_certificate`. Keep `privkey.pem` at mode 600.
- OCSP stapling saves a round-trip and protects user privacy. Enable it.
- HSTS tells browsers "always HTTPS." Two years is the standard. Be careful with `preload`.
- Pull TLS config into a `snippets/` file and include it from each site.
- Verify with SSL Labs and `testssl.sh`. Confirm TLS 1.0/1.1 are rejected.

Next and final chapter: keeping certs alive — renewal monitoring, hooks, rotation, and what to do when something fails.

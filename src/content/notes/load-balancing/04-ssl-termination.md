---
title: 'SSL Termination'
subtitle: 'TLS at the load balancer, certificate management, HTTPS between LB and backends, and the trade-offs of offloading vs end-to-end encryption.'
chapter: 4
level: 'intermediate'
readingTime: '9 min'
topics: ['SSL', 'TLS', 'HTTPS', 'certificates', 'nginx', 'HAProxy', 'termination']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A secure mail room in an office building: incoming encrypted mail is decrypted at the front desk (the load balancer), then delivered in plaintext to the right department (backend server) via internal hallways. The external threat is handled at the edge; internally, you trust your own network. Whether to re-encrypt the internal hallways is a policy decision based on your threat model.

</Callout>

## Why Terminate at the LB

TLS is computationally expensive — handshake, cipher negotiation, record processing. Terminating at the load balancer has several advantages:

1. **Single cert location** — one place to renew, one place for OCSP stapling
2. **Backends stay simple** — no TLS code or certs on every server
3. **LB can inspect requests** — can't do path routing without seeing plaintext HTTP
4. **Offload CPU** — dedicated hardware or optimized LB instances handle TLS

The trade-off: traffic between LB and backends is unencrypted (or requires separate internal TLS). For regulated industries (PCI-DSS, HIPAA), end-to-end encryption may be required.

## nginx SSL Termination

```nginx
server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate     /etc/ssl/api.example.com.crt;
    ssl_certificate_key /etc/ssl/api.example.com.key;

    # Modern TLS settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Session resumption (avoids full handshake for returning clients)
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    # OCSP Stapling — include cert status in TLS handshake (no client roundtrip)
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/ssl/chain.pem;
    resolver 8.8.8.8 8.8.4.4 valid=300s;

    # HSTS — tell browsers to always use HTTPS
    add_header Strict-Transport-Security "max-age=63072000" always;

    location / {
        proxy_pass http://notes;   # plain HTTP to backends
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}
```

## HAProxy SSL Termination

```
frontend https_in
    bind *:443 ssl crt /etc/ssl/api.example.com.pem
    mode http
    option forwardfor
    http-request set-header X-Forwarded-Proto https

    # Modern TLS
    bind *:443 ssl crt /etc/ssl/api.example.com.pem \
        alpn h2,http/1.1 \
        no-sslv3 no-tlsv10 no-tlsv11 \
        ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256

    default_backend api_servers

frontend http_in
    bind *:80
    mode http
    redirect scheme https code 301

backend api_servers
    mode http
    server s1 10.0.0.10:3000 check
    server s2 10.0.0.11:3000 check
```

HAProxy expects the cert and key concatenated into a single `.pem` file:

```bash
cat api.example.com.crt api.example.com.key > /etc/ssl/api.example.com.pem
```

## Certificate Automation with Let's Encrypt

Manual cert renewal is a maintenance burden. Use `certbot` to automate:

```bash
# Install certbot
apt install certbot python3-certbot-nginx

# Issue and install certificate
certbot --nginx -d api.example.com

# Test auto-renewal
certbot renew --dry-run

# Certbot installs a cron job:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

For HAProxy, post-renewal hook to concatenate and reload:

```bash
# /etc/letsencrypt/renewal-hooks/post/haproxy.sh
#!/bin/bash
DOMAIN="api.example.com"
cat /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    > /etc/haproxy/ssl/$DOMAIN.pem
systemctl reload haproxy
```

## Multiple Domains (SNI)

Server Name Indication (SNI) lets one IP handle multiple domains — the client sends the hostname in the TLS handshake, and the LB picks the right cert.

**nginx — multiple certs:**

```nginx
server {
    listen 443 ssl;
    server_name api.example.com;
    ssl_certificate /etc/ssl/api.example.com.crt;
    ssl_certificate_key /etc/ssl/api.example.com.key;
    # ...
}

server {
    listen 443 ssl;
    server_name app.example.com;
    ssl_certificate /etc/ssl/app.example.com.crt;
    ssl_certificate_key /etc/ssl/app.example.com.key;
    # ...
}
```

**HAProxy — wildcard cert directory:**

```
bind *:443 ssl crt /etc/haproxy/ssl/
```

HAProxy scans the directory for `.pem` files and serves the right one based on SNI. Add a cert by dropping a file in the directory and reloading.

## Re-encrypting Backend Traffic

If you need end-to-end TLS (LB → backend is also encrypted):

**nginx:**

```nginx
location / {
    proxy_pass https://notes;   # HTTPS to backend
    proxy_ssl_certificate     /etc/ssl/client.crt;
    proxy_ssl_certificate_key /etc/ssl/client.key;
    proxy_ssl_verify          on;
    proxy_ssl_trusted_certificate /etc/ssl/notes-ca.crt;
}
```

**HAProxy:**

```
backend api_servers
    mode http
    server s1 10.0.0.10:3443 check ssl verify required ca-file /etc/ssl/ca.crt
```

For mutual TLS (mTLS) — backend verifies the LB's client cert:

```
backend api_servers
    server s1 10.0.0.10:3443 check ssl \
        verify required ca-file /etc/ssl/ca.crt \
        crt /etc/haproxy/client.pem
```

## TLS 1.3 Performance

TLS 1.3 reduces handshake to 1 round-trip (vs 2 for 1.2) and supports 0-RTT resumption for returning clients:

```nginx
ssl_protocols TLSv1.3;    # TLS 1.3 only
```

0-RTT in nginx (experimental — has replay attack risk for non-idempotent requests):

```nginx
ssl_early_data on;
proxy_set_header Early-Data $ssl_early_data;
```

In production: support both 1.2 and 1.3. Browsers negotiate the highest supported version. Disable 1.0 and 1.1:

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
```

## Forwarding the Real Protocol

Backend applications need to know the original protocol was HTTPS (for redirects, cookies, HSTS):

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

Application reads it:

```typescript
// Express
app.set('trust proxy', 1); // trust X-Forwarded-* headers from first proxy

app.get('/redirect', (req, res) => {
	// req.protocol is 'https' even though connection to Express is plain HTTP
	res.redirect(`${req.protocol}://${req.hostname}/dashboard`);
});
```

Without this, your app generates `http://` redirect URLs to HTTPS clients, causing redirect loops.

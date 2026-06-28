---
title: "Let's Encrypt & ACME"
subtitle: 'The protocol that lets a free CA issue 350 million certificates a year. Account, order, challenge, finalize, download — what every certbot run does behind the scenes.'
chapter: 4
level: 'beginner'
readingTime: '11 min'
topics: ['letsencrypt', 'acme', 'certificates', 'automation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

An automated notary service that proves you own the property before stamping the deed.

</Callout>

## What Let's Encrypt is

Let's Encrypt is a Certificate Authority — the entity that signs your certificate, the same job that DigiCert, GlobalSign, and Sectigo do. It launched in 2016 with three changes that reshaped the web:

1. **Free.** No charge per cert, no upsell, no quotas.
2. **Automated.** Cert issuance is a one-command operation, not a paperwork process.
3. **Short-lived.** 90-day certificates, designed to be auto-renewed.

The combination is what got HTTPS adoption from ~30% to ~95% of web traffic in five years. Before Let's Encrypt, every TLS-protected site cost money and took human work. After, it cost nothing and took 30 seconds.

The protocol that makes the automation work is **ACME** (Automatic Certificate Management Environment). It is a published standard (RFC 8555), which means anyone can implement a Let's Encrypt-compatible CA — and several have. Some commercial CAs and DNS providers now expose ACME APIs.

## What you actually run

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com
```

That is the entire issuance flow. certbot does:

1. Creates an account with Let's Encrypt (if first run).
2. Creates a CSR for `example.com` and `www.example.com`.
3. Asks Let's Encrypt to issue the cert.
4. Solves the validation challenge (proves you control the domain).
5. Downloads the signed cert to `/etc/letsencrypt/live/example.com/`.
6. Configures nginx to use the new cert.
7. Sets up a systemd timer that renews the cert before expiration.

Chapter 5 walks through this command in detail. This chapter explains _what is happening underneath_ so when something fails, you know what to look at.

## The ACME protocol — five steps

Issuance is five HTTP exchanges with the ACME server.

### 1. Account creation

The first time, certbot generates an account key pair (RSA or ECDSA) locally. It POSTs the public key to the ACME server (`/acme/new-account`), which records it. From now on, the account key signs every subsequent request — the ACME server identifies you by that signature.

```text
POST https://acme-v02.api.letsencrypt.org/acme/new-account
{
  "termsOfServiceAgreed": true,
  "contact": ["mailto:admin@example.com"]
}

Response 201
{ "id": 12345, "status": "valid" }
```

Your account key never leaves your machine. The CA only sees the public key.

### 2. Order

Now ask the CA to issue a cert. POST a list of identifiers (domain names) to `/acme/new-order`:

```text
POST /acme/new-order
{
  "identifiers": [
    {"type": "dns", "value": "example.com"},
    {"type": "dns", "value": "www.example.com"}
  ]
}

Response 201
{
  "status": "pending",
  "expires": "2026-04-01T20:00:00Z",
  "identifiers": [...],
  "authorizations": [
    "https://.../authz-v3/123",
    "https://.../authz-v3/124"
  ],
  "finalize": "https://.../finalize/12345/678"
}
```

The CA returns one authorization URL per domain. Each authorization will need to be solved with a challenge before the cert can be issued.

### 3. Challenge — proving you control the domain

For each authorization, the CA offers a list of challenges:

```text
GET https://.../authz-v3/123

{
  "identifier": {"type": "dns", "value": "example.com"},
  "status": "pending",
  "challenges": [
    {
      "type": "http-01",
      "url": "https://.../chall/abc",
      "token": "uH4w...",
      "status": "pending"
    },
    {
      "type": "dns-01",
      "url": "https://.../chall/def",
      "token": "uH4w...",
      "status": "pending"
    },
    {
      "type": "tls-alpn-01",
      "url": "https://.../chall/ghi",
      "token": "uH4w...",
      "status": "pending"
    }
  ]
}
```

Three challenge types — pick one and respond.

**HTTP-01** — easiest. Place a file with specific content at `http://example.com/.well-known/acme-challenge/<token>`. The CA fetches it; if the content matches, you proved control of the domain. Requires port 80 open and reachable from the public internet.

**DNS-01** — required for wildcard certificates. Add a TXT record `_acme-challenge.example.com` with a specific value. The CA looks up the TXT record. Works without any web server, requires DNS automation.

**TLS-ALPN-01** — present the token via TLS on port 443 with a special ALPN protocol. Used by some load balancers that need to validate without exposing port 80 or HTTP. Less common; certbot supports it but most users do not need it.

Once you have placed the challenge response, POST to the challenge URL to tell the CA "I am ready":

```text
POST https://.../chall/abc
{}
```

The CA validates (fetches the file, checks the TXT record, etc.). If valid, the authorization moves to `valid` status.

### 4. Finalize

When all authorizations are valid, POST your CSR to the order's `finalize` URL:

```text
POST https://.../finalize/12345/678
{
  "csr": "<base64url-encoded CSR>"
}
```

If the CSR is well-formed and matches the authorized identifiers, the CA queues the cert for issuance. Polling the order URL eventually shows status `valid` and a `certificate` URL.

### 5. Download

```text
GET https://.../cert/abc...
```

Returns the issued certificate, in PEM format, with the full chain. certbot writes it to `/etc/letsencrypt/live/example.com/`.

The whole flow takes 5–30 seconds.

## The HTTP-01 challenge in practice

Walking through HTTP-01 because it is what 90% of users hit:

1. certbot generates a random token (provided by the CA in the challenge object).
2. certbot computes a _key authorization_ — the SHA256 hash of `<token>.<account-key-thumbprint>`. This is what the CA expects to find at the well-known URL.
3. certbot writes the key authorization to a file at `/var/www/letsencrypt/.well-known/acme-challenge/<token>`.
4. nginx must be configured to serve `/.well-known/acme-challenge/` from that directory:

   ```nginx
   server {
       listen 80;
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

5. certbot tells the CA it is ready.
6. The CA's validation server makes a GET request to `http://example.com/.well-known/acme-challenge/<token>`. (Note: HTTP, port 80. Even on a TLS-only site, you must allow port 80 open for ACME validation, or use DNS-01.)
7. If the response body matches the expected key authorization, the challenge is valid.
8. The CA issues the cert.

The whole point: only the legitimate owner of `example.com` could place a file at that URL on the actual web server pointed at by example.com's DNS. By verifying the response, the CA proves you control the domain.

<Callout type="warn">

**Ports 80 must be open and reachable** for HTTP-01 to work. If you have firewalled port 80 entirely, switch to DNS-01 (next chapter), or open port 80 long enough for the renewal.

</Callout>

## DNS-01 challenge

For wildcard certs (`*.example.com`) or environments where port 80 is not reachable, DNS-01 is the alternative.

1. The CA gives you a token.
2. You add a TXT record at `_acme-challenge.example.com` containing the key authorization (same hash as HTTP-01).
3. The CA queries the TXT record over public DNS.
4. If it matches, the challenge is valid.

The catch: DNS-01 requires automation against your DNS provider's API. certbot has plugins for Route53, Cloudflare, DigitalOcean, Linode, and others. For obscure providers you write a "manual" hook script that adds and removes the TXT record.

```bash
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d "*.example.com" \
  -d example.com
```

The credentials file holds a Cloudflare API token with the minimum permissions needed (Zone:Edit on the specific zone).

## Rate limits — important to know

Let's Encrypt has rate limits to prevent abuse. The main ones:

- **50 certs per registered domain per week.**
- **5 duplicate certs per week** (same exact set of names).
- **5 failed validations per account, per hostname, per hour.**
- **300 new orders per account per 3 hours.**

The "5 failed validations per hour" is the one most people hit during configuration. If your nginx isn't actually serving the challenge correctly, you get five tries before being throttled for an hour.

There is a **staging environment** that mirrors production but issues fake (non-trusted) certs with much higher rate limits — use it while testing:

```bash
sudo certbot certonly --staging -d example.com
```

The certs from staging will not be trusted by browsers. Once your config works, switch to production:

```bash
sudo certbot certonly -d example.com
```

## Renewal — automated, by design

Certs are valid for 90 days. certbot installs a systemd timer that runs twice a day:

```bash
$ systemctl list-timers --all | grep certbot
NEXT                         LEFT       LAST                         PASSED       UNIT
Mon 2026-05-04 10:42:11 UTC  10h left   Sun 2026-05-03 22:42:11 UTC  1h ago       certbot.timer
```

The timer triggers `certbot renew`, which checks every cert in `/etc/letsencrypt/renewal/` and renews any that are within 30 days of expiration. If nothing is due, it exits silently. If a renewal succeeds, it triggers a hook (typically `systemctl reload nginx`) so the new cert takes effect.

You should never have to think about renewal. The first time you hit "my cert expired" is usually because of a misconfigured renewal hook or a recently-changed nginx that breaks the HTTP-01 challenge silently.

## What can go wrong

- **DNS not propagated.** You added an A record 30 seconds ago; the CA's resolver still has stale data. Wait 5–60 minutes, retry.
- **Port 80 blocked.** Cloud firewall, server firewall, or upstream NAT. Test with `curl -I http://example.com` from another machine.
- **`location /.well-known/acme-challenge/` not configured.** Hits your default catch-all (which probably 404s). Validation fails.
- **Multiple servers behind a load balancer, only one has the challenge file.** The CA's request hits a server without the file. Use DNS-01 or shared filesystem.
- **Wildcard cert with HTTP-01.** Not allowed. Wildcards require DNS-01.
- **Hit the rate limit.** Check `ratelimit` in the error message; switch to `--staging` for further testing.

certbot's error messages are usually clear. Read the full output, not just the summary line.

## Other ACME clients

certbot is the most popular but not the only ACME client:

- **acme.sh** — pure shell, zero dependencies. Tiny, embeddable in any environment.
- **lego** — Go, single binary. Used by Traefik internally.
- **Caddy's built-in ACME** — Caddy issues and renews its own certs without external tools.
- **Win-ACME (wacs)** — Windows.
- **acmez** (Go library), **acme-client** (OpenBSD), and many more.

Pick the one that fits your environment. For a Debian + nginx VPS, certbot is the default. For containerized environments, lego or acme.sh are easier to embed.

## Recap

- Let's Encrypt is a free, automated CA issuing 90-day DV certificates via the ACME protocol.
- ACME has five steps: account, order, challenge, finalize, download. All over HTTPS, all signed with your account key.
- HTTP-01 is the most common challenge — place a file at a well-known URL, CA fetches it. Requires port 80 reachable.
- DNS-01 is required for wildcards and works without HTTP — add a TXT record. Requires DNS automation.
- Rate limits are real; use `--staging` for testing, production for real certs.
- Renewal is automated via systemd timer. Designed to never need human intervention.
- certbot is the default tool. Other clients exist for niche environments.

Next chapter: walking through `certbot --nginx` step by step on a real VPS.

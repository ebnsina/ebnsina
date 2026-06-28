---
title: 'Renewal, Monitoring, and Rotation'
subtitle: 'Surviving past 90 days. Renewal hooks, expiration monitoring, key rotation, and the runbook for the night your cert quietly expired and now nobody can reach the site.'
chapter: 8
level: 'advanced'
readingTime: '11 min'
topics: ['renewal', 'monitoring', 'key rotation', 'letsencrypt', 'tls']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A passport expiry alert — the credential is still valid today, but you need to act before it isn't.

</Callout>

## The 90-day cliff

Let's Encrypt certificates expire after 90 days. This is deliberate — short lifetimes limit damage from undetected key compromise and force everyone to automate. But it also means that any setup that _worked once_ but no longer renews quietly walks toward a hard outage.

You have one job: make renewal work, prove it works, and notice if it breaks. This chapter covers all three.

## Confirm renewal is configured

After your first `certbot --nginx` run, a renewal config is at `/etc/letsencrypt/renewal/example.com.conf`:

```ini
# /etc/letsencrypt/renewal/example.com.conf
version = 2.6.0
archive_dir = /etc/letsencrypt/archive/example.com
cert = /etc/letsencrypt/live/example.com/cert.pem
privkey = /etc/letsencrypt/live/example.com/privkey.pem
chain = /etc/letsencrypt/live/example.com/chain.pem
fullchain = /etc/letsencrypt/live/example.com/fullchain.pem

[renewalparams]
account = abc...
authenticator = nginx
installer = nginx
server = https://acme-v02.api.letsencrypt.org/directory
key_type = ecdsa
```

This file tells certbot how to renew. The systemd timer reads every renewal config in this directory and processes each.

```bash
$ sudo systemctl list-timers certbot
NEXT                         LEFT     LAST                         PASSED   UNIT
Mon 2026-05-04 12:42:11 UTC  10h      Sun 2026-05-03 22:42:11 UTC  1h ago   certbot.timer
```

Twice a day. Renewals happen 30 days before expiration; if nothing is due, certbot exits silently.

Test:

```bash
sudo certbot renew --dry-run
```

If this passes for every cert listed, real renewals will too.

## Renewal hooks — reload the right service

When a cert renews, the new files appear, but services holding the _old_ cert in memory keep using it until reloaded. nginx, postgres, dovecot, every TLS-using daemon needs to be told.

certbot supports hooks:

- **pre-hook** — runs before renewal attempts. Useful to `nginx stop` if you are using standalone validation (rare with `--nginx`).
- **deploy-hook** — runs after a successful renewal, only for renewed certs.
- **post-hook** — runs after all renewals attempted, even if none renewed.

The default certbot install on Debian/Ubuntu sets up nginx reload automatically via a deploy hook in `/etc/letsencrypt/renewal-hooks/deploy/`. But for non-nginx services, you set them up:

```bash
# /etc/letsencrypt/renewal-hooks/deploy/postgres-reload.sh
#!/bin/bash
systemctl reload postgresql
```

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/postgres-reload.sh
```

Now after every renewal, postgres reloads its config and picks up the new cert.

For services that need an actual restart (rare), use `restart` instead of `reload`. nginx, postgres, and most daemons reload TLS config without dropping connections — prefer it.

## Per-cert renewal hooks

If you need different hooks per cert, edit the renewal config:

```ini
# /etc/letsencrypt/renewal/example.com.conf
[renewalparams]
...
renew_hook = systemctl reload nginx
```

The hook only runs after this specific cert's successful renewal.

## Monitoring expiration

Even with all the automation, things can break — a misconfigured nginx, a deleted A record, a DNS plugin's stale credentials, an upstream change in the ACME protocol. You need to _notice_ before the cert expires.

Three layers, in order of value:

### 1. certbot's own email notifications

Set during the first run; stored in the certbot account. Let's Encrypt sends an email when a cert is within 20 days of expiring without having been renewed. This is the safety net — but it relies on the email actually being read.

To verify or change:

```bash
sudo certbot register --update-registration --email new-email@example.com
```

### 2. Local check — a daily systemd timer

Drop a small script that checks every cert and alerts if any are too close to expiring.

```bash
sudo nano /usr/local/bin/check-tls-expiry.sh
```

```bash
#!/usr/bin/env bash
# Alert if any cert in /etc/letsencrypt/live/ is < 14 days from expiry.

set -euo pipefail
THRESHOLD_DAYS=14
NOW=$(date +%s)
WARN=0

for cert_dir in /etc/letsencrypt/live/*/; do
    [ -d "$cert_dir" ] || continue
    name=$(basename "$cert_dir")
    cert="${cert_dir}fullchain.pem"
    [ -f "$cert" ] || continue

    expiry=$(openssl x509 -in "$cert" -enddate -noout | cut -d= -f2)
    expiry_ts=$(date -d "$expiry" +%s)
    days=$(( (expiry_ts - NOW) / 86400 ))

    echo "$name: $days days until expiry"
    if [ "$days" -lt "$THRESHOLD_DAYS" ]; then
        echo "ALERT: $name expires in $days days" >&2
        WARN=1
    fi
done

exit $WARN
```

```bash
sudo chmod +x /usr/local/bin/check-tls-expiry.sh
```

Wrap it in a systemd timer:

```ini
# /etc/systemd/system/check-tls-expiry.service
[Unit]
Description=Check TLS cert expiry

[Service]
Type=oneshot
ExecStart=/usr/local/bin/check-tls-expiry.sh
StandardOutput=journal
StandardError=journal
```

```ini
# /etc/systemd/system/check-tls-expiry.timer
[Unit]
Description=Daily TLS expiry check

[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=15m

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now check-tls-expiry.timer
```

If the script exits non-zero, the systemd unit fails. Configure systemd to email you on failure (a subject for chapter 9 of SRE), or pair with a notification system.

### 3. External monitoring

The script above runs _on the server_. If the server is gone (network partition, power outage, deletion), the check is gone too. External monitoring catches those:

- **UptimeRobot, Pingdom, Better Uptime, Healthchecks.io** — most have a "TLS expiry" check that hits your domain and reads the cert from the outside. Free tiers cover small fleets.
- **Self-hosted: blackbox_exporter** + Prometheus — `probe_ssl_earliest_cert_expiry` metric. Alert when within N days.

External checks notice when:

- The cert stopped renewing on the box.
- The cert renewed but nginx never reloaded.
- The DNS A record was changed and nginx is serving a different (or no) cert.
- The box went away entirely.

For any production site, run at least one external check. Paid services start at $0–$10/month and have saved every operator at least once.

## Reading and inspecting certs from outside

A few one-liners worth memorizing:

```bash
# Days until expiry
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -enddate

# Full cert chain
openssl s_client -connect example.com:443 -servername example.com -showcerts < /dev/null \
  | grep -E '(BEGIN|END|Subject:|Issuer:)'

# Verify the chain validates correctly (a quick sanity check)
echo | openssl s_client -connect example.com:443 -servername example.com -verify_return_error
# Last line: "Verify return code: 0 (ok)" if all good
```

When you suspect a renewal landed badly, these tell you what nginx is actually serving — often different from what is in `/etc/letsencrypt/live/`.

## Forcing a renewal

Normally certbot only renews within 30 days of expiry. To force one (after fixing a config issue, before a major event, etc.):

```bash
sudo certbot renew --force-renewal --cert-name example.com
```

`--cert-name` limits to one cert; without it, **all** certs renew, which can hit rate limits.

For testing the whole flow without burning a real renewal, use staging:

```bash
sudo certbot --staging --force-renewal --cert-name example.com -d example.com
```

The staging cert is not trusted, but you can confirm the renewal mechanics work, then run a real renewal when you are confident.

## Key rotation

Standard certbot renewal **reuses** the existing private key. That is fine for most setups but means the same key has been on disk through every renewal — possibly for years.

To rotate the key on every renewal (safer, recommended):

```bash
sudo certbot renew --reuse-key=false
```

Or set it permanently in the renewal config:

```ini
[renewalparams]
reuse_key = False
```

Going forward, every renewal generates a fresh key. If a key was somehow exfiltrated, exposure is bounded by the renewal window (90 days at most, typically 60).

## Switching key types

Modern certbot defaults to ECDSA, which is what you want. If you have older RSA certs and want to migrate:

```bash
sudo certbot --nginx --key-type ecdsa --force-renewal -d example.com
```

ECDSA P-256 keys are ~10x faster to sign with than RSA 2048 — meaningful for high-traffic sites doing thousands of TLS handshakes per second. Smaller signatures save bandwidth too.

## What to do when a renewal fails

```bash
# 1. See what happened
sudo journalctl -u certbot.service -n 100
sudo tail -100 /var/log/letsencrypt/letsencrypt.log

# 2. Try a dry-run to reproduce
sudo certbot renew --dry-run

# 3. Fix the config (most failures are HTTP-01 location, DNS-01 token, port 80, etc.)
# 4. Force a renewal once fixed
sudo certbot renew --cert-name example.com --force-renewal
```

The certbot log is verbose but readable. Search for `Detail:` lines — those have the actual server-side rejection reason.

## What to do when a cert has expired

You have ~~24 hours~~ no time. Browsers reject expired certs immediately.

Order of operations:

1. **Confirm expiration** — `openssl s_client -connect example.com:443 &lt; /dev/null | openssl x509 -enddate -noout`.
2. **Fix the renewal config** — usually the root cause is a misconfigured location, deleted A record, or expired DNS API token.
3. **Force a renewal** — `sudo certbot renew --force-renewal --cert-name example.com`.
4. **Reload nginx** — `sudo systemctl reload nginx`.
5. **Verify externally** — from another machine, `curl -I https://example.com/`.

If you cannot solve it in minutes, fall back temporarily to a self-signed cert so the service is reachable (with a warning) while you debug. Better than 100% downtime.

## CT logs — verify your cert was issued correctly

Every Let's Encrypt cert is logged to public **Certificate Transparency** logs. Anyone can see it. You can monitor for unexpected certs issued for your domain (which would suggest a CA mistake or compromise).

Tools:

- **crt.sh** — web UI for searching CT logs. Search `example.com` to see every cert ever issued.
- **Cert Spotter** (sslmate) — sends an email when a new cert appears for your domain.

If you ever see a cert for your domain that you did not request, treat it as a serious incident — contact the issuing CA immediately.

## Cert pinning — generally avoid in modern setups

Older guidance: pin a specific cert in browsers (HPKP). Modern guidance: **do not**. HPKP was deprecated by browsers around 2018 because of the risk of pinning yourself into a corner — if you lose the pinned key, the site is unreachable for the pin's lifetime.

If you have a pinning use case (mobile app talking to your API), pin in the app — but pin the _public key_ (SPKI), not the cert itself, and pin a backup key as well.

## Recap

- Renewal happens via the certbot systemd timer, twice daily, 30 days before expiration.
- Add deploy hooks for non-nginx services (postgres, etc.) so they reload after renewal.
- Monitor expiration three ways: certbot email, local script, external checks. Run all three.
- `certbot renew --dry-run` is the safe rehearsal. `--force-renewal` for emergencies.
- Rotate keys (`reuse_key = False`) for better security hygiene.
- Use Certificate Transparency monitors to catch unexpected certs issued for your domain.

This is the end of the **TLS & Certificates** track. You can now issue, configure, deploy, monitor, and renew real TLS certificates without touching a managed service. Every domain you ever own will have HTTPS in 60 seconds.

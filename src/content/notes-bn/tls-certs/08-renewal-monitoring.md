---
title: 'Renewal, Monitoring ও Rotation'
subtitle: '90 দিন পার করে বেঁচে থাকা। Renewal hook, expiration monitoring, key rotation, আর সেই রাতের runbook যখন আপনার cert নীরবে expire হয়ে গেল আর এখন কেউ সাইটে পৌঁছাতে পারছে না।'
chapter: 8
level: 'advanced'
readingTime: '11 মিনিট'
topics: ['renewal', 'monitoring', 'key rotation', 'letsencrypt', 'tls']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা passport expiry alert — credential আজ এখনও valid, কিন্তু valid না থাকার আগে আপনাকে ব্যবস্থা নিতে হবে।

</Callout>

## 90-দিনের খাদ

Let's Encrypt certificate 90 দিন পর expire হয়। এটা ইচ্ছাকৃত — ছোট lifetime অজানা key compromise থেকে ক্ষতি সীমিত করে আর সবাইকে automate করতে বাধ্য করে। কিন্তু এর মানে এও যে যেকোনো সেটআপ যা _একবার কাজ করেছিল_ কিন্তু আর renew হয় না, তা নীরবে একটা কঠিন outage-এর দিকে হাঁটে।

আপনার একটাই কাজ: renewal কাজ করান, প্রমাণ করুন এটা কাজ করে, আর ভাঙলে খেয়াল করুন। এই চ্যাপ্টার তিনটাই কভার করে।

## renewal কনফিগার করা আছে কিনা নিশ্চিত করুন

আপনার প্রথম `certbot --nginx` run-এর পর, একটা renewal config থাকে `/etc/letsencrypt/renewal/example.com.conf`-এ:

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

এই ফাইল certbot-কে বলে কীভাবে renew করতে হবে। systemd timer এই directory-র প্রতিটা renewal config পড়ে আর প্রতিটা process করে।

```bash
$ sudo systemctl list-timers certbot
NEXT                         LEFT     LAST                         PASSED   UNIT
Mon 2026-05-04 12:42:11 UTC  10h      Sun 2026-05-03 22:42:11 UTC  1h ago   certbot.timer
```

দিনে দুইবার। Renewal expiration-এর 30 দিন আগে ঘটে; কিছু due না থাকলে, certbot নীরবে বেরিয়ে যায়।

টেস্ট:

```bash
sudo certbot renew --dry-run
```

তালিকাভুক্ত প্রতিটা cert-এর জন্য এটা পাস করলে, আসল renewal-ও হবে।

## Renewal hook — সঠিক service reload করুন

একটা cert renew হলে, নতুন ফাইল দেখা যায়, কিন্তু memory-তে _পুরোনো_ cert ধরে থাকা service reload না হওয়া পর্যন্ত সেটাই ব্যবহার করে যায়। nginx, postgres, dovecot, প্রতিটা TLS-ব্যবহারকারী daemon-কে বলতে হবে।

certbot hook সাপোর্ট করে:

- **pre-hook** — renewal চেষ্টার আগে চলে। standalone validation ব্যবহার করলে `nginx stop` করতে উপকারী (`--nginx`-এর সাথে বিরল)।
- **deploy-hook** — একটা সফল renewal-এর পর চলে, কেবল renew করা cert-এর জন্য।
- **post-hook** — সব renewal চেষ্টার পর চলে, কোনোটা renew না হলেও।

Debian/Ubuntu-তে ডিফল্ট certbot install `/etc/letsencrypt/renewal-hooks/deploy/`-এ একটা deploy hook-এর মাধ্যমে স্বয়ংক্রিয়ভাবে nginx reload সেট আপ করে। কিন্তু non-nginx service-এর জন্য, আপনি সেগুলো সেট আপ করেন:

```bash
# /etc/letsencrypt/renewal-hooks/deploy/postgres-reload.sh
#!/bin/bash
systemctl reload postgresql
```

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/postgres-reload.sh
```

এখন প্রতিটা renewal-এর পর, postgres তার config reload করে আর নতুন cert তুলে নেয়।

যেসব service-এর একটা আসল restart লাগে (বিরল), `reload`-এর বদলে `restart` ব্যবহার করুন। nginx, postgres, আর বেশিরভাগ daemon connection না ফেলে TLS config reload করে — এটা পছন্দ করুন।

## Per-cert renewal hook

আপনার cert প্রতি ভিন্ন hook লাগলে, renewal config edit করুন:

```ini
# /etc/letsencrypt/renewal/example.com.conf
[renewalparams]
...
renew_hook = systemctl reload nginx
```

hook কেবল এই নির্দিষ্ট cert-এর সফল renewal-এর পর চলে।

## expiration monitoring

সব automation থাকা সত্ত্বেও, জিনিস ভাঙতে পারে — একটা misconfigured nginx, একটা মুছে ফেলা A record, একটা DNS plugin-এর বাসি credentials, ACME protocol-এ একটা upstream পরিবর্তন। cert expire হওয়ার আগে আপনাকে _খেয়াল_ করতে হবে।

মূল্যের ক্রমে তিনটা layer:

### 1. certbot-এর নিজের email notification

প্রথম run-এর সময় সেট করা; certbot account-এ সংরক্ষিত। renew না হয়ে একটা cert expire হওয়ার 20 দিনের মধ্যে থাকলে Let's Encrypt একটা email পাঠায়। এটা safety net — কিন্তু এটা email আসলে পড়া হওয়ার ওপর নির্ভর করে।

verify বা পরিবর্তন করতে:

```bash
sudo certbot register --update-registration --email new-email@example.com
```

### 2. Local check — একটা দৈনিক systemd timer

একটা ছোট script রাখুন যা প্রতিটা cert চেক করে আর কোনোটা expire হওয়ার খুব কাছে থাকলে alert করে।

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

এটা একটা systemd timer-এ মুড়ুন:

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

script non-zero-তে বেরোলে, systemd unit ফেল করে। failure-এ আপনাকে email করতে systemd কনফিগার করুন (SRE-এর চ্যাপ্টার 9-এর একটা বিষয়), বা একটা notification system-এর সাথে জোড়া দিন।

### 3. External monitoring

উপরের script _server-এ_ চলে। server চলে গেলে (network partition, power outage, deletion), check-ও চলে যায়। External monitoring সেগুলো ধরে:

- **UptimeRobot, Pingdom, Better Uptime, Healthchecks.io** — বেশিরভাগের একটা "TLS expiry" check আছে যা আপনার domain-এ লাগে আর বাইরে থেকে cert পড়ে। Free tier ছোট fleet কভার করে।
- **Self-hosted: blackbox_exporter** + Prometheus — `probe_ssl_earliest_cert_expiry` metric। N দিনের মধ্যে থাকলে alert করুন।

External check খেয়াল করে যখন:

- cert box-এ renew বন্ধ হয়েছে।
- cert renew হয়েছে কিন্তু nginx কখনো reload হয়নি।
- DNS A record বদলেছে আর nginx একটা ভিন্ন (বা কোনো) cert সার্ভ করছে।
- box পুরোপুরি চলে গেছে।

যেকোনো production সাইটের জন্য, অন্তত একটা external check চালান। Paid service $0–$10/মাস থেকে শুরু হয় আর প্রতিটা operator-কে অন্তত একবার বাঁচিয়েছে।

## বাইরে থেকে cert পড়া আর পরিদর্শন করা

মুখস্থ করার মতো কয়েকটা one-liner:

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

আপনি সন্দেহ করলে একটা renewal খারাপভাবে নেমেছে, এগুলো আপনাকে বলে nginx আসলে কী সার্ভ করছে — প্রায়ই `/etc/letsencrypt/live/`-এ যা আছে তার থেকে ভিন্ন।

## একটা renewal জোর করা

সাধারণত certbot কেবল expiry-র 30 দিনের মধ্যে renew করে। একটা জোর করতে (একটা config সমস্যা ঠিক করার পর, একটা বড় ইভেন্টের আগে, ইত্যাদি):

```bash
sudo certbot renew --force-renewal --cert-name example.com
```

`--cert-name` একটা cert-এ সীমাবদ্ধ করে; এটা ছাড়া, **সব** cert renew হয়, যা rate limit-এ লাগতে পারে।

একটা আসল renewal না পুড়িয়ে পুরো flow টেস্ট করতে, staging ব্যবহার করুন:

```bash
sudo certbot --staging --force-renewal --cert-name example.com -d example.com
```

staging cert trusted নয়, কিন্তু আপনি renewal mechanics কাজ করে তা নিশ্চিত করতে পারেন, তারপর আত্মবিশ্বাসী হলে একটা আসল renewal চালান।

## Key rotation

Standard certbot renewal বিদ্যমান private key **পুনর্ব্যবহার করে**। এটা বেশিরভাগ সেটআপের জন্য ঠিক কিন্তু মানে একই key প্রতিটা renewal জুড়ে disk-এ ছিল — সম্ভবত বছরের পর বছর।

প্রতিটা renewal-এ key rotate করতে (নিরাপদ, প্রস্তাবিত):

```bash
sudo certbot renew --reuse-key=false
```

বা renewal config-এ স্থায়ীভাবে সেট করুন:

```ini
[renewalparams]
reuse_key = False
```

এখন থেকে, প্রতিটা renewal একটা fresh key তৈরি করে। একটা key কোনোভাবে exfiltrate হলে, exposure renewal window (সর্বোচ্চ 90 দিন, সাধারণত 60) দিয়ে সীমাবদ্ধ।

## key type সুইচ করা

আধুনিক certbot ডিফল্ট ECDSA-তে, যা আপনি চান। আপনার পুরোনো RSA cert থাকলে আর migrate করতে চাইলে:

```bash
sudo certbot --nginx --key-type ecdsa --force-renewal -d example.com
```

ECDSA P-256 key দিয়ে sign করা RSA 2048-এর চেয়ে ~10x দ্রুত — সেকেন্ডে হাজার হাজার TLS handshake করা high-traffic সাইটের জন্য অর্থপূর্ণ। ছোট signature bandwidth-ও বাঁচায়।

## একটা renewal ফেল করলে কী করবেন

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

certbot log দীর্ঘ কিন্তু পাঠযোগ্য। `Detail:` line খুঁজুন — সেগুলোতে আসল server-side প্রত্যাখ্যানের কারণ আছে।

## একটা cert expire হলে কী করবেন

আপনার হাতে ~~24 ঘণ্টা~~ কোনো সময় নেই। browser expired cert তৎক্ষণাৎ প্রত্যাখ্যান করে।

অপারেশনের ক্রম:

1. **expiration নিশ্চিত করুন** — `openssl s_client -connect example.com:443 &lt; /dev/null | openssl x509 -enddate -noout`।
2. **renewal config ঠিক করুন** — সাধারণত মূল কারণ একটা misconfigured location, মুছে ফেলা A record, বা expired DNS API token।
3. **একটা renewal জোর করুন** — `sudo certbot renew --force-renewal --cert-name example.com`।
4. **nginx reload করুন** — `sudo systemctl reload nginx`।
5. **বাইরে থেকে verify করুন** — অন্য একটা machine থেকে, `curl -I https://example.com/`।

মিনিটের মধ্যে সমাধান করতে না পারলে, ডিবাগ করার সময় service reachable রাখতে অস্থায়ীভাবে একটা self-signed cert-এ fall back করুন (একটা warning সহ)। 100% downtime-এর চেয়ে ভালো।

## CT log — আপনার cert সঠিকভাবে ইস্যু হয়েছে তা verify করুন

প্রতিটা Let's Encrypt cert public **Certificate Transparency** log-এ লগ হয়। যে কেউ এটা দেখতে পারে। আপনি আপনার domain-এর জন্য ইস্যু করা অপ্রত্যাশিত cert monitor করতে পারেন (যা একটা CA ভুল বা compromise-এর ইঙ্গিত দিতে পারে)।

Tool:

- **crt.sh** — CT log খোঁজার web UI। `example.com` খুঁজে কখনো ইস্যু করা প্রতিটা cert দেখুন।
- **Cert Spotter** (sslmate) — আপনার domain-এর জন্য একটা নতুন cert দেখা দিলে একটা email পাঠায়।

আপনি কখনো আপনার domain-এর জন্য এমন একটা cert দেখলে যা আপনি request করেননি, এটাকে একটা গুরুতর incident হিসেবে treat করুন — তৎক্ষণাৎ issuing CA-র সাথে যোগাযোগ করুন।

## Cert pinning — আধুনিক সেটআপে সাধারণত এড়িয়ে চলুন

পুরোনো নির্দেশনা: browser-এ একটা নির্দিষ্ট cert pin করুন (HPKP)। আধুনিক নির্দেশনা: **করবেন না**। HPKP browser-রা 2018-এর দিকে deprecate করেছিল নিজেকে একটা কোণে pin করার ঝুঁকির কারণে — pin করা key হারালে, pin-এর lifetime-এর জন্য সাইট unreachable।

আপনার একটা pinning use case থাকলে (আপনার API-এর সাথে কথা বলা একটা mobile app), app-এ pin করুন — কিন্তু cert নিজে নয়, _public key_ (SPKI) pin করুন, আর সাথে একটা backup key-ও pin করুন।

## রিক্যাপ

- Renewal certbot systemd timer-এর মাধ্যমে ঘটে, দিনে দুইবার, expiration-এর 30 দিন আগে।
- non-nginx service-এর (postgres, ইত্যাদি) জন্য deploy hook যোগ করুন যাতে তারা renewal-এর পর reload হয়।
- expiration তিনভাবে monitor করুন: certbot email, local script, external check। তিনটাই চালান।
- `certbot renew --dry-run` হলো নিরাপদ মহড়া। জরুরি অবস্থার জন্য `--force-renewal`।
- ভালো security hygiene-এর জন্য key rotate করুন (`reuse_key = False`)।
- আপনার domain-এর জন্য ইস্যু করা অপ্রত্যাশিত cert ধরতে Certificate Transparency monitor ব্যবহার করুন।

এটা হলো **TLS & Certificates** ট্র্যাকের শেষ। আপনি এখন কোনো ম্যানেজড সার্ভিস না ছুঁয়ে আসল TLS certificate ইস্যু, কনফিগার, deploy, monitor, আর renew করতে পারেন। আপনার মালিকানার প্রতিটা domain 60 সেকেন্ডে HTTPS পাবে।

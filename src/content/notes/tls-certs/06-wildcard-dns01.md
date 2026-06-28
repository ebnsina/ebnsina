---
title: 'Wildcard Certs & DNS-01'
subtitle: "When HTTP validation isn't enough — issuing wildcard certs, automating DNS-01 with provider plugins, and the security tradeoffs of API tokens that can edit DNS."
chapter: 6
level: 'intermediate'
readingTime: '10 min'
topics: ['wildcard', 'dns-01', 'letsencrypt', 'cloudflare', 'route53']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A master key that opens every room in a building, versus a key cut for one specific door.

</Callout>

## When you need DNS-01

HTTP-01 (chapter 4) requires the CA to fetch a file over HTTP. That works for most setups, but fails for:

- **Wildcard certificates** (`*.example.com`). Let's Encrypt only issues these via DNS-01.
- **Internal-only services** with no public HTTP endpoint. The CA cannot reach `internal.example.com` from the internet.
- **Multi-server load-balanced setups** where placing a file on one node does not guarantee the validation server hits that node.
- **Port 80 firewalled** for security or compliance.
- **Pre-issuance** for services that do not exist yet — issue the cert, then bring up the server with TLS already configured.

DNS-01 is the answer to all of these. Instead of placing a file at a URL, you place a TXT record at `_acme-challenge.<domain>` containing a specific value. The CA queries DNS; if the value matches, you proved control of the domain (because changing DNS records requires either domain ownership or compromised DNS infrastructure — same threat model as HTTP-01).

## Wildcard certs — what they cover

A `*.example.com` certificate matches any **single-level** subdomain:

| Domain                    | Matches `*.example.com`?                  |
| ------------------------- | ----------------------------------------- |
| `www.example.com`         | yes                                       |
| `api.example.com`         | yes                                       |
| `app.staging.example.com` | **no** — multi-level                      |
| `example.com`             | **no** — wildcard does not match the apex |

To cover both the apex and the wildcard, request both:

```bash
sudo certbot certonly --dns-cloudflare \
  -d example.com -d "*.example.com"
```

For two-level wildcards (`*.staging.example.com`), request that explicitly. Stacked wildcards like `*.*.example.com` are not supported.

## DNS-01 step by step

Without a plugin, you would do this by hand:

1. Run certbot in `--manual --preferred-challenges dns` mode.
2. certbot prints the TXT record value to add.
3. You log into your DNS provider and add the record.
4. You wait for DNS propagation (1–60 minutes).
5. You hit Enter; certbot tells the CA to validate.
6. The CA queries DNS; if the value matches, the cert is issued.

```bash
sudo certbot certonly \
  --manual \
  --preferred-challenges dns \
  -d example.com -d "*.example.com"
```

```text
Please deploy a DNS TXT record under the name:
_acme-challenge.example.com.

with the following value:
abcdef1234567890_AbCdEfGhIjKlMnOpQrStUvWxYz

Press Enter to continue
```

Add the TXT record at your DNS provider, wait for propagation, press Enter. Done.

The manual flow works once but is awful for renewal — you would have to babysit certbot every 60 days. Plugins automate this.

## Plugins — DNS provider integration

certbot has plugins for major DNS providers. They use the provider's API to add and remove the TXT record automatically.

| Provider                    | Plugin                             |
| --------------------------- | ---------------------------------- |
| Cloudflare                  | `python3-certbot-dns-cloudflare`   |
| Route53 (AWS)               | `python3-certbot-dns-route53`      |
| DigitalOcean                | `python3-certbot-dns-digitalocean` |
| Google Cloud DNS            | `python3-certbot-dns-google`       |
| Linode                      | `python3-certbot-dns-linode`       |
| OVH                         | `python3-certbot-dns-ovh`          |
| RFC2136 (BIND, dynamic DNS) | `python3-certbot-dns-rfc2136`      |

For other providers (Hetzner, Namecheap, Porkbun, generic ACME-DNS), use third-party plugins via pip, or use `acme.sh` which has wider provider support.

Install the plugin:

```bash
sudo apt install -y python3-certbot-dns-cloudflare
```

## Cloudflare example — common, free DNS

Most domains hosted on Cloudflare for DNS (free) can use the `dns-cloudflare` plugin.

**1. Create an API token** in Cloudflare's dashboard:

- Profile → API Tokens → Create Token.
- Use the "Edit zone DNS" template.
- Restrict to the specific zone(s) you need.
- Save the token. You will only see it once.

<Callout type="warn">

**Use a scoped API token, not the global API key.**

The global API key has full account access — if it leaks, attackers can transfer your domains. A scoped token can only edit the zone(s) you specify, with a permission model you control. Always.

</Callout>

**2. Save the credentials file:**

```bash
sudo mkdir -p /etc/letsencrypt
sudo nano /etc/letsencrypt/cloudflare.ini
```

```ini
# /etc/letsencrypt/cloudflare.ini
dns_cloudflare_api_token = your-scoped-api-token-here
```

```bash
sudo chmod 600 /etc/letsencrypt/cloudflare.ini
```

The `chmod 600` is critical — anyone who can read this file can edit your DNS.

**3. Issue the cert:**

```bash
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 30 \
  -d example.com -d "*.example.com"
```

`--dns-cloudflare-propagation-seconds 30` tells certbot to wait 30 seconds after adding the TXT record before asking the CA to validate. Cloudflare propagates fast; other providers may need 60–120 seconds.

**4. Verify:**

```bash
sudo certbot certificates
```

```text
Certificate Name: example.com
    Domains: example.com *.example.com
    Expiry Date: 2026-07-30 ...
    Certificate Path: /etc/letsencrypt/live/example.com/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/example.com/privkey.pem
```

**5. Renewal works automatically.** The renewal timer reads the saved config and re-runs the same DNS-01 flow.

## Route53 example — IAM-scoped automation

For domains hosted in AWS Route53:

```bash
sudo apt install -y python3-certbot-dns-route53
```

Authentication via IAM (the cleanest path):

1. **Create an IAM policy** with minimum permissions:

   ```json
   {
   	"Version": "2012-10-17",
   	"Statement": [
   		{
   			"Effect": "Allow",
   			"Action": ["route53:ListHostedZones", "route53:GetChange"],
   			"Resource": ["*"]
   		},
   		{
   			"Effect": "Allow",
   			"Action": ["route53:ChangeResourceRecordSets"],
   			"Resource": ["arn:aws:route53:::hostedzone/Z1234567890ABC"]
   		}
   	]
   }
   ```

   Replace `Z1234567890ABC` with your hosted zone ID.

2. **Attach the policy** to either:
   - An IAM user, then put credentials in `~/.aws/credentials` or `/root/.aws/credentials`.
   - An IAM role attached to the EC2 instance — no credentials needed.

3. **Run certbot:**

   ```bash
   sudo certbot certonly \
     --dns-route53 \
     -d example.com -d "*.example.com"
   ```

That's it. Renewals work via the same role/credentials.

## DNS-01 with internal DNS — RFC2136

If you run your own BIND or BIND-compatible DNS server (no provider API), use the RFC2136 plugin. You configure dynamic DNS updates with a TSIG key and certbot updates records over the standard `nsupdate` protocol.

```bash
sudo apt install -y python3-certbot-dns-rfc2136
```

```ini
# /etc/letsencrypt/rfc2136.ini
dns_rfc2136_server = 192.0.2.10
dns_rfc2136_port = 53
dns_rfc2136_name = certbot.
dns_rfc2136_secret = base64-encoded-tsig-key
dns_rfc2136_algorithm = HMAC-SHA512
```

```bash
sudo certbot certonly \
  --dns-rfc2136 \
  --dns-rfc2136-credentials /etc/letsencrypt/rfc2136.ini \
  -d example.com -d "*.example.com"
```

This is rare but useful for fully self-hosted setups (and for issuing certs for completely internal hostnames that have no public DNS).

## acme.sh — alternative with broader plugin support

If your DNS provider has no certbot plugin, [acme.sh](https://acme.sh) supports almost every provider. It is a pure-shell ACME client, ~5,000 lines of bash, surprisingly robust.

```bash
curl https://get.acme.sh | sh -s email=admin@example.com

# Hetzner, for example
export HETZNER_Token="..."
~/.acme.sh/acme.sh --issue --dns dns_hetzner -d example.com -d "*.example.com"
```

acme.sh installs its own renewal cron job. Certs end up in `~/.acme.sh/example.com/`. From there, copy to wherever nginx expects them, and reload nginx.

## DNS-01 for service mesh and internal services

For internal-only services (`internal.example.com` resolvable only inside your VPC), DNS-01 is the only Let's Encrypt option. The trick is that the _public_ CA still has to query _public_ DNS for `_acme-challenge.internal.example.com` — so you need to add that TXT record in your _public_ DNS, even though `internal.example.com` itself is not in public DNS.

This is fine and standard. The TXT record only proves you control the parent zone, not that the host actually exists publicly.

Some teams use a CNAME trick:

```text
_acme-challenge.internal.example.com   IN  CNAME  internal.acme-challenge.example.com.
```

Then certbot or acme.sh updates `internal.acme-challenge.example.com` (a single dedicated subdomain), and the CNAME resolves to it during validation. This lets one API key access only one specific record set, instead of every zone.

## Security considerations

- **Scope API tokens narrowly.** "Edit DNS for one specific zone" is enough; do not use account-level keys.
- **Restrict file permissions.** Credential files must be `600` and owned by root.
- **Audit access.** Cloudflare and AWS log every API call. Watch for tokens being used from unexpected IPs.
- **Rotate on suspicion.** If you ever wonder whether a token leaked, revoke and reissue. It takes 30 seconds.
- **Use IAM roles where possible.** On EC2, an instance role attached at boot has no credentials to leak.

A compromised DNS-edit credential is a serious incident — an attacker can issue valid certs for your domain and then mount man-in-the-middle attacks. Treat it like a database password.

## Mixing HTTP-01 and DNS-01

Nothing stops you from using HTTP-01 for some domains and DNS-01 for others. certbot tracks each cert independently in `/etc/letsencrypt/renewal/`.

A common pattern: HTTP-01 for public web servers (simple, no API tokens needed), DNS-01 for wildcards and internal services. Both renew through the same timer.

## Recap

- DNS-01 proves domain control by adding a TXT record at `_acme-challenge.<domain>`.
- Required for wildcard certs (`*.example.com`); useful for internal services and port-80-blocked environments.
- certbot has plugins for major DNS providers (Cloudflare, Route53, DigitalOcean, Google Cloud DNS, OVH, RFC2136).
- Always use scoped API tokens with minimum permissions. File permissions must be 600.
- acme.sh has broader provider support if certbot does not have a plugin for yours.
- Renewal works automatically via the same systemd timer — DNS-01 is a one-time setup cost.

Next chapter: putting these certs to work in nginx with a battle-tested TLS config.

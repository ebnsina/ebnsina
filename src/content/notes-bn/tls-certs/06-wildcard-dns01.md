---
title: 'Wildcard Cert ও DNS-01'
subtitle: 'যখন HTTP validation যথেষ্ট নয় — wildcard cert ইস্যু করা, provider plugin দিয়ে DNS-01 automate করা, এবং DNS edit করতে পারা API token-এর security tradeoff।'
chapter: 6
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['wildcard', 'dns-01', 'letsencrypt', 'cloudflare', 'route53']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা master key যা একটা building-এর প্রতিটা room খোলে, বনাম একটা নির্দিষ্ট দরজার জন্য কাটা একটা key।

</Callout>

## কখন আপনার DNS-01 দরকার

HTTP-01 (চ্যাপ্টার 4)-এর জন্য CA-কে HTTP-এর ওপর একটা ফাইল fetch করতে হয়। এটা বেশিরভাগ সেটআপে কাজ করে, কিন্তু এগুলোর জন্য ফেল করে:

- **Wildcard certificate** (`*.example.com`)। Let's Encrypt কেবল DNS-01-এর মাধ্যমে এগুলো ইস্যু করে।
- **Internal-only service** যাদের কোনো public HTTP endpoint নেই। CA internet থেকে `internal.example.com`-এ পৌঁছাতে পারে না।
- **Multi-server load-balanced setup** যেখানে একটা node-এ একটা ফাইল রাখলে validation server সেই node-এ লাগবে তার নিশ্চয়তা নেই।
- **Port 80 firewalled** security বা compliance-এর জন্য।
- **Pre-issuance** এমন service-এর জন্য যা এখনও নেই — cert ইস্যু করুন, তারপর TLS আগে থেকেই কনফিগার করা অবস্থায় server চালু করুন।

DNS-01 এসবের উত্তর। একটা URL-এ একটা ফাইল রাখার বদলে, আপনি `_acme-challenge.<domain>`-এ একটা নির্দিষ্ট value ধারণকারী একটা TXT record রাখেন। CA DNS query করে; value মিললে, আপনি domain নিয়ন্ত্রণের প্রমাণ দিলেন (কারণ DNS record বদলাতে হয় domain ownership নয়তো compromised DNS infrastructure লাগে — HTTP-01-এর মতোই একই threat model)।

## Wildcard cert — এগুলো কী কভার করে

একটা `*.example.com` certificate যেকোনো **single-level** subdomain-এর সাথে মেলে:

| Domain                    | `*.example.com`-এর সাথে মেলে?          |
| ------------------------- | -------------------------------------- |
| `www.example.com`         | হ্যাঁ                                  |
| `api.example.com`         | হ্যাঁ                                  |
| `app.staging.example.com` | **না** — multi-level                   |
| `example.com`             | **না** — wildcard apex-এর সাথে মেলে না |

apex আর wildcard দুইটাই কভার করতে, দুইটাই request করুন:

```bash
sudo certbot certonly --dns-cloudflare \
  -d example.com -d "*.example.com"
```

two-level wildcard-এর (`*.staging.example.com`) জন্য, সেটা স্পষ্টভাবে request করুন। `*.*.example.com`-এর মতো stacked wildcard সাপোর্টেড নয়।

## DNS-01 ধাপে ধাপে

একটা plugin ছাড়া, আপনি এটা হাতে করতেন:

1. `--manual --preferred-challenges dns` mode-এ certbot চালান।
2. certbot যোগ করার জন্য TXT record value প্রিন্ট করে।
3. আপনি আপনার DNS provider-এ log in করে record যোগ করেন।
4. আপনি DNS propagation-এর জন্য অপেক্ষা করেন (1–60 মিনিট)।
5. আপনি Enter চাপেন; certbot CA-কে validate করতে বলে।
6. CA DNS query করে; value মিললে, cert ইস্যু হয়।

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

আপনার DNS provider-এ TXT record যোগ করুন, propagation-এর জন্য অপেক্ষা করুন, Enter চাপুন। শেষ।

manual flow একবার কাজ করে কিন্তু renewal-এর জন্য জঘন্য — আপনাকে প্রতি 60 দিনে certbot-কে বেবিসিট করতে হতো। Plugin এটা automate করে।

## Plugin — DNS provider integration

certbot-এর প্রধান DNS provider-দের জন্য plugin আছে। এগুলো provider-এর API ব্যবহার করে স্বয়ংক্রিয়ভাবে TXT record যোগ ও সরায়।

| Provider                    | Plugin                             |
| --------------------------- | ---------------------------------- |
| Cloudflare                  | `python3-certbot-dns-cloudflare`   |
| Route53 (AWS)               | `python3-certbot-dns-route53`      |
| DigitalOcean                | `python3-certbot-dns-digitalocean` |
| Google Cloud DNS            | `python3-certbot-dns-google`       |
| Linode                      | `python3-certbot-dns-linode`       |
| OVH                         | `python3-certbot-dns-ovh`          |
| RFC2136 (BIND, dynamic DNS) | `python3-certbot-dns-rfc2136`      |

অন্য provider-দের (Hetzner, Namecheap, Porkbun, generic ACME-DNS) জন্য, pip-এর মাধ্যমে third-party plugin ব্যবহার করুন, বা `acme.sh` ব্যবহার করুন যার provider সাপোর্ট বেশি।

plugin ইনস্টল করুন:

```bash
sudo apt install -y python3-certbot-dns-cloudflare
```

## Cloudflare উদাহরণ — প্রচলিত, free DNS

DNS-এর জন্য Cloudflare-এ হোস্ট করা (free) বেশিরভাগ domain `dns-cloudflare` plugin ব্যবহার করতে পারে।

**1. একটা API token তৈরি করুন** Cloudflare-এর dashboard-এ:

- Profile → API Tokens → Create Token।
- "Edit zone DNS" template ব্যবহার করুন।
- আপনার দরকারি নির্দিষ্ট zone(গুলো)-তে সীমাবদ্ধ করুন।
- token সেভ করুন। আপনি এটা একবারই দেখবেন।

<Callout type="warn">

**একটা scoped API token ব্যবহার করুন, global API key নয়।**

global API key-এর পুরো account access আছে — এটা ফাঁস হলে, attacker আপনার domain transfer করতে পারে। একটা scoped token কেবল আপনার নির্দিষ্ট করা zone(গুলো) edit করতে পারে, একটা permission model সহ যা আপনি নিয়ন্ত্রণ করেন। সবসময়।

</Callout>

**2. credentials ফাইল সেভ করুন:**

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

`chmod 600` গুরুত্বপূর্ণ — এই ফাইল পড়তে পারে এমন যে কেউ আপনার DNS edit করতে পারে।

**3. cert ইস্যু করুন:**

```bash
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 30 \
  -d example.com -d "*.example.com"
```

`--dns-cloudflare-propagation-seconds 30` certbot-কে বলে TXT record যোগ করার পর CA-কে validate করতে বলার আগে 30 সেকেন্ড অপেক্ষা করতে। Cloudflare দ্রুত propagate করে; অন্য provider-এর 60–120 সেকেন্ড লাগতে পারে।

**4. Verify করুন:**

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

**5. Renewal স্বয়ংক্রিয়ভাবে কাজ করে।** renewal timer সেভ করা config পড়ে আর একই DNS-01 flow পুনরায় চালায়।

## Route53 উদাহরণ — IAM-scoped automation

AWS Route53-এ হোস্ট করা domain-এর জন্য:

```bash
sudo apt install -y python3-certbot-dns-route53
```

IAM-এর মাধ্যমে authentication (সবচেয়ে পরিষ্কার পথ):

1. **ন্যূনতম permission সহ একটা IAM policy তৈরি করুন:**

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

   `Z1234567890ABC`-কে আপনার hosted zone ID দিয়ে replace করুন।

2. **policy attach করুন** এর যেকোনো একটায়:
   - একটা IAM user, তারপর credentials `~/.aws/credentials` বা `/root/.aws/credentials`-এ রাখুন।
   - EC2 instance-এ attach করা একটা IAM role — কোনো credentials লাগে না।

3. **certbot চালান:**

   ```bash
   sudo certbot certonly \
     --dns-route53 \
     -d example.com -d "*.example.com"
   ```

ব্যস। একই role/credentials-এর মাধ্যমে renewal কাজ করে।

## internal DNS সহ DNS-01 — RFC2136

আপনি নিজের BIND বা BIND-compatible DNS server চালালে (কোনো provider API নেই), RFC2136 plugin ব্যবহার করুন। আপনি একটা TSIG key দিয়ে dynamic DNS update কনফিগার করেন আর certbot standard `nsupdate` protocol-এর ওপর record update করে।

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

এটা বিরল কিন্তু পুরোপুরি self-hosted সেটআপের জন্য (আর কোনো public DNS নেই এমন সম্পূর্ণ internal hostname-এর জন্য cert ইস্যু করতে) উপকারী।

## acme.sh — বিস্তৃত plugin সাপোর্ট সহ বিকল্প

আপনার DNS provider-এর কোনো certbot plugin না থাকলে, [acme.sh](https://acme.sh) প্রায় প্রতিটা provider সাপোর্ট করে। এটা একটা pure-shell ACME client, ~5,000 line bash, আশ্চর্যজনকভাবে মজবুত।

```bash
curl https://get.acme.sh | sh -s email=admin@example.com

# Hetzner, for example
export HETZNER_Token="..."
~/.acme.sh/acme.sh --issue --dns dns_hetzner -d example.com -d "*.example.com"
```

acme.sh নিজের renewal cron job ইনস্টল করে। Cert `~/.acme.sh/example.com/`-এ যায়। সেখান থেকে, nginx যেখানে প্রত্যাশা করে সেখানে কপি করুন, আর nginx reload করুন।

## service mesh আর internal service-এর জন্য DNS-01

internal-only service-এর (`internal.example.com` কেবল আপনার VPC-এর ভেতরে resolvable) জন্য, DNS-01-ই একমাত্র Let's Encrypt option। কৌশলটা হলো _public_ CA-কে এখনও `_acme-challenge.internal.example.com`-এর জন্য _public_ DNS query করতে হবে — তাই আপনাকে সেই TXT record আপনার _public_ DNS-এ যোগ করতে হবে, যদিও `internal.example.com` নিজে public DNS-এ নেই।

এটা ঠিক আছে আর standard। TXT record কেবল প্রমাণ করে আপনি parent zone নিয়ন্ত্রণ করেন, host আসলে publicly বিদ্যমান তা নয়।

কিছু team একটা CNAME কৌশল ব্যবহার করে:

```text
_acme-challenge.internal.example.com   IN  CNAME  internal.acme-challenge.example.com.
```

তারপর certbot বা acme.sh `internal.acme-challenge.example.com` (একটা মাত্র নিবেদিত subdomain) update করে, আর validation-এর সময় CNAME সেটায় resolve করে। এটা একটা API key-কে প্রতিটা zone-এর বদলে কেবল একটা নির্দিষ্ট record set অ্যাক্সেস করতে দেয়।

## security বিবেচনা

- **API token সংকীর্ণভাবে scope করুন।** "একটা নির্দিষ্ট zone-এর জন্য DNS edit" যথেষ্ট; account-level key ব্যবহার করবেন না।
- **file permission সীমাবদ্ধ করুন।** Credential ফাইল অবশ্যই `600` আর root-owned হতে হবে।
- **access audit করুন।** Cloudflare আর AWS প্রতিটা API call লগ করে। অপ্রত্যাশিত IP থেকে token ব্যবহার হচ্ছে কিনা দেখুন।
- **সন্দেহে rotate করুন।** একটা token ফাঁস হয়েছে কিনা কখনো ভাবলে, revoke করে reissue করুন। 30 সেকেন্ড লাগে।
- **যেখানে সম্ভব IAM role ব্যবহার করুন।** EC2-তে, boot-এ attach করা একটা instance role-এর ফাঁস হওয়ার মতো কোনো credentials নেই।

একটা compromise করা DNS-edit credential একটা গুরুতর incident — একজন attacker আপনার domain-এর জন্য valid cert ইস্যু করতে পারে আর তারপর man-in-the-middle attack চালাতে পারে। এটাকে একটা database password-এর মতো treat করুন।

## HTTP-01 আর DNS-01 মেশানো

কিছু domain-এর জন্য HTTP-01 আর অন্যদের জন্য DNS-01 ব্যবহার করা থেকে আপনাকে কিছু আটকায় না। certbot প্রতিটা cert স্বাধীনভাবে `/etc/letsencrypt/renewal/`-এ track করে।

একটা প্রচলিত pattern: public web server-এর জন্য HTTP-01 (সহজ, কোনো API token লাগে না), wildcard আর internal service-এর জন্য DNS-01। দুইটাই একই timer-এর মাধ্যমে renew হয়।

## রিক্যাপ

- DNS-01 `_acme-challenge.<domain>`-এ একটা TXT record যোগ করে domain নিয়ন্ত্রণ প্রমাণ করে।
- wildcard cert-এর (`*.example.com`) জন্য দরকার; internal service আর port-80-blocked পরিবেশের জন্য উপকারী।
- certbot-এর প্রধান DNS provider-দের (Cloudflare, Route53, DigitalOcean, Google Cloud DNS, OVH, RFC2136) জন্য plugin আছে।
- সবসময় ন্যূনতম permission সহ scoped API token ব্যবহার করুন। File permission অবশ্যই 600 হতে হবে।
- আপনার provider-এর certbot plugin না থাকলে acme.sh-এর provider সাপোর্ট বেশি।
- Renewal একই systemd timer-এর মাধ্যমে স্বয়ংক্রিয়ভাবে কাজ করে — DNS-01 একটা এককালীন সেটআপ খরচ।

পরের চ্যাপ্টার: এই cert-গুলোকে একটা battle-tested TLS config দিয়ে nginx-এ কাজে লাগানো।

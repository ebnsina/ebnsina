---
title: 'Certificates and the Chain of Trust'
subtitle: 'What lives inside a .pem file, what a CSR is, why intermediate certificates exist, and how a browser walks the chain to a root it already trusts.'
chapter: 3
level: 'beginner'
readingTime: '12 min'
topics: ['certificates', 'x509', 'csr', 'ca', 'chain of trust']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A passport — trusted because a government (CA) vouches for it, not because you trust the stranger holding it.

</Callout>

## The certificate is a signed assertion

A TLS certificate is a small file that says, in essence:

> "I, [Certificate Authority], assert that the public key inside this file belongs to [example.com], and is valid from [date] to [date]."

It is signed by the CA's private key. Anyone with the CA's public key can verify the signature. If you trust the CA, you transitively trust the assertion.

The format is **X.509**, a standard from the 1980s built on **ASN.1** (a binary encoding from the same era). You will encounter X.509 every time you touch TLS, SSH (sometimes), code signing, S/MIME — the entire PKI world.

## What is in a certificate

Decode one:

```bash
openssl x509 -in /etc/letsencrypt/live/example.com/cert.pem -text -noout
```

You will see:

```text
Certificate:
    Data:
        Version: 3 (0x2)
        Serial Number: 03:e1:0a:...
        Signature Algorithm: sha256WithRSAEncryption
        Issuer: C = US, O = Let's Encrypt, CN = R3
        Validity
            Not Before: Apr  1 00:00:00 2026 GMT
            Not After : Jun 30 23:59:59 2026 GMT
        Subject: CN = example.com
        Subject Public Key Info:
            Public Key Algorithm: rsaEncryption
                Public-Key: (2048 bit)
                Modulus:
                    00:c4:a3:...
                Exponent: 65537 (0x10001)
        X509v3 extensions:
            X509v3 Subject Alternative Name:
                DNS:example.com, DNS:www.example.com
            X509v3 Key Usage: critical
                Digital Signature, Key Encipherment
            X509v3 Extended Key Usage:
                TLS Web Server Authentication, TLS Web Client Authentication
            X509v3 Basic Constraints: critical
                CA:FALSE
            ...
    Signature Algorithm: sha256WithRSAEncryption
        9f:8e:7d:...
```

Read it as:

- **Subject** — who this certificate is _for_. `CN=example.com` is the legacy field; modern validation uses **Subject Alternative Name (SAN)**, which can list many domains.
- **Issuer** — the CA that signed this certificate. `Let's Encrypt R3` here.
- **Validity** — start and end dates. Outside this window, the certificate is invalid.
- **Subject Public Key Info** — the actual public key. RSA 2048 here; modern certs increasingly use ECDSA P-256.
- **Extensions** — flags for what the certificate may be used for. `Key Usage` and `Extended Key Usage` matter for browsers; `Basic Constraints: CA:FALSE` says this is an end-entity certificate, not itself a CA.
- **Signature** — the CA's signature over everything above.

## The chain of trust

Browsers do not trust Let's Encrypt's R3 directly. They trust a small set of _root_ CAs preinstalled in the operating system or browser. Every other certificate has to chain back to one of those roots.

```text
Root CA (ISRG Root X1, in browser's trust store)
   │ signs ▾
Intermediate CA (Let's Encrypt R3)
   │ signs ▾
Server certificate (example.com)
```

Three certificates, each signed by the next one up. The server presents the bottom two during the handshake; the browser already has the top one.

```bash
$ openssl s_client -connect example.com:443 -showcerts < /dev/null

---
Server certificate
subject=CN = example.com
issuer=CN = R3, O = Let's Encrypt, C = US

-----BEGIN CERTIFICATE-----
MIIFa...
-----END CERTIFICATE-----

---
Certificate chain
 0 s:CN = example.com
   i:CN = R3, O = Let's Encrypt, C = US
 1 s:CN = R3, O = Let's Encrypt, C = US
   i:CN = ISRG Root X1, O = Internet Security Research Group, C = US
```

The server's `fullchain.pem` is the concatenation of these — the leaf cert, then the intermediate(s), then optionally the root. The leaf must come first; nginx (and every other server) sends the chain in that exact order to the client.

## Why intermediate certificates exist

You might wonder: why not have the root CA sign every certificate directly? Two reasons:

1. **Security.** The root CA's private key is the most valuable secret in the entire PKI. If it leaks, every certificate ever signed by it becomes worthless. Roots are kept _offline_ — physically air-gapped, only accessed for ceremonies that issue intermediates. The intermediate CAs are online and do the day-to-day signing. If an intermediate's key is compromised, only certs it signed need to be revoked, not the root.

2. **Operational separation.** A CA might have many intermediates for different purposes (TLS server certs, code signing, S/MIME). Compromise of one does not compromise the others.

This is why you see `Let's Encrypt R3` (intermediate) issuing your cert, and `ISRG Root X1` (root) signing R3.

## Validation — what the browser actually checks

When the server presents its chain in the handshake, the client validates:

1. **Domain match.** The cert's `Subject Alternative Name` (or, fallback, `CN`) must match the hostname being connected to. `example.com` matches `example.com`; a cert for `*.example.com` matches `foo.example.com` but _not_ `example.com` itself or `foo.bar.example.com`.

2. **Validity dates.** Today must be between `Not Before` and `Not After`.

3. **Signature.** Server cert signature must verify with the intermediate's public key. Intermediate must verify with the root's public key. If any fails, the chain is broken.

4. **Trust anchor.** The top of the chain (the root) must be in the client's trust store.

5. **Key usage.** The cert must be authorized for `serverAuth` (Extended Key Usage). Some breakages happen here when CAs issue mis-purposed certs.

6. **Revocation status.** Has this cert been revoked since issuance? Two ways to check:
   - **CRL** (Certificate Revocation List) — the CA publishes a list of revoked certs. Big and slow.
   - **OCSP** — the client asks the CA's OCSP responder "is this cert still valid?" The response is signed and short. **OCSP stapling** has the _server_ fetch the OCSP response and include it in the handshake, so the client does not need to make an extra request.

If everything passes, the connection is established with full trust. If anything fails, the browser shows that big red warning.

## Public key formats — the alphabet soup

Files relating to certificates come in many encodings:

| Extension      | Format                                    | Contents                                                                       |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| `.pem`         | Base64 with `-----BEGIN/END-----` markers | Anything — cert, key, chain. Most common.                                      |
| `.crt`, `.cer` | Same as `.pem` (or DER)                   | A certificate (often).                                                         |
| `.key`         | PEM                                       | A private key.                                                                 |
| `.csr`         | PEM                                       | A certificate signing request.                                                 |
| `.der`         | Binary                                    | The same X.509 data, not Base64.                                               |
| `.pfx`, `.p12` | PKCS#12, binary                           | Cert + chain + private key in one password-protected blob. Microsoft-flavored. |

For Linux + nginx + Let's Encrypt, you live entirely in `.pem`. PEM is just Base64-encoded DER with header/footer markers.

```text
-----BEGIN CERTIFICATE-----
MIIFazCCBFOgAwIBAgISA9UD...
...
-----END CERTIFICATE-----
```

`fullchain.pem` is multiple of those concatenated — leaf, then intermediates.

## Private keys

The key file is what makes the entire system work. If anyone else has your private key, they _are_ you, until the cert expires or is revoked.

```text
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcw...
...
-----END PRIVATE KEY-----
```

Private keys are typically:

- **RSA 2048** — old and widely compatible. Slow to sign, slow to verify.
- **RSA 4096** — even slower, marginal extra security. Avoid.
- **ECDSA P-256** — much faster than RSA. Modern default. Smaller signatures.
- **Ed25519** — newest. Faster still. Less universally supported by old clients but fine for modern web.

Permissions:

```bash
$ ls -la /etc/letsencrypt/live/example.com/privkey.pem
-rw------- 1 root root 1704 Apr  1 10:42 privkey.pem
```

`600`, owned by root. Anyone who reads this file can impersonate your domain. nginx running as `www-data` reads it via the `letsencrypt` group, or runs the master as root and drops to `www-data` for workers.

## The CSR (Certificate Signing Request)

Before a CA issues you a certificate, you generate a **CSR**. It contains the public half of your key pair plus the subject info you want on the certificate. You send the CSR to the CA; they verify you control the domain; they sign and return a certificate.

```bash
# Generate a private key
openssl genrsa -out example.com.key 2048

# Generate a CSR
openssl req -new -key example.com.key -out example.com.csr \
  -subj "/CN=example.com" \
  -addext "subjectAltName=DNS:example.com,DNS:www.example.com"
```

The CA never sees your private key. They only need the CSR (which has the public key) and proof you control the domain.

For Let's Encrypt, certbot does all of this for you. You will essentially never run `openssl req` by hand in production — but understanding what a CSR is helps explain how the whole system works.

## Domain Validation vs Organization Validation

Three certificate types exist:

- **DV (Domain Validated)** — the CA checked you control the domain. That is it. Free from Let's Encrypt. Padlock in browser, no extra label. This is what 99% of sites use.
- **OV (Organization Validated)** — the CA also verified the legal entity. Costs money. Padlock plus organization name in some legacy browsers.
- **EV (Extended Validation)** — the CA did a thorough background check. Costs more. Used to show a green address bar with the company name in browsers; most browsers no longer differentiate visually since EV did not measurably improve security.

For everyday TLS, DV is fine. EV/OV exist for compliance reasons in some industries (banks, governments). The cryptographic protection is identical.

## Revocation — when a cert must die early

Certs have an expiration date, but sometimes a cert must be invalidated _before_ expiration:

- The private key was compromised (lost laptop, leaked from a CI system, server breach).
- The domain ownership changed.
- The CA made a mistake and issued an incorrect cert.

Revocation is hard in distributed systems — clients have to learn the cert is no longer valid. CRLs (download a list) and OCSP (ask online) are the two mechanisms; both have known reliability and privacy issues.

In practice, the modern answer is **short-lived certs with automatic renewal**. Let's Encrypt's 90-day expiration plus auto-renewal is itself a partial solution to the revocation problem — even if revocation does not fully propagate, a compromised cert is dead within 90 days.

## Self-signed certificates — only for development

You can make your own certificate without a CA. Browsers will not trust it (no chain to a root), but it is fine for local development:

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem \
  -days 365 -nodes \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

This generates a key and a self-signed cert in one command. Use it for `https://localhost:8443` testing. Browsers will warn loudly; click through the warning for development only. **Never** deploy a self-signed cert to production — every visitor sees a scary warning and most simply leave.

A better dev path: **mkcert**, a tool that creates a local CA your OS trusts, then issues certs from it. No more browser warnings during dev.

```bash
brew install mkcert
mkcert -install                         # adds local CA to system trust store
mkcert localhost 127.0.0.1 ::1          # creates ./localhost.pem and ./localhost-key.pem
```

## Files you will actually touch

After running certbot for a domain, you get:

```text
/etc/letsencrypt/live/example.com/
├── cert.pem        # leaf cert only
├── chain.pem       # intermediates only (no leaf)
├── fullchain.pem   # leaf + intermediates
├── privkey.pem     # private key
└── README
```

In nginx:

```nginx
ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
```

Always use `fullchain.pem`, not `cert.pem` — without the intermediate, browsers cannot build the chain, and you will see "untrusted" errors on some clients.

## Recap

- A certificate is a public key plus identity claims, signed by a CA.
- X.509 is the format. PEM (base64) is the typical on-disk encoding.
- The chain goes leaf → intermediate(s) → root. Browser trusts the root; verifies signatures down to the leaf.
- Validation checks domain, dates, signatures, trust anchor, key usage, and revocation.
- Modern keys are ECDSA P-256 or Ed25519. RSA 2048 is fine but slower.
- Always serve `fullchain.pem` in nginx, never just `cert.pem`.
- Self-signed certs are for development only. Use mkcert for a friendlier local TLS setup.

Next chapter: how Let's Encrypt actually issues a cert — the ACME protocol, end to end.

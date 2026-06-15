---
title: "TLS and mTLS"
subtitle: "Server TLS encrypts the wire and proves the server's identity. Mutual TLS adds the same proof for clients. Both ride on the same handshake — and once you have a small CA, both are a few lines of Go."
chapter: 9
level: "advanced"
readingTime: "12 min"
topics: ["grpc", "tls", "mtls", "certificates", "security"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

The chapter-4 server runs plaintext. That is fine on `localhost`. The moment traffic crosses a network boundary — even inside a private VPC — you want **server TLS**. The moment you want to authenticate clients without bearer tokens (service-to-service), you want **mutual TLS**.

Both are the same TLS handshake; mTLS just adds a client certificate to it. Get the cert plumbing right once and the rest is one-liner config.

This chapter assumes you read the **TLS & Certificates** track of the path. If "ECDHE", "ALPN", "chain of trust" sound unfamiliar, go finish that track first.

<Callout type="info">

**Real-World Analogy**

mTLS is two people showing ID to each other before shaking hands — not just the server proving itself to the client.

</Callout>

## Why mTLS instead of bearer tokens?

For service-to-service identity inside your own infrastructure, mTLS gives you:

- **Identity baked into the connection.** No token to lose, no header to leak, no expiry to refresh. The cert *is* the identity.
- **Verified at handshake.** Every connection proves both sides; bearer tokens only get checked when handlers run.
- **Fine-grained ACLs.** Each service has its own cert; ACLs match Common Names or SANs. Easy to audit.
- **No shared secrets.** Each service has a private key it never sends; tokens get sent on every request.

The cost is a small CA you operate. For a self-hosted setup, that is a few `openssl` commands and a script.

## Building a tiny CA

You need three things: a CA cert + key, a server cert signed by the CA, and (for mTLS) a client cert signed by the CA.

```bash
# 1. CA root
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
  -subj "/CN=mygrpc-ca" -out ca.crt

# 2. server key + CSR
openssl genrsa -out server.key 4096
openssl req -new -key server.key -subj "/CN=user-service" -out server.csr

# 3. server cert signed by the CA
cat > server.ext <<EOF
subjectAltName = DNS:user-service,DNS:user-service.internal,DNS:localhost,IP:127.0.0.1
extendedKeyUsage = serverAuth
EOF
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 365 -sha256 -extfile server.ext

# 4. client key + CSR (for mTLS)
openssl genrsa -out client.key 4096
openssl req -new -key client.key -subj "/CN=billing-service" -out client.csr

# 5. client cert signed by the CA
cat > client.ext <<EOF
extendedKeyUsage = clientAuth
EOF
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out client.crt -days 365 -sha256 -extfile client.ext
```

After that you have:

- `ca.crt`, `ca.key` — the CA. Distribute `ca.crt` everywhere; keep `ca.key` very safe.
- `server.crt`, `server.key` — server identity for `user-service`.
- `client.crt`, `client.key` — client identity for `billing-service`.

The `subjectAltName` (SAN) on the server cert is the part Go's verifier actually checks — clients connecting to `user-service` (or `localhost`, or `127.0.0.1`) get the cert validated by name. CN is informational; SANs are authoritative.

<Callout type="warn">

**Never check `*.key` files into git.** Private keys are credentials. A leaked CA key means the entire trust chain is compromised — every client and server cert ever issued by it is suspect. Operate the CA on an offline-capable workstation or with a dedicated secrets manager.

</Callout>

## Server TLS — single-direction

Server proves its identity to clients. Clients verify against the CA cert. That is enough for "encrypted in transit, server authenticity guaranteed."

Server:

```go
import (
    "crypto/tls"
    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials"
)

cert, err := tls.LoadX509KeyPair("server.crt", "server.key")
if err != nil {
    log.Fatalf("load server cert: %v", err)
}

creds := credentials.NewTLS(&tls.Config{
    Certificates: []tls.Certificate{cert},
    MinVersion:   tls.VersionTLS13,
})

s := grpc.NewServer(grpc.Creds(creds))
```

Client:

```go
caCert, err := os.ReadFile("ca.crt")
if err != nil {
    log.Fatalf("read CA: %v", err)
}
pool := x509.NewCertPool()
pool.AppendCertsFromPEM(caCert)

creds := credentials.NewTLS(&tls.Config{
    RootCAs:    pool,
    MinVersion: tls.VersionTLS13,
})

conn, err := grpc.NewClient("user-service:9000",
    grpc.WithTransportCredentials(creds))
```

That is server-only TLS. Wire is encrypted, server identity is verified by SAN match against the dial target (`user-service`).

## Mutual TLS — both sides authenticated

The server demands a client cert; the client provides one. Both are verified by the CA.

Server side, two changes:

```go
caCert, _ := os.ReadFile("ca.crt")
caPool := x509.NewCertPool()
caPool.AppendCertsFromPEM(caCert)

creds := credentials.NewTLS(&tls.Config{
    Certificates: []tls.Certificate{cert},
    ClientAuth:   tls.RequireAndVerifyClientCert,  // demand client cert
    ClientCAs:    caPool,                           // verify it against this CA
    MinVersion:   tls.VersionTLS13,
})
```

Client side, two changes:

```go
clientCert, _ := tls.LoadX509KeyPair("client.crt", "client.key")

creds := credentials.NewTLS(&tls.Config{
    Certificates: []tls.Certificate{clientCert},  // present this on connect
    RootCAs:      pool,                            // verify the server with this
    MinVersion:   tls.VersionTLS13,
})
```

That is the whole mTLS setup. Both sides hand each other a cert, both verify against the shared CA, the handshake either succeeds (both authenticated) or fails (no plaintext fallback).

## Reading the peer's identity

In the server, an interceptor pulls the client's cert info:

```go
import "google.golang.org/grpc/peer"

func clientCN(ctx context.Context) string {
    p, ok := peer.FromContext(ctx)
    if !ok {
        return ""
    }
    tlsInfo, ok := p.AuthInfo.(credentials.TLSInfo)
    if !ok {
        return ""
    }
    chain := tlsInfo.State.PeerCertificates
    if len(chain) == 0 {
        return ""
    }
    return chain[0].Subject.CommonName
}
```

Now `clientCN(ctx)` is `"billing-service"`. That is the cryptographically-verified identity of the caller — far stronger than a self-asserted header.

ACL pattern:

```go
func authMTLS(allowed map[string]bool) grpc.UnaryServerInterceptor {
    return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
        cn := clientCN(ctx)
        if !allowed[cn] {
            return nil, status.Errorf(codes.PermissionDenied, "%q not allowed", cn)
        }
        ctx = context.WithValue(ctx, ctxKeyPeer, cn)
        return handler(ctx, req)
    }
}
```

Configure per-method ACLs as a map: which CNs may call `CreateUser`, which may call `DeleteUser`. Auditable, declarative, hard to mis-configure.

## Cert rotation

Certs expire. The chapter-4 ones expire in 365 days; you would rotate well before that. Two strategies:

**1. Stop the world.** Issue new cert, restart the service. Brutal but simple. Acceptable for short outages on internal services.

**2. Hot reload.** Watch the cert file; when it changes, swap the `*tls.Certificate` in memory. Go's `tls.Config.GetCertificate` is the standard hook:

```go
var current atomic.Value // stores *tls.Certificate
// initial load
c, _ := tls.LoadX509KeyPair("server.crt", "server.key")
current.Store(&c)

// fsnotify or a polling loop reloads on file change

creds := credentials.NewTLS(&tls.Config{
    GetCertificate: func(*tls.ClientHelloInfo) (*tls.Certificate, error) {
        return current.Load().(*tls.Certificate), nil
    },
    ClientAuth: tls.RequireAndVerifyClientCert,
    ClientCAs:  caPool,
    MinVersion: tls.VersionTLS13,
})
```

Now writing new `server.crt`/`server.key` and triggering a reload swaps the cert with no restart. Production setups use this with a tool that re-issues certs (smallstep, Vault, cert-manager).

## How long to make certs

Operational tradeoff:

- **Long-lived (1 year):** less work, more risk. A leaked cert is valid for a year.
- **Short-lived (24 hours):** automatic re-issue every day, leak is contained. Needs a working PKI automation.
- **Mediums (7–30 days):** common for internal services. Rotation is muscle memory; leaks are short-lived.

For mTLS at scale, **smallstep CA** is excellent. Open-source ACME-compatible CA you self-host. Issues short-lived certs to services on demand. Or **HashiCorp Vault** with the PKI engine. Either replaces the manual `openssl` ceremony with API-driven issuance.

## SPIFFE — when you need a real identity framework

For larger architectures, **SPIFFE** (and its implementation **SPIRE**) is the standard. Each workload gets a **SPIFFE ID** like `spiffe://example.com/billing` baked into a SAN. Workloads attest their identity to SPIRE (via Kubernetes service account, AWS IAM, etc.) and SPIRE issues short-lived certs.

For self-hosted, SPIRE works with bare-metal nodes via a node attestor (e.g., systemd unit hash). Not lightweight, but right when you have many services and want strong, automated identity.

For the small case (a few services on a VPS), the manual CA + smallstep is plenty.

## TLS performance

Three numbers worth knowing:

- **Handshake:** ~5–20 ms RTT depending on geography, plus key derivation. With HTTP/2 multiplexing (one connection, many streams) the handshake amortizes to nothing.
- **Bulk transfer:** AES-GCM with hardware acceleration (every modern x86/ARM CPU) is ~5 GB/s per core. TLS is rarely the bottleneck.
- **Memory per connection:** a few KB for crypto state. Negligible for hundreds of connections.

The performance worry is misconfigured clients that handshake per call (chapter 3's "one conn per backend" rule). Done correctly, TLS is invisible.

## Plaintext escape hatches

Sometimes you want plaintext for local dev. The pattern:

```go
useTLS := os.Getenv("TLS_DISABLED") != "1"

var creds credentials.TransportCredentials
if useTLS {
    creds = credentials.NewTLS(&tls.Config{...})
} else {
    creds = insecure.NewCredentials()
}
s := grpc.NewServer(grpc.Creds(creds))
```

Default to secure; opt out for local dev. Reverse the default and you ship plaintext to prod by accident.

## TLS-only firewalling

A common production pattern: bind gRPC to a Unix socket or `127.0.0.1` only. nginx (or an ingress controller) terminates TLS facing the public network and reverse-proxies plaintext to the local gRPC. Chapter 10 covers this — gRPC over Unix socket is fast and skips per-handshake TLS work for internal traffic.

## Recap

- Server TLS: encryption + server identity. mTLS: also client identity.
- Mint a small CA with `openssl`. Sign per-service certs with SAN that matches the dial name.
- Server: `Certificates`, `ClientAuth: RequireAndVerifyClientCert`, `ClientCAs`. Client: `Certificates`, `RootCAs`. Both: `MinVersion: TLS13`.
- Read peer identity via `peer.FromContext` → `TLSInfo.State.PeerCertificates[0].Subject.CommonName`.
- Build an ACL interceptor keyed on CN. Cryptographically verified, auditable.
- Rotate via `GetCertificate` hot reload. Automate with smallstep / Vault / SPIRE.
- TLS is fast under HTTP/2 multiplexing — the handshake amortizes across many calls.
- Default to secure; an env-var escape hatch for local dev only.

Next: [Production self-host](/notes/grpc/10-production) — load balancing, observability, and putting it all behind nginx on a VPS.


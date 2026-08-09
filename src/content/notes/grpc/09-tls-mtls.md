---
title: 'TLS ও mTLS'
subtitle: 'Server TLS ওয়্যার এনক্রিপ্ট করে এবং server-এর identity প্রমাণ করে। Mutual TLS ক্লায়েন্টদের জন্য একই প্রমাণ যোগ করে। দুটোই একই handshake-এর উপর চড়ে — আর একবার ছোট একটা CA থাকলে, দুটোই কয়েক লাইনের Go।'
chapter: 9
level: 'advanced'
readingTime: '12 মিনিট'
topics: ['grpc', 'tls', 'mtls', 'certificates', 'security']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ইবনে সিনা একটা হাই-সিকিউরিটি প্রাইভেট মিটিং-এ যাচ্ছেন। বিল্ডিং-এর দরজায় দাঁড়িয়ে তিনি একটু সন্দিহান — ভেতরের অফিসটা কি আসলেই আসল, নাকি কেউ অফিস সেজে বসে আছে? তাই হোস্ট আল-খোয়ারিজমি প্রথমেই নিজের ভেরিফায়েড ID কার্ড বের করে দেখান — সরকারি সিল, ছবি, সব মিলিয়ে প্রমাণ যে এই অফিস আর এই মানুষটাই আসল। ইবনে সিনা নিশ্চিন্ত হয়ে ভেতরে ঢোকেন। এরপর দুজন একটা সাউন্ডপ্রুফ ঘরে বসে কথা বলেন — বাইরের করিডর থেকে কেউ এক শব্দও শুনতে পায় না।

এবার আরও কড়া একটা মিটিং। এখানে গার্ড ফাতিমা আল-ফিহরি শুধু হোস্টের ID দেখেই থামেন না — দরজায় ঢোকার আগে তিনি ইবনে সিনার কাছ থেকেও একটা ভেরিফায়েড ব্যাজ দাবি করেন। অর্থাৎ শুধু ভিজিটর জানবে অফিস আসল তা নয়, অফিসও নিশ্চিত হবে ভিজিটরটা আসলে কে। দুই পক্ষ একে অপরকে পরিচয় প্রমাণ করার পরেই কেবল সাউন্ডপ্রুফ ঘরের দরজা খোলে — একজনও প্রমাণ দিতে না পারলে মিটিং বাতিল, কোনো ছাড় নেই।

গল্পের প্রথম কেসটাই **TLS**: হোস্টের ভেরিফায়েড ID দেখানো হলো server-এর certificate — server নিজের identity ক্লায়েন্টের কাছে প্রমাণ করছে, আর সাউন্ডপ্রুফ ঘর হলো encryption যাতে মাঝপথে কেউ ট্রাফিক পড়তে না পারে। দ্বিতীয় কেসটা **mTLS (mutual TLS)**: ভিজিটরের ভেরিফায়েড ব্যাজ হলো client certificate, তাই এখন client আর server দুই পক্ষই একে অপরের কাছে identity প্রমাণ করে — এটাই mutual authentication। বাস্তবে এই দুই পক্ষের প্রমাণ সবচেয়ে বেশি কাজে লাগে service-to-service যোগাযোগে: bearer token ছাড়াই এক service আরেক service-কে cryptographically চিনতে পারে, আর বড় সিস্টেমে service mesh (যেমন Istio, Linkerd) প্রতিটা service-এর মধ্যে এই mTLS নিজে থেকেই বসিয়ে দেয়।

চ্যাপ্টার ৪-এর server plaintext-এ চলে। `localhost`-এ এটা ঠিক আছে। কিন্তু যেই মুহূর্তে ট্রাফিক কোনো নেটওয়ার্ক বাউন্ডারি পার হয় — এমনকি একটা প্রাইভেট VPC-এর ভেতরেও — তখন আপনি **server TLS** চাইবেন। আর যেই মুহূর্তে আপনি bearer token ছাড়াই ক্লায়েন্টদের authenticate করতে চাইবেন (service-to-service), তখন আপনি **mutual TLS** চাইবেন।

দুটোই একই TLS handshake; mTLS শুধু এর সাথে একটা client certificate যোগ করে। cert-এর plumbing একবার ঠিকঠাক করে নিন, বাকিটা এক-লাইনের config।

এই চ্যাপ্টার ধরে নিচ্ছে যে আপনি path-এর **TLS & Certificates** track পড়েছেন। "ECDHE", "ALPN", "chain of trust" যদি অচেনা লাগে, তাহলে আগে সেই track শেষ করে আসুন।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

mTLS হলো দুইজন মানুষ handshake করার আগে একে অপরকে ID দেখানো — শুধু server নিজেকে client-এর কাছে প্রমাণ করছে তা নয়।

</Callout>

## bearer token-এর বদলে mTLS কেন?

নিজের infrastructure-এর ভেতরে service-to-service identity-র জন্য mTLS আপনাকে দেয়:

- **connection-এর মধ্যেই বেক করা identity।** হারানোর মতো কোনো token নেই, leak হওয়ার মতো কোনো header নেই, refresh করার মতো কোনো expiry নেই। cert নিজেই identity।
- **handshake-এই verified।** প্রতিটা connection দুই পক্ষকেই প্রমাণ করে; bearer token শুধু handler চলার সময় চেক হয়।
- **fine-grained ACL।** প্রতিটা service-এর নিজের cert থাকে; ACL Common Name বা SAN-এর সাথে ম্যাচ করে। audit করা সহজ।
- **কোনো shared secret নেই।** প্রতিটা service-এর একটা private key থাকে যা সে কখনো পাঠায় না; token প্রতিটা request-এ পাঠানো হয়।

খরচ হলো একটা ছোট CA যেটা আপনি চালাবেন। self-hosted setup-এর জন্য এটা কয়েকটা `openssl` command আর একটা script।

## একটা ছোট্ট CA বানানো

আপনার তিনটা জিনিস দরকার: একটা CA cert + key, CA দিয়ে signed একটা server cert, এবং (mTLS-এর জন্য) CA দিয়ে signed একটা client cert।

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

এরপর আপনার হাতে থাকবে:

- `ca.crt`, `ca.key` — CA। `ca.crt` সব জায়গায় বিতরণ করুন; `ca.key` খুব নিরাপদে রাখুন।
- `server.crt`, `server.key` — `user-service`-এর server identity।
- `client.crt`, `client.key` — `billing-service`-এর client identity।

server cert-এর উপর থাকা `subjectAltName` (SAN)-ই হলো সেই অংশ যা Go-র verifier আসলে চেক করে — `user-service`-এ (বা `localhost`, বা `127.0.0.1`-এ) connect করা ক্লায়েন্টরা cert-টা নাম দিয়ে validate পায়। CN informational; SAN-ই authoritative।

<Callout type="warn">

**কখনো `*.key` ফাইল git-এ commit করবেন না।** private key হলো credential। একটা leak হওয়া CA key মানে গোটা trust chain compromised — এটা দিয়ে ইস্যু করা প্রতিটা client আর server cert-ই সন্দেহজনক হয়ে যায়। CA-টা একটা offline-capable workstation-এ, নয়তো একটা dedicated secrets manager দিয়ে চালান।

</Callout>

## Server TLS — একমুখী

server ক্লায়েন্টদের কাছে নিজের identity প্রমাণ করে। ক্লায়েন্টরা CA cert-এর বিপরীতে verify করে। "in transit-এ encrypted, server authenticity guaranteed"-এর জন্য এটুকুই যথেষ্ট।

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

এটাই server-only TLS। ওয়্যার encrypted, dial target (`user-service`)-এর সাথে SAN match করে server identity verified।

## Mutual TLS — দুই পক্ষই authenticated

server একটা client cert দাবি করে; client একটা দেয়। দুটোই CA দিয়ে verify হয়।

server-এর দিকে, দুটো পরিবর্তন:

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

client-এর দিকে, দুটো পরিবর্তন:

```go
clientCert, _ := tls.LoadX509KeyPair("client.crt", "client.key")

creds := credentials.NewTLS(&tls.Config{
    Certificates: []tls.Certificate{clientCert},  // present this on connect
    RootCAs:      pool,                            // verify the server with this
    MinVersion:   tls.VersionTLS13,
})
```

এটাই গোটা mTLS setup। দুই পক্ষ একে অপরকে একটা cert দেয়, দুই পক্ষই shared CA-র বিপরীতে verify করে, handshake হয় সফল হয় (দুই পক্ষই authenticated) নয়তো ব্যর্থ হয় (কোনো plaintext fallback নেই)।

## peer-এর identity পড়া

server-এ একটা interceptor client-এর cert তথ্য টেনে আনে:

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

এখন `clientCN(ctx)` হলো `"billing-service"`। এটাই caller-এর cryptographically-verified identity — একটা self-asserted header-এর চেয়ে অনেক বেশি শক্তিশালী।

ACL প্যাটার্ন:

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

per-method ACL একটা map হিসেবে configure করুন: কোন CN `CreateUser` কল করতে পারবে, কোনটা `DeleteUser` কল করতে পারবে। auditable, declarative, ভুল configure করা কঠিন।

## Cert rotation

cert expire হয়। চ্যাপ্টার ৪-এর গুলো ৩৬৫ দিনে expire হয়; আপনি তার অনেক আগেই rotate করবেন। দুটো strategy:

**1. Stop the world।** নতুন cert ইস্যু করুন, service restart করুন। কড়া কিন্তু সহজ। internal service-এ ছোট outage-এর জন্য গ্রহণযোগ্য।

**2. Hot reload।** cert ফাইল watch করুন; যখন সেটা বদলায়, মেমরিতে `*tls.Certificate` swap করে দিন। Go-র `tls.Config.GetCertificate` হলো standard hook:

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

এখন নতুন `server.crt`/`server.key` লিখে একটা reload trigger করলেই কোনো restart ছাড়া cert swap হয়ে যায়। production setup-গুলো এটা এমন একটা tool-এর সাথে ব্যবহার করে যেটা cert পুনরায় ইস্যু করে (smallstep, Vault, cert-manager)।

## cert কতদিনের বানাবেন

operational tradeoff:

- **Long-lived (1 বছর):** কম কাজ, বেশি ঝুঁকি। একটা leak হওয়া cert এক বছর valid থাকে।
- **Short-lived (24 ঘণ্টা):** প্রতিদিন automatic পুনরায় ইস্যু, leak সীমিত থাকে। একটা কার্যকর PKI automation দরকার।
- **Medium (7–30 দিন):** internal service-এর জন্য সাধারণ। rotation-টা muscle memory হয়ে যায়; leak short-lived হয়।

স্কেলে mTLS-এর জন্য **smallstep CA** চমৎকার। open-source ACME-compatible CA যা আপনি self-host করেন। চাহিদামতো service-গুলোকে short-lived cert ইস্যু করে। অথবা PKI engine সহ **HashiCorp Vault**। যেকোনোটাই manual `openssl` আচার-অনুষ্ঠানকে API-driven issuance দিয়ে বদলে দেয়।

## SPIFFE — যখন আপনার একটা আসল identity framework দরকার

বড় architecture-এর জন্য **SPIFFE** (এবং এর implementation **SPIRE**) হলো standard। প্রতিটা workload একটা **SPIFFE ID** পায় যেমন `spiffe://example.com/billing`, যা একটা SAN-এ বেক করা থাকে। workload-গুলো SPIRE-এর কাছে তাদের identity attest করে (Kubernetes service account, AWS IAM, ইত্যাদির মাধ্যমে) এবং SPIRE short-lived cert ইস্যু করে।

self-hosted-এর জন্য, SPIRE একটা node attestor (যেমন systemd unit hash)-এর মাধ্যমে bare-metal node-এর সাথে কাজ করে। lightweight নয়, কিন্তু যখন আপনার অনেক service থাকে এবং আপনি শক্তিশালী, automated identity চান তখন এটাই ঠিক।

ছোট কেসের জন্য (একটা VPS-এ কয়েকটা service), manual CA + smallstep-ই যথেষ্ট।

## TLS performance

জানার মতো তিনটা সংখ্যা:

- **Handshake:** ভৌগোলিক অবস্থানভেদে ~5–20 ms RTT, সাথে key derivation। HTTP/2 multiplexing (একটা connection, অনেক stream) দিয়ে handshake-টা amortize হয়ে প্রায় শূন্যে নেমে আসে।
- **Bulk transfer:** hardware acceleration সহ AES-GCM (প্রতিটা আধুনিক x86/ARM CPU-তে) প্রতি core-এ ~5 GB/s। TLS খুব কমই bottleneck হয়।
- **প্রতি connection-এ memory:** crypto state-এর জন্য কয়েক KB। শত শত connection-এর জন্য নগণ্য।

performance-এর চিন্তা হলো ভুল-configure করা ক্লায়েন্ট যারা প্রতি call-এ handshake করে (চ্যাপ্টার ৩-এর "প্রতি backend-এ এক conn" নিয়ম)। ঠিকমতো করা হলে, TLS অদৃশ্য।

## Plaintext escape hatch

কখনো কখনো local dev-এর জন্য আপনি plaintext চান। প্যাটার্নটা:

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

ডিফল্ট থাকুক secure; local dev-এর জন্য opt out করুন। ডিফল্টটা উল্টে দিলে আপনি ভুলবশত prod-এ plaintext ship করে ফেলবেন।

## TLS-only firewalling

একটা সাধারণ production প্যাটার্ন: gRPC-কে শুধু একটা Unix socket বা `127.0.0.1`-এ bind করুন। nginx (বা একটা ingress controller) public network-মুখী TLS terminate করে এবং local gRPC-তে plaintext reverse-proxy করে। চ্যাপ্টার ১০ এটা কভার করে — Unix socket-এর উপর gRPC দ্রুত এবং internal traffic-এর জন্য per-handshake TLS-এর কাজ এড়িয়ে যায়।

## Recap

- Server TLS: encryption + server identity। mTLS: client identity-ও।
- `openssl` দিয়ে একটা ছোট CA mint করুন। dial name-এর সাথে match করা SAN দিয়ে per-service cert sign করুন।
- Server: `Certificates`, `ClientAuth: RequireAndVerifyClientCert`, `ClientCAs`। Client: `Certificates`, `RootCAs`। দুই পক্ষ: `MinVersion: TLS13`।
- `peer.FromContext` → `TLSInfo.State.PeerCertificates[0].Subject.CommonName` দিয়ে peer identity পড়ুন।
- CN-এর উপর keyed একটা ACL interceptor বানান। cryptographically verified, auditable।
- `GetCertificate` hot reload দিয়ে rotate করুন। smallstep / Vault / SPIRE দিয়ে automate করুন।
- HTTP/2 multiplexing-এর অধীনে TLS দ্রুত — handshake অনেক call-এ amortize হয়।
- ডিফল্ট থাকুক secure; শুধু local dev-এর জন্য একটা env-var escape hatch।

পরবর্তী: [Production self-host](/notes/grpc/10-production) — load balancing, observability, এবং একটা VPS-এ সবকিছু nginx-এর পেছনে বসানো।

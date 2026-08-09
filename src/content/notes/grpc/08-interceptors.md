---
title: 'Interceptors'
subtitle: 'Interceptor হলো gRPC-র middleware। Cross-cutting concern — auth, logging, tracing, retry, panic recovery — এখানে থাকে, একবার, প্রতিটা RPC-র জন্য। layering ঠিকঠাক করলে আপনার হ্যান্ডলার ছোট থেকে যায়।'
chapter: 8
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['grpc', 'interceptors', 'middleware', 'auth', 'logging']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

একটা gRPC interceptor হলো এমন একটা ফাংশন যা প্রতিটা RPC কলকে wrap করে — সার্ভার-সাইডে হ্যান্ডলার চলার আগে, ক্লায়েন্ট-সাইডে wire send-এর আগে। HTTP middleware-এর (`http.Handler` chain, Express middleware, FastAPI dependency) মতোই ধারণা, তবে একটা কড়া signature আর একটার বদলে চারটা ধরন সহ (server unary, server stream, client unary, client stream)।

এই চ্যাপ্টারে প্রতিটা প্রোডাকশন সার্ভিসের দরকারি প্যাটার্নের জন্য রিয়েল interceptor বানানো হবে: structured logging, panic recovery, authentication, আর একটা unified error mapper। এগুলো পেয়ে গেলে, আপনার হ্যান্ডলার খাঁটি business logic-এ সংকুচিত হয়ে যায়।

<Callout type="info">

**বাস্তব জীবনের উপমা**

Interceptor অনেকটা এয়ারপোর্ট সিকিউরিটির মতো — গন্তব্য যাই হোক প্রতিটা যাত্রী একই চেকপয়েন্ট দিয়ে যায়।

</Callout>

## গল্পে বুঝি

চট্টগ্রাম বন্দরে জাহাজ থেকে যত কন্টেইনার নামে, প্রতিটাকে নিজের নিজের গুদামে যাওয়ার আগে একটা কাস্টমস চেকপয়েন্ট পার হতে হয়। আল-খোয়ারিজমির কাপড়ের কন্টেইনার হোক বা ইবনে সিনার ওষুধের চালান — গুদাম যারই হোক, রাস্তা একটাই: চেকপয়েন্ট। ওখানে বসা অফিসার তিনটা কাজ করে। এক, খাতায় স্ট্যাম্প মেরে লিখে রাখে কোন কন্টেইনার, কখন, কোথা থেকে এল। দুই, আমদানিকারকের লাইসেন্স মিলিয়ে দেখে — লাইসেন্স না থাকলে কন্টেইনার ভেতরেই ঢুকতে দেয় না। তিন, ওজন মেপে রেকর্ডে তুলে রাখে।

মজাটা হলো, এই তিনটা কাজ কোনো গুদামকে আলাদা করে করতে হয় না। গুদামের কাজ শুধু নিজের মাল বুঝে নেওয়া। লগ রাখা, লাইসেন্স যাচাই, ওজন মাপা — এসব একবার, এক জায়গায়, প্রতিটা কন্টেইনারের জন্য অটোমেটিক হয়ে যায়। ফাতিমা আল-ফিহরি নতুন একটা গুদাম খুললেও তাকে নতুন করে লাইসেন্স-চেকিং বসাতে হয় না; কন্টেইনার তার কাছে পৌঁছানোর আগেই সব চেক হয়ে আসে।

এই চেকপয়েন্টটাই আসলে একটা **interceptor** — প্রতিটা RPC-কে wrap করা middleware, যা আসল service method (গুদাম) চলার আগে-পরে বসে থাকে। স্ট্যাম্প-খাতা হলো logging আর metrics interceptor, লাইসেন্স যাচাই হলো auth interceptor, আর কন্টেইনার = একেকটা RPC কল। মূল কথা: "প্রতিটা কল, এক জায়গায়" — cross-cutting কাজগুলো প্রতিটা method-এ ছড়িয়ে না দিয়ে একটা layer-এ তুলে আনা। বাস্তবে gRPC-তে ঠিক এভাবেই `ChainUnaryInterceptor` দিয়ে auth, logging, metrics, recovery বসানো হয় — হ্যান্ডলার তখন খাঁটি business logic নিয়েই থাকে, বাকি সব চেকপয়েন্ট সামলায়।

## চারটা interceptor ধরন

```go
// Server, unary
type UnaryServerInterceptor func(
    ctx context.Context,
    req any,
    info *grpc.UnaryServerInfo,
    handler grpc.UnaryHandler,
) (resp any, err error)

// Server, streaming
type StreamServerInterceptor func(
    srv any,
    ss grpc.ServerStream,
    info *grpc.StreamServerInfo,
    handler grpc.StreamHandler,
) error

// Client, unary
type UnaryClientInterceptor func(
    ctx context.Context,
    method string,
    req, reply any,
    cc *grpc.ClientConn,
    invoker grpc.UnaryInvoker,
    opts ...grpc.CallOption,
) error

// Client, streaming
type StreamClientInterceptor func(
    ctx context.Context,
    desc *grpc.StreamDesc,
    cc *grpc.ClientConn,
    method string,
    streamer grpc.Streamer,
    opts ...grpc.CallOption,
) (grpc.ClientStream, error)
```

প্যাটার্ন: pre-process, chain-এর পরের জিনিসটা কল করো (`handler`/`invoker`/`streamer`), post-process। ঠিক HTTP middleware-এর মতো।

wire-এর দুই পক্ষেই আচরণ দরকার হলে (যেমন একটা trace context propagate করা) আপনি চারটাই লেখেন। বেশিরভাগ concern-এর জন্য, শুধু server unary + server stream জোড়াটা লাগে।

## Server interceptor — structured logging

প্রতিটা RPC, একটা লগ লাইন, machine-readable:

```go
func loggingUnary(logger *slog.Logger) grpc.UnaryServerInterceptor {
    return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
        start := time.Now()
        resp, err := handler(ctx, req)

        code := codes.OK
        if err != nil {
            code = status.Code(err)
        }

        logger.LogAttrs(ctx, slog.LevelInfo, "grpc",
            slog.String("method", info.FullMethod),
            slog.Duration("dur", time.Since(start)),
            slog.String("code", code.String()),
            slog.String("peer", peerAddr(ctx)),
            slog.String("req_id", reqID(ctx)),
        )

        return resp, err
    }
}
```

স্ট্রিমের জন্য, আপনি `ServerStream`-কে wrap করেন মেসেজ গোনার বা স্ট্রিমের lifetime মাপার জন্য — একই শেপ, সামান্য বেশি কোড:

```go
func loggingStream(logger *slog.Logger) grpc.StreamServerInterceptor {
    return func(srv any, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
        start := time.Now()
        err := handler(srv, ss)
        code := codes.OK
        if err != nil {
            code = status.Code(err)
        }
        logger.LogAttrs(ss.Context(), slog.LevelInfo, "grpc-stream",
            slog.String("method", info.FullMethod),
            slog.Duration("dur", time.Since(start)),
            slog.String("code", code.String()),
        )
        return err
    }
}
```

per call একটা লাইন অনেক দূর যায়। Loki + Grafana সহ (path-এর **Observability** track-এ কভার করা), আপনি পান RPS, error rate, p99 latency, per-method breakdown — সবই লগ স্ট্রিম থেকে।

## Recovery — কখনো একটা panic-কে প্রসেস মারতে দেবেন না

যে হ্যান্ডলার panic করে, কোনো recovery ছাড়া, সেটা পুরো প্রসেস crash করে। dev-এ এটা ঠিক আছে। prod-এ, একটা খারাপ রিকোয়েস্ট প্রতিটা concurrent কল নামিয়ে দেয়।

```go
func recoveryUnary(logger *slog.Logger) grpc.UnaryServerInterceptor {
    return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (resp any, err error) {
        defer func() {
            if r := recover(); r != nil {
                stack := debug.Stack()
                logger.ErrorContext(ctx, "panic in handler",
                    slog.String("method", info.FullMethod),
                    slog.Any("panic", r),
                    slog.String("stack", string(stack)),
                )
                err = status.Errorf(codes.Internal, "internal server error")
            }
        }()
        return handler(ctx, req)
    }
}
```

Recover করে, stack সহ লগ করে, ক্লায়েন্টকে একটা `INTERNAL` error রিটার্ন করে। প্রসেস serve করতেই থাকে। এটা **সবচেয়ে বাইরে** চালান যাতে এটা অন্য প্রতিটা interceptor-এর panic-ও ধরে।

কমিউনিটি লাইব্রেরি `go-grpc-middleware/v2/interceptors/recovery` এটা যুক্তিসঙ্গত ডিফল্ট সহ দেয়। নিজে বানানোর বদলে এটা ব্যবহার করুন।

## Auth interceptor

metadata থেকে bearer টোকেন টানে, verify করে, হ্যান্ডলারদের পড়ার জন্য user identity context-এ attach করে।

```go
type ctxKey int

const ctxKeyUser ctxKey = 0

type User struct {
    ID    string
    Roles []string
}

func authUnary(verify func(token string) (*User, error)) grpc.UnaryServerInterceptor {
    return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
        if isPublic(info.FullMethod) {
            return handler(ctx, req)
        }

        md, _ := metadata.FromIncomingContext(ctx)
        auth := md.Get("authorization")
        if len(auth) == 0 {
            return nil, status.Error(codes.Unauthenticated, "missing token")
        }
        if !strings.HasPrefix(auth[0], "Bearer ") {
            return nil, status.Error(codes.Unauthenticated, "invalid auth scheme")
        }

        user, err := verify(strings.TrimPrefix(auth[0], "Bearer "))
        if err != nil {
            return nil, status.Error(codes.Unauthenticated, "invalid token")
        }

        ctx = context.WithValue(ctx, ctxKeyUser, user)
        return handler(ctx, req)
    }
}

func UserFromCtx(ctx context.Context) *User {
    u, _ := ctx.Value(ctxKeyUser).(*User)
    return u
}
```

এবার যেকোনো হ্যান্ডলার `UserFromCtx(ctx)` পড়ে verified identity পায়, বা কল public allow-list-এ থাকলে `nil`।

`isPublic(method)` চেক হলো GraphQL-এর `@auth` directive-এর সমতুল্য — auth লাগে না এমন method-এর একটা লিস্ট দিয়ে gate করুন (`Login`, `HealthCheck` ইত্যাদি)। Default-deny সবচেয়ে নিরাপদ।

streaming version-এর জন্য, `ServerStream`-কে wrap করুন যাতে user স্ট্রিমের context-এ attach হয়। `go-grpc-middleware` এর জন্য `WrappedServerStream` দেয়; সেটা ছাড়া, আপনাকে নিজেই একটা ছোট wrapper লিখতে হবে।

<Callout type="warn">

**Auth অবশ্যই সবচেয়ে বাইরের interceptor-গুলোর একটা হবে।** logging যদি auth-এর আগে চলে, খারাপ টোকেনওয়ালা প্রতিটা probe তখনও info level-এ লগ হয় — ঠিক আছে, যতক্ষণ না আপনি আপনার লগ পাইপলাইন DDoS করেন। অর্ডার: recovery → logging → auth → metrics → handler।

</Callout>

## Interceptor compose করা

framework `grpc.ChainUnaryInterceptor` (আর stream সমতুল্য) দিয়ে chaining সাপোর্ট করে:

```go
s := grpc.NewServer(
    grpc.ChainUnaryInterceptor(
        recoveryUnary(logger),
        loggingUnary(logger),
        authUnary(verifyJWT),
        metricsUnary(),
    ),
    grpc.ChainStreamInterceptor(
        recoveryStream(logger),
        loggingStream(logger),
        authStream(verifyJWT),
    ),
)
```

অর্ডার গুরুত্বপূর্ণ। প্রথমটা সবচেয়ে বাইরে চলে: এটা যেকোনো পরবর্তী interceptor-এর আগে কলটা দেখে আর তারা সবাই return করার পর। Recovery প্রথম যাতে এটা প্রতিটা লেয়ারের panic ধরে। Logging দ্বিতীয় যাতে এটা auth ফেইলিওরও লগ করে। Auth তৃতীয় যাতে এটা কাজ gate করে। Metrics শেষে যাতে এটা শুধু auth যে কাজ ঢুকতে দিল তা-ই গোনে।

## Client interceptor — automatic auth + tracing

বেশিরভাগ client interceptor দুটোর একটা করে: outgoing কলে metadata attach করে, বা custom retry/timeout logic বানায়।

প্রতিটা কলে একটা টোকেন attach করুন:

```go
func authedClient(token string) grpc.UnaryClientInterceptor {
    return func(ctx context.Context, method string, req, reply any, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
        ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+token)
        return invoker(ctx, method, req, reply, cc, opts...)
    }
}

conn, _ := grpc.NewClient(addr,
    grpc.WithTransportCredentials(creds),
    grpc.WithUnaryInterceptor(authedClient(token)),
)
```

এবার এই ক্লায়েন্ট থেকে প্রতিটা কল authenticated। কোনো per-call boilerplate নেই।

যেসব টোকেন rotate করে (OAuth client credential), তার জন্য `grpc.PerRPCCredentials` ব্যবহার করুন — framework per call একটা `GetRequestMetadata` মেথড কল করে, তাই refresh logic এক জায়গায় থাকে।

## Tracing — OpenTelemetry এক লাইনে

OpenTelemetry-র official gRPC interceptor আছে। `otelgrpc` সহ:

```go
import "go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"

s := grpc.NewServer(
    grpc.StatsHandler(otelgrpc.NewServerHandler()),
    // ... your interceptors
)

conn, _ := grpc.NewClient(addr,
    grpc.WithStatsHandler(otelgrpc.NewClientHandler()),
)
```

এটুকুই। প্রতিটা span ধরা পড়ে। সার্ভিস জুড়ে trace context metadata দিয়ে propagate হয়। Tempo/Jaeger/Honeycomb-এ পাঠান — একটা backend বেছে নিন, এটা এমনিতেই কাজ করে।

`StatsHandler` interceptor-এর চেয়ে সামান্য আলাদা একটা mechanism — এটা আরও সমৃদ্ধ event পায় (per-message-send, per-stream-end)। tracing-এর জন্য আপনি এটা চান; interceptor explicit logic-এর জন্য।

## Metrics — per RPC Prometheus

`go-grpc-middleware/v2/interceptors/promprovider` (বা পুরনো `grpc-ecosystem/go-grpc-prometheus`) Prometheus metric যোগ করে:

```go
metrics := promprovider.ServerMetrics(promprovider.WithServerHandlingTimeHistogram())
s := grpc.NewServer(
    grpc.ChainUnaryInterceptor(metrics.UnaryServerInterceptor()),
    grpc.ChainStreamInterceptor(metrics.StreamServerInterceptor()),
)
```

আপনি পান `grpc_server_handled_total{method, code}` (count), `grpc_server_handling_seconds_bucket{method}` (histogram)। ক্লায়েন্ট সাইডেও একই। একটা `/metrics` endpoint-এ wire করুন আর Prometheus সেটা scrape করে।

চারটা golden signal — RPS, error rate, latency, saturation — সবই এখানে ফ্রি-তে।

## Validation interceptor

আপনি `protoc-gen-validate` (বা `protovalidate-go`) ব্যবহার করলে, `.proto`-তে রুল লিখতে পারেন:

```proto
import "buf/validate/validate.proto";

message CreateUserRequest {
  string name  = 1 [(buf.validate.field).string.min_len = 1];
  string email = 2 [(buf.validate.field).string.email   = true];
}
```

একটা validation interceptor প্রতিটা রিকোয়েস্টে রুলগুলো চালায়:

```go
import "github.com/bufbuild/protovalidate-go"

func validateUnary(v *protovalidate.Validator) grpc.UnaryServerInterceptor {
    return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
        if msg, ok := req.(proto.Message); ok {
            if err := v.Validate(msg); err != nil {
                return nil, status.Error(codes.InvalidArgument, err.Error())
            }
        }
        return handler(ctx, req)
    }
}
```

Validation proto-তে, enforcement interceptor-এ। হ্যান্ডলার শুধু valid input দেখে।

## Error mapping interceptor

কখনো কখনো আপনি চান আপনার হ্যান্ডলার থেকে প্রতিটা error একটা normalizer দিয়ে যাক — internal sentinel error (`ErrNotFound`, `ErrConflict`)-কে gRPC স্ট্যাটাস কোডে রূপান্তর করুক, আর raw DB error লুকিয়ে দিক।

```go
func mapErrorsUnary() grpc.UnaryServerInterceptor {
    return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
        resp, err := handler(ctx, req)
        if err == nil {
            return resp, nil
        }

        if _, ok := status.FromError(err); ok {
            return nil, err // already mapped
        }

        switch {
        case errors.Is(err, sql.ErrNoRows):
            return nil, status.Error(codes.NotFound, "not found")
        case errors.Is(err, ErrConflict):
            return nil, status.Error(codes.AlreadyExists, "already exists")
        default:
            log.Error("unhandled handler error", "err", err)
            return nil, status.Error(codes.Internal, "internal server error")
        }
    }
}
```

হ্যান্ডলার `return ErrNotFound` করতে পারে আর wire দেখবে `codes.NotFound`। ক্লায়েন্টের কাছে `pq: duplicate key value violates unique constraint "users_email_key"` ফাঁস হবে না।

## কমন interceptor ফাঁদ

**১. হ্যান্ডলার কল করতে ভুলে যাওয়া।** একটা বাগি interceptor `handler` কল না করেই `nil, nil` (বা কোনো ডিফল্ট) রিটার্ন করে। RPC নীরবে zero value রিটার্ন করে। যেকোনো interceptor যোগ করার পর একটা smoke test চালান।

**২. ctx propagate না করা।** আপনি একটা নতুন context বানিয়ে নিচে পাস করলে, deadline হারান। ডেটা যোগ করতে `context.WithValue(ctx, ...)` ব্যবহার করুন; কখনো একটা fresh context বসাবেন না।

**৩. Stream interceptor `ss.Context()` wrap না করা।** আপনি context mutate করলে (auth, request ID), `ServerStream`-কে wrap করতে হবে যাতে হ্যান্ডলার থেকে `stream.Context()` আপনার modified context রিটার্ন করে। `go-grpc-middleware`-এর `WrappedServerStream` ব্যবহার করুন।

**৪. interceptor-এ ভারী কাজ।** যে logging interceptor synchronously একটা SaaS-এ POST করে সেটা এখন প্রতিটা RPC-র path-এ। interceptor logic দ্রুত আর async রাখুন (লগের জন্য buffered channel, async sink)।

## interceptor বনাম হ্যান্ডলারে কী যায়

একটা কাজের টেস্ট: **প্রতিটা RPC-র এটা লাগলে, এটা একটা interceptor।** Auth, logging, metrics, recovery, tracing, validation — হ্যাঁ। Business logic, DB write, domain rule — না।

একটা পরিষ্কার হ্যান্ডলার context পড়ে, একটা service-layer ফাংশন কল করে, return করে। interceptor-রা এর চারপাশের সবকিছু করে।

## রিক্যাপ

- চারটা interceptor ধরন: server unary/stream, client unary/stream।
- অর্ডার: recovery → logging → auth → metrics → handler। সবচেয়ে বাইরেরটা প্রথম।
- `grpc.ChainUnaryInterceptor` আর stream সমতুল্যটা ব্যবহার করুন।
- Standard concern: logging, recovery, auth, tracing (`otelgrpc`), metrics (`promprovider`), validation (`protovalidate`), error mapping।
- context mutate করার সময় স্ট্রিমকে `WrappedServerStream` দিয়ে wrap করুন।
- Client interceptor: auth, retry, custom timeout।
- হ্যান্ডলার ছোট হওয়া উচিত: ctx পড়ো, domain কল করো, return করো। Cross-cutting জিনিস interceptor-এ যায়।

পরবর্তী: [TLS and mTLS](/notes/grpc/09-tls-mtls) — encryption, identity, আর peer authentication।

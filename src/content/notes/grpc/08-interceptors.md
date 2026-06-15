---
title: "Interceptors"
subtitle: "Interceptors are gRPC's middleware. Cross-cutting concerns — auth, logging, tracing, retries, panic recovery — live here, once, for every RPC. Get the layering right and your handlers stay tiny."
chapter: 8
level: "intermediate"
readingTime: "13 min"
topics: ["grpc", "interceptors", "middleware", "auth", "logging"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A gRPC interceptor is a function that wraps every RPC call — server-side before the handler runs, client-side before the wire send. Same idea as HTTP middleware (`http.Handler` chains, Express middleware, FastAPI dependencies), with a stricter signature and four flavors instead of one (server unary, server stream, client unary, client stream).

This chapter wires real interceptors for the patterns every production service needs: structured logging, panic recovery, authentication, and a unified error mapper. Once you have them, your handlers shrink to pure business logic.

<Callout type="info">

**Real-World Analogy**

Interceptors are like airport security — every passenger goes through the same checkpoint regardless of their destination.

</Callout>

## The four interceptor flavors

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

Pattern: pre-process, call the next thing in the chain (`handler`/`invoker`/`streamer`), post-process. Just like HTTP middleware.

You write all four when you need behavior on both sides of the wire (e.g., propagating a trace context). For most concerns, you only need the server unary + server stream pair.

## Server interceptor — structured logging

Every RPC, one log line, machine-readable:

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

For streams, you wrap the `ServerStream` to count messages or measure stream lifetime — same shape, slightly more code:

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

A line per call goes a long way. With Loki + Grafana (covered in the path's **Observability** track), you get RPS, error rate, p99 latency, per-method breakdowns — all from the log stream.

## Recovery — never let a panic kill the process

A handler that panics, with no recovery, crashes the entire process. That is fine in dev. In prod, one bad request takes down every concurrent call.

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

Recovers, logs with stack, returns an `INTERNAL` error to the client. The process keeps serving. Run this **outermost** so it catches panics from every other interceptor too.

The community library `go-grpc-middleware/v2/interceptors/recovery` ships this with sensible defaults. Use it instead of rolling your own.

## Auth interceptor

Pulls the bearer token from metadata, verifies it, attaches the user identity to context for handlers to read.

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

Now any handler reads `UserFromCtx(ctx)` and gets the verified identity, or `nil` if the call was on the public allow-list.

The `isPublic(method)` check is the equivalent of GraphQL's `@auth` directive — gate with a list of methods that don't require auth (`Login`, `HealthCheck`, etc.). Default-deny is safest.

For the streaming version, wrap the `ServerStream` to attach user to the stream's context. `go-grpc-middleware` provides `WrappedServerStream` for this; without it, you have to write a small wrapper yourself.

<Callout type="warn">

**Auth must be one of the outermost interceptors.** If logging runs before auth, every probe with a bad token still logs at info level — fine, until you DDoS your log pipeline. Order: recovery → logging → auth → metrics → handler.

</Callout>

## Composing interceptors

The framework supports chaining via `grpc.ChainUnaryInterceptor` (and the stream equivalent):

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

Order matters. The first one runs outermost: it sees the call before any subsequent interceptor and after they all return. Recovery first so it catches panics from every layer. Logging second so it logs even auth failures. Auth third so it gates work. Metrics last so they only count work the auth let through.

## Client interceptors — automatic auth + tracing

Most client interceptors do one of two things: attach metadata to outgoing calls, or implement custom retry/timeout logic.

Attach a token to every call:

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

Now every call from this client is authenticated. No per-call boilerplate.

For tokens that rotate (OAuth client credentials), use `grpc.PerRPCCredentials` instead — the framework calls a `GetRequestMetadata` method per call, so refresh logic lives in one place.

## Tracing — OpenTelemetry as a one-liner

OpenTelemetry has official gRPC interceptors. With `otelgrpc`:

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

That is it. Every span is captured. Trace context is propagated via metadata across services. Send to Tempo/Jaeger/Honeycomb — pick a backend, it just works.

`StatsHandler` is a slightly different mechanism than interceptors — it gets richer events (per-message-send, per-stream-end). For tracing you want it; interceptors are for explicit logic.

## Metrics — Prometheus per RPC

`go-grpc-middleware/v2/interceptors/promprovider` (or the older `grpc-ecosystem/go-grpc-prometheus`) adds Prometheus metrics:

```go
metrics := promprovider.ServerMetrics(promprovider.WithServerHandlingTimeHistogram())
s := grpc.NewServer(
    grpc.ChainUnaryInterceptor(metrics.UnaryServerInterceptor()),
    grpc.ChainStreamInterceptor(metrics.StreamServerInterceptor()),
)
```

You get `grpc_server_handled_total{method, code}` (counts), `grpc_server_handling_seconds_bucket{method}` (histogram). Same on the client side. Wire to a `/metrics` endpoint and Prometheus scrapes it.

The four golden signals — RPS, error rate, latency, saturation — are all here for free.

## Validation interceptor

If you use `protoc-gen-validate` (or `protovalidate-go`), you can write rules in the `.proto`:

```proto
import "buf/validate/validate.proto";

message CreateUserRequest {
  string name  = 1 [(buf.validate.field).string.min_len = 1];
  string email = 2 [(buf.validate.field).string.email   = true];
}
```

A validation interceptor runs the rules on every request:

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

Validation in the proto, enforcement in the interceptor. Handlers see only valid input.

## Error mapping interceptor

Sometimes you want every error from your handlers to go through a normalizer — convert internal sentinel errors (`ErrNotFound`, `ErrConflict`) to gRPC status codes, and hide raw DB errors.

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

Handlers can `return ErrNotFound` and the wire will see `codes.NotFound`. No leak of `pq: duplicate key value violates unique constraint "users_email_key"` to the client.

## Common interceptor pitfalls

**1. Forgetting to call the handler.** A buggy interceptor returns `nil, nil` (or some default) without calling `handler`. RPCs return zero values silently. Run a smoke test after adding any interceptor.

**2. Not propagating ctx.** If you create a new context and pass it down, you lose the deadline. Use `context.WithValue(ctx, ...)` to add data; never substitute a fresh context.

**3. Stream interceptors not wrapping `ss.Context()`.** When you mutate context (auth, request ID), you need to wrap the `ServerStream` so that `stream.Context()` from the handler returns your modified context. Use `WrappedServerStream` from `go-grpc-middleware`.

**4. Heavy work in interceptors.** A logging interceptor that synchronously POSTs to a SaaS is now in every RPC's path. Keep interceptor logic fast and async (buffered channels for logs, async sinks).

## What goes in interceptors vs handlers

A useful test: **if every RPC needs this, it is an interceptor.** Auth, logging, metrics, recovery, tracing, validation — yes. Business logic, DB writes, domain rules — no.

A clean handler reads context, calls a service-layer function, returns. The interceptors do everything around that.

## Recap

- Four interceptor flavors: server unary/stream, client unary/stream.
- Order: recovery → logging → auth → metrics → handler. Outermost first.
- Use `grpc.ChainUnaryInterceptor` and the stream equivalent.
- Standard concerns: logging, recovery, auth, tracing (`otelgrpc`), metrics (`promprovider`), validation (`protovalidate`), error mapping.
- Wrap streams with `WrappedServerStream` when mutating context.
- Client interceptors: auth, retries, custom timeouts.
- Handlers should be tiny: read ctx, call domain, return. Cross-cutting goes in interceptors.

Next: [TLS and mTLS](/notes/grpc/09-tls-mtls) — encryption, identity, and peer authentication.


---
title: "Errors, deadlines, metadata"
subtitle: "Status codes are a fixed set, deadlines flow with context, metadata rides every call. The three together turn a working gRPC service into one that's debuggable and survivable."
chapter: 7
level: "intermediate"
readingTime: "12 min"
topics: ["grpc", "errors", "deadlines", "metadata", "status codes"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A gRPC call carries three things you cannot avoid thinking about: a **status** (the result code), a **deadline** (when the call expires), and **metadata** (headers and trailers). Each has a strict shape and clear semantics. Get them right and your service is observable, recoverable, and well-behaved across teams.

<Callout type="info">

**Real-World Analogy**

Errors and deadlines in gRPC are like a restaurant kitchen with a ticket expiry — if the food isn't ready before the customer leaves, discard the order rather than delivering cold food to an empty table.

</Callout>

## Status codes — the fixed set

gRPC has 17 status codes. Memorize the common ones; do not invent new ones.

| Code | Use for |
|---|---|
| `OK` | success (the only one with no error) |
| `CANCELLED` | client cancelled the call (rarely returned by the server) |
| `INVALID_ARGUMENT` | request shape is wrong; not an auth or state issue |
| `DEADLINE_EXCEEDED` | call took too long |
| `NOT_FOUND` | resource missing |
| `ALREADY_EXISTS` | tried to create something that exists |
| `PERMISSION_DENIED` | authorized but not allowed |
| `UNAUTHENTICATED` | authentication is missing or invalid |
| `RESOURCE_EXHAUSTED` | rate limit, quota, no capacity |
| `FAILED_PRECONDITION` | wrong system state for this op |
| `ABORTED` | concurrency conflict, retryable after fixing state |
| `OUT_OF_RANGE` | argument outside an allowed range (rare) |
| `UNIMPLEMENTED` | RPC not implemented |
| `INTERNAL` | broken invariant on the server |
| `UNAVAILABLE` | transient failure, retryable |
| `DATA_LOSS` | unrecoverable data corruption |

Two pairs to never confuse:

- **`UNAUTHENTICATED` vs `PERMISSION_DENIED`** — authentication failed (no/bad credentials) vs authorization failed (you are who you say, but you cannot do this). Mixing them up leaks information to attackers.
- **`FAILED_PRECONDITION` vs `ABORTED`** — wrong state, retry after you fix it (precondition) vs wrong state, retry as-is once contention clears (aborted). The retry semantics differ.

## Returning errors in Go

`status` is the canonical wrapper:

```go
import (
    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/status"
)

return nil, status.Error(codes.NotFound, "user not found")
return nil, status.Errorf(codes.InvalidArgument, "id must be positive, got %d", req.GetId())
```

A plain `return nil, errors.New("oops")` becomes `codes.Unknown` on the wire — the client cannot tell anything useful. **Always wrap with `status`**.

## Reading errors on the client

```go
resp, err := client.GetUser(ctx, req)
if err != nil {
    st, ok := status.FromError(err)
    if !ok {
        // not a gRPC error — likely a transport / unknown error
        return err
    }
    switch st.Code() {
    case codes.NotFound:
        return ErrUserNotFound
    case codes.Unavailable, codes.DeadlineExceeded:
        return ErrTransient // retry me
    case codes.PermissionDenied, codes.Unauthenticated:
        return ErrAuth
    default:
        return fmt.Errorf("grpc: %s: %s", st.Code(), st.Message())
    }
}
```

The `switch` on `st.Code()` is the bread and butter of gRPC client code. Branch on it; do not parse error messages.

## Rich error details

Sometimes a status code plus a message is not enough — you want machine-readable details (validation field paths, retry hints). gRPC supports it via `status.WithDetails`:

```go
import "google.golang.org/genproto/googleapis/rpc/errdetails"

st := status.New(codes.InvalidArgument, "validation failed")
st, _ = st.WithDetails(&errdetails.BadRequest{
    FieldViolations: []*errdetails.BadRequest_FieldViolation{
        {Field: "email", Description: "must be a valid email"},
        {Field: "age",   Description: "must be positive"},
    },
})
return nil, st.Err()
```

The client reads them:

```go
if st, ok := status.FromError(err); ok {
    for _, d := range st.Details() {
        switch info := d.(type) {
        case *errdetails.BadRequest:
            for _, v := range info.GetFieldViolations() {
                log.Printf("field error: %s: %s", v.Field, v.Description)
            }
        case *errdetails.RetryInfo:
            // server says: retry after this delay
        }
    }
}
```

The well-known error details in `google.rpc.errdetails` cover most needs: `BadRequest`, `RetryInfo`, `QuotaFailure`, `PreconditionFailure`, `ResourceInfo`, `Help`. Use them — they are typed, language-neutral, and supported everywhere.

## Deadlines — the most important client habit

Every RPC needs a deadline. **Every one.** A call without a deadline is a request that can hang forever.

```go
ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
defer cancel()

resp, err := client.GetUser(ctx, &pb.GetUserRequest{Id: 1})
```

200 ms means: if the call has not returned in 200 ms, the framework cancels it, the server's context fires, the call ends with `DEADLINE_EXCEEDED`. Your code never blocks longer than 200 ms.

The pattern: **deadlines descend, never ascend**. A handler that takes an inbound RPC and calls a downstream RPC must pass the inbound `ctx` (or a tighter derived deadline) to the downstream call:

```go
func (s *Server) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
    // pass ctx, NOT context.Background()
    profile, err := s.profileClient.GetProfile(ctx, &profilepb.Req{Id: req.GetId()})
    ...
}
```

If the inbound caller had 100 ms left and the downstream takes 110 ms, the downstream is canceled at 100 ms — exactly right. If you used `Background()`, the downstream keeps running after the original caller gave up. Wasted work and harder bugs.

<Callout type="warn">

**A handler that ignores `ctx` is a bug.** Long-running work in handlers must select on `ctx.Done()`. DB queries should accept `ctx`. Loops should poll `ctx.Done()`. If you skip this, deadlines do not work — clients give up but the server keeps grinding.

</Callout>

## Deadline budgets across services

A frontend gets a request with a 1-second budget. It calls service A (target 200 ms), then B (target 300 ms), then C. The naive code passes 1 second to all three. If A is slow, B and C inherit a tight budget anyway — no problem. But if B is slow, you may have time left for C, but A already burned half the budget.

The safe pattern: set per-service tight deadlines based on what each is supposed to do, but never exceed the inbound deadline. `context.WithTimeout(ctx, smaller)` returns a context with the *smaller* of the existing deadline and the new one. Always pass through.

Some teams encode budgets in metadata:

```
grpc-budget-ms: 1000
```

Each service subtracts its expected work from the budget and forwards the rest. Heavy machinery, used in big graphs of services. For a small architecture, derive per-service deadlines and let `context.WithTimeout` enforce them.

## Metadata — the headers and trailers

Metadata is gRPC's name for HTTP/2 headers (sent at the start of a call) and trailers (sent at the end). It carries auth tokens, trace IDs, custom hints — anything not in the request body.

Outgoing on the client:

```go
md := metadata.New(map[string]string{
    "authorization": "Bearer " + token,
    "x-request-id":  uuid.NewString(),
})
ctx = metadata.NewOutgoingContext(ctx, md)

resp, err := client.GetUser(ctx, req)
```

Incoming on the server:

```go
func (s *Server) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
    md, _ := metadata.FromIncomingContext(ctx)
    auth := md.Get("authorization") // []string
    reqID := md.Get("x-request-id")
    ...
}
```

To send response headers/trailers from the server:

```go
func (s *Server) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
    grpc.SendHeader(ctx, metadata.Pairs("x-server-version", "1.4.2"))
    // ... do work ...
    grpc.SetTrailer(ctx, metadata.Pairs("x-rows-read", "1"))
    return resp, nil
}
```

Headers go on the wire before the response data; trailers after. Most production traffic uses headers for trace context (`traceparent`, `tracestate`) and auth, trailers rarely.

## Reserved metadata keys

A handful of keys are reserved by the framework and you must not set them yourself:

- `grpc-*` — framework keys (`grpc-status`, `grpc-message`, `grpc-encoding`, `grpc-timeout`).
- `:path`, `:method`, `:status` — HTTP/2 pseudo-headers.
- `content-type` — set by the framework to `application/grpc`.

Lowercase by convention. Binary metadata uses keys ending in `-bin` and is base64-encoded on the wire:

```go
md := metadata.New(map[string]string{
    "x-binary-payload-bin": string(rawBytes),
})
```

This is the way to ship raw bytes that should not be UTF-8 escaped (e.g., a binary trace context).

## Retry policies — declarative

gRPC supports declarative retries via service config. The client config:

```json
{
  "methodConfig": [{
    "name": [{"service": "user.v1.UserService"}],
    "retryPolicy": {
      "maxAttempts": 4,
      "initialBackoff": "0.1s",
      "maxBackoff": "1s",
      "backoffMultiplier": 2,
      "retryableStatusCodes": ["UNAVAILABLE", "DEADLINE_EXCEEDED"]
    }
  }]
}
```

Hand it to the client:

```go
conn, _ := grpc.NewClient(addr,
    grpc.WithTransportCredentials(creds),
    grpc.WithDefaultServiceConfig(serviceConfigJSON),
)
```

Retries respect the deadline — if the deadline expires, no more attempts. The framework also respects "don't retry mutating ops" semantics indirectly: only retry idempotent RPCs, or your `CreatePost` ends up creating two posts on a flaky network.

A safer pattern: use **idempotency keys** (chapter 7 of the GraphQL track has the same pattern) for non-idempotent mutations and let retry policy handle the rest.

## Cancellation paths

Five ways a call can end:

1. **OK + response** — happy path.
2. **Server returns error** — status code, optional details.
3. **Client cancels** — `cancel()` or context done. Server sees `Canceled`.
4. **Deadline exceeded** — framework cancels, both sides see `DeadlineExceeded`.
5. **Network died** — eventually surfaces as `Unavailable` or transport error.

Test all five paths in load tests. The "happy path works, errors are nightmares" gRPC service has not done this.

## What to log

For every call, on the server:

```
grpc method=user.v1.UserService/GetUser dur=12ms code=OK peer=10.0.0.5 user=42 req_id=a1b2
```

The fields:

- **method** — full RPC name. Prometheus-friendly label.
- **dur** — wall time of the handler.
- **code** — gRPC status code.
- **peer** — caller IP.
- **user** — your auth identity (from interceptor; chapter 8).
- **req_id** — request ID metadata (forwarded from client).

This is one line per call. Aggregate it and you have RPS, error rate, p99 latency per method, and per-caller breakdown — the four numbers you need to operate the service.

## Recap

- 17 status codes, fixed set. Use them; do not invent new ones.
- Always wrap errors with `status.Error` or `status.Errorf`. Plain errors lose the code.
- `status.WithDetails` for machine-readable error details (validation, retry hints).
- Every RPC has a deadline. Pass the inbound `ctx` to downstream calls — never `Background()`.
- Handlers must select on `ctx.Done()` for long work; ignore it and deadlines do not enforce.
- Metadata = HTTP/2 headers and trailers. Auth, trace context, request IDs ride here.
- `grpc-*` and `:method`/`:path` are reserved. `-bin` suffix means base64-encoded binary.
- Retries are declarative via service config. Use them only on idempotent calls or with idempotency keys.
- Log every call: method, duration, code, peer, identity, request ID.

Next: [Interceptors](/notes/grpc/08-interceptors) — the middleware pattern for auth, logging, retries, and recovery.


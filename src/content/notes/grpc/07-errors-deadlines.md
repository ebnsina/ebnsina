---
title: 'Errors, deadlines, metadata'
subtitle: 'স্ট্যাটাস কোড একটা নির্দিষ্ট সেট, deadline context-এর সাথে বয়ে চলে, metadata প্রতিটা কলে সওয়ার হয়। তিনটা একসাথে একটা কাজ-করা gRPC সার্ভিসকে debuggable আর survivable বানিয়ে দেয়।'
chapter: 7
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['grpc', 'errors', 'deadlines', 'metadata', 'status codes']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

একটা gRPC কল তিনটা জিনিস বহন করে যা নিয়ে না ভেবে আপনার উপায় নেই: একটা **status** (রেজাল্ট কোড), একটা **deadline** (কল কখন expire করবে), আর **metadata** (হেডার আর trailer)। প্রতিটার একটা কড়া শেপ আর স্পষ্ট semantics আছে। এগুলো ঠিকঠাক করলে আপনার সার্ভিস observable, recoverable, আর টিম জুড়ে ভালো আচরণের হয়।

<Callout type="info">

**বাস্তব জীবনের উপমা**

gRPC-তে error আর deadline অনেকটা টিকেট-এক্সপায়ারিওয়ালা একটা রেস্টুরেন্ট রান্নাঘরের মতো — কাস্টমার চলে যাওয়ার আগে খাবার তৈরি না হলে, ফাঁকা টেবিলে ঠান্ডা খাবার দেওয়ার চেয়ে অর্ডারটা বাদ দিন।

</Callout>

## গল্পে বুঝি

সিনা একটা কুরিয়ার অফিসে গিয়ে একটা পার্সেল পাঠাতে দিলেন — সাথে তিনটে কড়া নির্দেশ। এক, স্লিপে বড় করে লেখা: "আজ বিকেল ৫টার মধ্যে হাতে না পৌঁছালে আর চেষ্টা কোরো না, আমাকে জানিয়ে দাও।" পার্সেলটা এক শহর থেকে আরেক শহরে যাবে, মাঝে কয়েকটা হাব বদলাবে — কিন্তু প্রতিটা লেগেই ওই একই ৫টার সময়সীমা মানতে হবে। শেষ হাব যদি দেখে হাতে আছে আর দশ মিনিট অথচ ডেলিভারিতে লাগবে আধঘণ্টা, সে যেন তখনই থেমে যায়, অযথা ছুটে সময় নষ্ট না করে।

দুই, ব্যর্থ হলে সিনা চান একটা স্পষ্ট স্ট্যাম্প-মারা স্লিপ — "প্রত্যাখ্যাত: ঠিকানা ভুল" নাকি "পথে হারিয়ে গেছে" নাকি "প্রাপক নেই", ঠিকঠাক কারণসহ; শুধু "হয়নি" বললে তো তিনি বুঝবেনই না পরে কী করবেন। আর তিন, পার্সেলের গায়ে একটা ছোট চিরকুট সেঁটে দিলেন — তাতে প্রেরকের নাম খোয়ারিজমি, একটা রেফারেন্স কোড আর হ্যান্ডলিং হিন্ট। এই চিরকুট পার্সেলের ভেতরের জিনিসের অংশ নয়, কিন্তু গোটা পথ ধরে পার্সেলের সাথেই সওয়ার হয়ে চলে, যাতে যে হাবই ধরুক সে প্রেরক আর রেফারেন্স চিনে নিতে পারে।

এই গল্পটাই আসলে একটা gRPC কল। ৫টার-মধ্যে-নয়তো-থেমে-যাও নিয়মটা হলো **deadline**, আর সেটা যে প্রতিটা লেগে একই থাকে — মাঝপথের হাব নিজের বলে নতুন সময় দেয় না — সেটাই deadline **প্রপাগেট** হওয়া (inbound `ctx` নিচের কলে পাস করা, `Background()` নয়)। স্ট্যাম্প-মারা কারণ-স্লিপটা হলো টাইপড **status code** — `DEADLINE_EXCEEDED`, `NOT_FOUND`, `PERMISSION_DENIED` — যা "ঠিক কী ঘটেছে" জানায়, ভাসা-ভাসা "failed" নয়। আর গায়ে সাঁটা চিরকুটটা হলো **metadata** — auth token, request ID, trace context — মূল payload-এর বাইরের তথ্য যা প্রতিটা কলের সাথে হেডার হয়ে বয়ে চলে। বাস্তবেও ঠিক এভাবেই একটা ভালো সার্ভিস timeout-এ আটকে না থেকে হাল ছাড়ে, ক্লায়েন্টকে সঠিক কোড দিয়ে বলে কী করতে হবে, আর পরিচয়-তথ্য payload নোংরা না করে আলাদা চ্যানেলে পাঠায়।

## স্ট্যাটাস কোড — নির্দিষ্ট সেট

gRPC-তে ১৭টা স্ট্যাটাস কোড আছে। কমনগুলো মুখস্থ রাখুন; নতুন বানাবেন না।

| Code                  | Use for                                                   |
| --------------------- | --------------------------------------------------------- |
| `OK`                  | success (the only one with no error)                      |
| `CANCELLED`           | client cancelled the call (rarely returned by the server) |
| `INVALID_ARGUMENT`    | request shape is wrong; not an auth or state issue        |
| `DEADLINE_EXCEEDED`   | call took too long                                        |
| `NOT_FOUND`           | resource missing                                          |
| `ALREADY_EXISTS`      | tried to create something that exists                     |
| `PERMISSION_DENIED`   | authorized but not allowed                                |
| `UNAUTHENTICATED`     | authentication is missing or invalid                      |
| `RESOURCE_EXHAUSTED`  | rate limit, quota, no capacity                            |
| `FAILED_PRECONDITION` | wrong system state for this op                            |
| `ABORTED`             | concurrency conflict, retryable after fixing state        |
| `OUT_OF_RANGE`        | argument outside an allowed range (rare)                  |
| `UNIMPLEMENTED`       | RPC not implemented                                       |
| `INTERNAL`            | broken invariant on the server                            |
| `UNAVAILABLE`         | transient failure, retryable                              |
| `DATA_LOSS`           | unrecoverable data corruption                             |

দুই জোড়া কখনো গুলিয়ে ফেলবেন না:

- **`UNAUTHENTICATED` বনাম `PERMISSION_DENIED`** — authentication ফেল (কোনো/খারাপ credential) বনাম authorization ফেল (আপনি যা বলছেন তা-ই, কিন্তু এটা করতে পারবেন না)। এদের গুলিয়ে ফেললে attacker-দের কাছে তথ্য ফাঁস হয়।
- **`FAILED_PRECONDITION` বনাম `ABORTED`** — ভুল state, ঠিক করে তারপর retry (precondition) বনাম ভুল state, contention কেটে গেলে যেমন আছে তেমনই retry (aborted)। retry semantics আলাদা।

## Go-তে error রিটার্ন করা

`status` হলো canonical wrapper:

```go
import (
    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/status"
)

return nil, status.Error(codes.NotFound, "user not found")
return nil, status.Errorf(codes.InvalidArgument, "id must be positive, got %d", req.GetId())
```

একটা সাদামাটা `return nil, errors.New("oops")` wire-এ `codes.Unknown` হয়ে যায় — ক্লায়েন্ট কাজের কিছুই বলতে পারে না। **সবসময় `status` দিয়ে wrap করুন**।

## ক্লায়েন্টে error পড়া

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

`st.Code()`-এর উপর `switch` হলো gRPC ক্লায়েন্ট কোডের রুটিরুজি। এটার উপর branch করুন; error মেসেজ parse করবেন না।

## Rich error details

কখনো কখনো একটা স্ট্যাটাস কোড আর একটা মেসেজ যথেষ্ট নয় — আপনি machine-readable details চান (validation ফিল্ড path, retry hint)। gRPC এটা `status.WithDetails` দিয়ে সাপোর্ট করে:

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

ক্লায়েন্ট সেগুলো পড়ে:

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

`google.rpc.errdetails`-এর well-known error details বেশিরভাগ দরকার সামলায়: `BadRequest`, `RetryInfo`, `QuotaFailure`, `PreconditionFailure`, `ResourceInfo`, `Help`। এগুলো ব্যবহার করুন — এরা typed, language-neutral, আর সব জায়গায় সাপোর্টেড।

## Deadline — সবচেয়ে গুরুত্বপূর্ণ ক্লায়েন্ট অভ্যাস

প্রতিটা RPC-র একটা deadline দরকার। **প্রতিটার।** deadline ছাড়া একটা কল হলো এমন একটা রিকোয়েস্ট যা চিরকাল hang করে থাকতে পারে।

```go
ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
defer cancel()

resp, err := client.GetUser(ctx, &pb.GetUserRequest{Id: 1})
```

200 ms মানে: কল যদি 200 ms-এ return না করে, framework সেটা cancel করে, সার্ভারের context fire করে, কল `DEADLINE_EXCEEDED` দিয়ে শেষ হয়। আপনার কোড কখনো 200 ms-এর বেশি ব্লক থাকে না।

প্যাটার্ন: **deadline নিচে নামে, উপরে ওঠে না**। যে হ্যান্ডলার একটা inbound RPC নেয় আর একটা downstream RPC কল করে, তাকে inbound `ctx` (বা একটা টাইট derived deadline) ওই downstream কলে পাস করতে হবে:

```go
func (s *Server) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
    // pass ctx, NOT context.Background()
    profile, err := s.profileClient.GetProfile(ctx, &profilepb.Req{Id: req.GetId()})
    ...
}
```

inbound caller-এর হাতে যদি 100 ms বাকি থাকে আর downstream-এ 110 ms লাগে, downstream 100 ms-এ cancel হয়ে যায় — একদম ঠিক। আপনি `Background()` ব্যবহার করলে, মূল caller হাল ছেড়ে দেওয়ার পরও downstream চলতেই থাকে। অপচয়ী কাজ আর কঠিন বাগ।

<Callout type="warn">

**যে হ্যান্ডলার `ctx` উপেক্ষা করে সেটা একটা বাগ।** হ্যান্ডলারে দীর্ঘ কাজ অবশ্যই `ctx.Done()`-এর উপর select করবে। DB কোয়েরি `ctx` গ্রহণ করা উচিত। লুপ `ctx.Done()` poll করা উচিত। এটা এড়িয়ে গেলে deadline কাজ করে না — ক্লায়েন্ট হাল ছাড়ে কিন্তু সার্ভার ঘষতেই থাকে।

</Callout>

## সার্ভিস জুড়ে deadline budget

একটা frontend একটা রিকোয়েস্ট পায় ১ সেকেন্ডের budget সহ। এটা service A (target 200 ms) কল করে, তারপর B (target 300 ms), তারপর C। naive কোড তিনটার সবাইকে ১ সেকেন্ড পাস করে। A স্লো হলে, B আর C যাই হোক একটা টাইট budget পায় — কোনো সমস্যা নেই। কিন্তু B স্লো হলে, C-র জন্য সময় বাকি থাকতে পারে, কিন্তু A ইতিমধ্যে budget-এর অর্ধেক পুড়িয়ে ফেলেছে।

নিরাপদ প্যাটার্ন: প্রতিটা সার্ভিস কী করার কথা তার ভিত্তিতে per-service টাইট deadline সেট করুন, কিন্তু কখনো inbound deadline ছাড়িয়ে যাবেন না। `context.WithTimeout(ctx, smaller)` বিদ্যমান deadline আর নতুনটার মধ্যে _ছোটটা_ দিয়ে একটা context রিটার্ন করে। সবসময় পাস-থ্রু করুন।

কিছু টিম budget metadata-তে encode করে:

```
grpc-budget-ms: 1000
```

প্রতিটা সার্ভিস budget থেকে নিজের প্রত্যাশিত কাজ বাদ দিয়ে বাকিটা forward করে। ভারী যন্ত্রপাতি, সার্ভিসের বড় গ্রাফে ব্যবহৃত। ছোট architecture-এর জন্য, per-service deadline derive করুন আর `context.WithTimeout`-কে সেগুলো enforce করতে দিন।

## Metadata — হেডার আর trailer

Metadata হলো HTTP/2 হেডার (কলের শুরুতে পাঠানো) আর trailer (শেষে পাঠানো)-এর জন্য gRPC-র নাম। এটা auth টোকেন, trace ID, custom hint বহন করে — রিকোয়েস্ট বডিতে নেই এমন যেকোনো কিছু।

ক্লায়েন্টে outgoing:

```go
md := metadata.New(map[string]string{
    "authorization": "Bearer " + token,
    "x-request-id":  uuid.NewString(),
})
ctx = metadata.NewOutgoingContext(ctx, md)

resp, err := client.GetUser(ctx, req)
```

সার্ভারে incoming:

```go
func (s *Server) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
    md, _ := metadata.FromIncomingContext(ctx)
    auth := md.Get("authorization") // []string
    reqID := md.Get("x-request-id")
    ...
}
```

সার্ভার থেকে রেসপন্স হেডার/trailer পাঠাতে:

```go
func (s *Server) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
    grpc.SendHeader(ctx, metadata.Pairs("x-server-version", "1.4.2"))
    // ... do work ...
    grpc.SetTrailer(ctx, metadata.Pairs("x-rows-read", "1"))
    return resp, nil
}
```

হেডার wire-এ যায় রেসপন্স ডেটার আগে; trailer পরে। বেশিরভাগ প্রোডাকশন ট্রাফিক trace context (`traceparent`, `tracestate`) আর auth-এর জন্য হেডার ব্যবহার করে, trailer কদাচিৎ।

## Reserved metadata key

হাতেগোনা কিছু key framework দ্বারা reserved আর আপনি নিজে সেগুলো সেট করবেন না:

- `grpc-*` — framework key (`grpc-status`, `grpc-message`, `grpc-encoding`, `grpc-timeout`)।
- `:path`, `:method`, `:status` — HTTP/2 pseudo-header।
- `content-type` — framework দ্বারা `application/grpc`-এ সেট।

কনভেনশন অনুযায়ী lowercase। Binary metadata `-bin`-এ শেষ হওয়া key ব্যবহার করে আর wire-এ base64-encoded থাকে:

```go
md := metadata.New(map[string]string{
    "x-binary-payload-bin": string(rawBytes),
})
```

UTF-8 escape হওয়া উচিত নয় এমন raw বাইট (যেমন একটা binary trace context) পাঠানোর এটাই উপায়।

## Retry policy — declarative

gRPC service config দিয়ে declarative retry সাপোর্ট করে। ক্লায়েন্ট config:

```json
{
	"methodConfig": [
		{
			"name": [{ "service": "user.v1.UserService" }],
			"retryPolicy": {
				"maxAttempts": 4,
				"initialBackoff": "0.1s",
				"maxBackoff": "1s",
				"backoffMultiplier": 2,
				"retryableStatusCodes": ["UNAVAILABLE", "DEADLINE_EXCEEDED"]
			}
		}
	]
}
```

এটা ক্লায়েন্টকে দিন:

```go
conn, _ := grpc.NewClient(addr,
    grpc.WithTransportCredentials(creds),
    grpc.WithDefaultServiceConfig(serviceConfigJSON),
)
```

Retry deadline মেনে চলে — deadline expire করলে, আর কোনো attempt নয়। framework "mutating op retry করো না" semantics-ও পরোক্ষভাবে মানে: শুধু idempotent RPC retry করুন, নাহলে flaky নেটওয়ার্কে আপনার `CreatePost` দুটো post বানিয়ে ফেলবে।

একটা নিরাপদ প্যাটার্ন: non-idempotent mutation-এর জন্য **idempotency key** ব্যবহার করুন (GraphQL track-এর চ্যাপ্টার ৭-এ একই প্যাটার্ন আছে) আর বাকিটা retry policy-কে সামলাতে দিন।

## Cancellation path

একটা কল পাঁচভাবে শেষ হতে পারে:

1. **OK + response** — happy path।
2. **সার্ভার error রিটার্ন করে** — স্ট্যাটাস কোড, ঐচ্ছিক details।
3. **ক্লায়েন্ট cancel করে** — `cancel()` বা context done। সার্ভার `Canceled` দেখে।
4. **Deadline exceeded** — framework cancel করে, দুই পক্ষই `DeadlineExceeded` দেখে।
5. **নেটওয়ার্ক মরে গেছে** — একসময় `Unavailable` বা transport error হিসেবে দেখা দেয়।

load test-এ পাঁচটা path-ই টেস্ট করুন। "happy path কাজ করে, error দুঃস্বপ্ন" — এমন gRPC সার্ভিস এটা করেনি।

## কী লগ করবেন

প্রতিটা কলের জন্য, সার্ভারে:

```
grpc method=user.v1.UserService/GetUser dur=12ms code=OK peer=10.0.0.5 user=42 req_id=a1b2
```

ফিল্ডগুলো:

- **method** — পুরো RPC নাম। Prometheus-friendly label।
- **dur** — হ্যান্ডলারের wall time।
- **code** — gRPC স্ট্যাটাস কোড।
- **peer** — caller IP।
- **user** — আপনার auth identity (interceptor থেকে; চ্যাপ্টার ৮)।
- **req_id** — request ID metadata (ক্লায়েন্ট থেকে forward করা)।

এটা per call একটা লাইন। এটা aggregate করুন আর আপনি পাবেন RPS, error rate, per method p99 latency, আর per-caller breakdown — সার্ভিস চালাতে যে চারটা সংখ্যা দরকার।

## রিক্যাপ

- ১৭টা স্ট্যাটাস কোড, নির্দিষ্ট সেট। এগুলো ব্যবহার করুন; নতুন বানাবেন না।
- সবসময় error-কে `status.Error` বা `status.Errorf` দিয়ে wrap করুন। সাদামাটা error কোড হারায়।
- machine-readable error details-এর (validation, retry hint) জন্য `status.WithDetails`।
- প্রতিটা RPC-র একটা deadline আছে। inbound `ctx` downstream কলে পাস করুন — কখনো `Background()` নয়।
- দীর্ঘ কাজের জন্য হ্যান্ডলার অবশ্যই `ctx.Done()`-এর উপর select করবে; উপেক্ষা করলে deadline enforce হয় না।
- Metadata = HTTP/2 হেডার আর trailer। Auth, trace context, request ID এখানে সওয়ার হয়।
- `grpc-*` আর `:method`/`:path` reserved। `-bin` suffix মানে base64-encoded binary।
- Retry service config দিয়ে declarative। শুধু idempotent কলে বা idempotency key সহ ব্যবহার করুন।
- প্রতিটা কল লগ করুন: method, duration, code, peer, identity, request ID।

পরবর্তী: [Interceptors](/notes/grpc/08-interceptors) — auth, logging, retry, আর recovery-র জন্য middleware প্যাটার্ন।

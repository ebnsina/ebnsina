---
title: 'আপনার প্রথম server আর client'
subtitle: 'এক অধ্যায়ে end-to-end Go gRPC — proto, codegen, server, client, reflection, grpcurl। শেষে আপনার হাতে একটা সত্যিকারের binary থাকবে যা আপনি deploy করতে পারবেন।'
chapter: 4
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['grpc', 'go', 'protoc', 'codegen', 'reflection']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

থিওরি অফ। কোড অন।

এই অধ্যায় একটা চালু gRPC service ship করে। সত্যিকারের Go binary, সত্যিকারের protoc invocation, `localhost`-এ সত্যিকারের client-server roundtrip। শেষে আপনি এটাকে `grpcurl` করতে পারবেন আর response পড়তে পারবেন।

<Callout type="info">

**বাস্তব জীবনের উপমা**

আপনার প্রথম gRPC server সেট আপ করা একটা ফোন প্লাগ-ইন করার মতো — hardware তো আছেই, আপনাকে শুধু তারগুলো ঠিকভাবে জুড়তে হবে।

</Callout>

## গল্পে বুঝি

ফাতিমা আল-ফিহরির রেস্তোরাঁয় রান্নাঘর আর ওয়েটার স্টেশনের মাঝখানে একটা দেয়াল। শুরুতে দুই পক্ষ বসে একটা কাগজে ঠিক করল — কোন কোন পদ অর্ডার করা যাবে, প্রতিটা পদের জন্য কী কী জানাতে হবে (টেবিল নম্বর, পরিমাণ), আর জবাবে কী ফেরত আসবে (কোন প্লেট, কী গার্নিশ)। এই লিখিত চুক্তিটাই সব — এর বাইরের কিছু চলবে না। এরপর আল-খোয়ারিজমি নামের ছুতোর সেই কাগজ ধরে দুই দেয়ালে দুটো মিলে-যাওয়া অর্ডার জানালা কেটে বসাল: রান্নাঘরের দিকেরটা অর্ডার নেওয়ার জন্য, ওয়েটারের দিকেরটা অর্ডার পাঠানোর জন্য — একই মাপ, একই খোপ।

জানালা তো বসল, কিন্তু জানালার পেছনে কেউ না থাকলে তো কিছু রান্না হবে না। তাই রান্নাঘরের লোকজন জানালায় দাঁড়িয়ে প্রতিটা অর্ডার সত্যিই কেটেকুটে রান্না করে প্লেট সাজিয়ে দেয়। ফলে ইবনে সিনা যখন ওয়েটার স্টেশন থেকে জানালায় ঝুঁকে "টেবিল তিন, দুটো কাবাব" বলে হাঁক দেয়, কিছুক্ষণ পর সাজানো প্লেট হাতে চলে আসে — যেন রান্নাঘরটা তার পাশেই দাঁড়িয়ে, অথচ সে দেয়ালের ওপারে কী হচ্ছে কিছুই জানে না।

এই গল্পটাই আসলে **প্রথম gRPC server আর client বানানো**। লিখিত মেনু-চুক্তিটা হলো `.proto`-এর **service definition** — কোন কোন method আছে আর প্রতিটার request/response কেমন। ছুতোরের দুই দেয়ালে মিলে-যাওয়া জানালা কেটে বসানোটা হলো **code generation** — একই `.proto` থেকে `protoc` server আর client দুই দিকের কোড বের করে দেয়। রান্নাঘরের লোক জানালায় দাঁড়িয়ে সত্যিই রান্না করাটা হলো **server-এ method implementation** (আমাদের `GetUser`, `CreateUser`)। আর ইবনে সিনার হাঁক দিয়ে প্লেট পাওয়াটা হলো **client-এর remote method call** — `client.GetUser(...)` লেখাটা দেখতে সাধারণ Go function কলের মতো, অথচ ভেতরে দেয়ালের ওপারে অন্য process-এ কাজটা হচ্ছে। বাস্তবেও ঠিক এভাবেই microservice-গুলো একে অন্যের সঙ্গে কথা বলে — আগে `.proto` চুক্তি, তারপর দুই পাশের generated stub, তারপর remote call যেন local।

## যা যা লাগবে

- Go 1.22+ — `go version`।
- `protoc` — `apt install protobuf-compiler` (Debian/Ubuntu), `brew install protobuf` (Mac)। `protoc --version` ≥ 25 যাচাই করুন।
- protoc-এর Go plugin-গুলো:

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
```

নিশ্চিত করুন `$(go env GOPATH)/bin` আপনার `$PATH`-এ আছে। `which protoc-gen-go` দিয়ে টেস্ট করুন।

- `grpcurl` — `brew install grpcurl` (Mac) বা `go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest`।

## প্রজেক্ট layout

```
mygrpc/
├── go.mod
├── proto/
│   └── user/v1/user.proto
├── gen/
│   └── user/v1/         (generated)
├── cmd/
│   ├── server/main.go
│   └── client/main.go
└── internal/
    └── userserver/server.go
```

```bash
mkdir -p mygrpc/proto/user/v1 mygrpc/cmd/server mygrpc/cmd/client mygrpc/internal/userserver
cd mygrpc
go mod init example.com/mygrpc
go get google.golang.org/grpc
go get google.golang.org/protobuf
```

## proto ফাইলটা

```proto
// proto/user/v1/user.proto
syntax = "proto3";

package user.v1;

option go_package = "example.com/mygrpc/gen/user/v1;userv1";

service UserService {
  rpc GetUser    (GetUserRequest)    returns (User);
  rpc CreateUser (CreateUserRequest) returns (User);
  rpc ListUsers  (ListUsersRequest)  returns (ListUsersResponse);
}

message User {
  int64  id    = 1;
  string name  = 2;
  string email = 3;
}

message GetUserRequest    { int64 id = 1; }
message CreateUserRequest { string name = 1; string email = 2; }
message ListUsersRequest  { int32 limit = 1; }
message ListUsersResponse { repeated User users = 1; }
```

## Go কোড generate করা

প্রজেক্ট root থেকে:

```bash
protoc \
  -I proto \
  --go_out=gen --go_opt=paths=source_relative \
  --go-grpc_out=gen --go-grpc_opt=paths=source_relative \
  proto/user/v1/user.proto
```

এটা `gen/user/v1/user.pb.go` (message type-গুলো) আর `gen/user/v1/user_grpc.pb.go` (service interface-গুলো) বের করে।

আপনি এটা প্রায়ই চালাবেন। একটা `Makefile`-এ মুড়ে রাখুন:

```makefile
.PHONY: gen
gen:
	protoc -I proto \
	  --go_out=gen --go_opt=paths=source_relative \
	  --go-grpc_out=gen --go-grpc_opt=paths=source_relative \
	  proto/user/v1/user.proto
```

তারপর যখনই আপনি `.proto` ধরবেন, `make gen`।

<Callout type="tip">

**সত্যিকারের প্রজেক্টের জন্য raw protoc-এর বদলে `buf` ব্যবহার করুন।** এটা দ্রুততর, lint করে, আর breaking change ধরে ফেলে। অধ্যায় 2-এ এটা পরিচয় করানো হয়েছে। raw `protoc` invocation-টা এখানে আছে যাতে আপনি দেখতে পান আসলে কী ঘটছে — `buf` হলো সুবিধার wrapper।

</Callout>

## Server implementation

```go
// internal/userserver/server.go
package userserver

import (
    "context"
    "sync"

    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/status"

    pb "example.com/mygrpc/gen/user/v1"
)

type Server struct {
    pb.UnimplementedUserServiceServer

    mu    sync.RWMutex
    users map[int64]*pb.User
    next  int64
}

func New() *Server {
    return &Server{
        users: map[int64]*pb.User{
            1: {Id: 1, Name: "Sumayya",  Email: "sumayya@example.com"},
            2: {Id: 2, Name: "Aisha", Email: "aisha@example.com"},
        },
        next: 3,
    }
}

func (s *Server) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
    s.mu.RLock()
    defer s.mu.RUnlock()

    u, ok := s.users[req.GetId()]
    if !ok {
        return nil, status.Errorf(codes.NotFound, "user %d not found", req.GetId())
    }
    return u, nil
}

func (s *Server) CreateUser(ctx context.Context, req *pb.CreateUserRequest) (*pb.User, error) {
    if req.GetName() == "" {
        return nil, status.Error(codes.InvalidArgument, "name is required")
    }
    s.mu.Lock()
    defer s.mu.Unlock()

    u := &pb.User{Id: s.next, Name: req.GetName(), Email: req.GetEmail()}
    s.users[s.next] = u
    s.next++
    return u, nil
}

func (s *Server) ListUsers(ctx context.Context, req *pb.ListUsersRequest) (*pb.ListUsersResponse, error) {
    s.mu.RLock()
    defer s.mu.RUnlock()

    out := make([]*pb.User, 0, len(s.users))
    for _, u := range s.users {
        out = append(out, u)
    }
    return &pb.ListUsersResponse{Users: out}, nil
}
```

দুটো জিনিস উল্লেখ করার মতো।

**1. `pb.UnimplementedUserServiceServer`।** প্রতিটা service definition একটা embeddable struct পায় যেটা প্রতিটা method-এর জন্য "not implemented" return করে। এটা embed করুন। যখন আপনি নতুন RPC সহ একটা `.proto` থেকে regenerate করবেন, আপনার কোড তখনও compile হবে — পুরনো কোড নতুন method-গুলোর জন্য "not implemented" return করবে যতক্ষণ না আপনি সেগুলো implement করছেন। embed না করলে প্রতিটা regen build ভেঙে দেয়।

**2. `status.Error(codes.NotFound, ...)`।** একটা plain Go error return করলে কাজ হয় কিন্তু gRPC status code হারিয়ে যায়। wrapper-টা code-টা যুক্ত করে দেয় যাতে client সেটার ওপর branch করতে পারে। পুরো status code map অধ্যায় 7-এ আছে।

## Server entrypoint

```go
// cmd/server/main.go
package main

import (
    "log"
    "net"

    "google.golang.org/grpc"
    "google.golang.org/grpc/reflection"

    pb "example.com/mygrpc/gen/user/v1"
    "example.com/mygrpc/internal/userserver"
)

func main() {
    lis, err := net.Listen("tcp", ":9000")
    if err != nil {
        log.Fatalf("listen: %v", err)
    }

    s := grpc.NewServer()
    pb.RegisterUserServiceServer(s, userserver.New())

    // server reflection lets grpcurl discover services without a .proto
    reflection.Register(s)

    log.Println("grpc serving on :9000")
    if err := s.Serve(lis); err != nil {
        log.Fatalf("serve: %v", err)
    }
}
```

```bash
go run ./cmd/server
# grpc serving on :9000
```

## grpcurl দিয়ে এর সঙ্গে কথা বলা

আরেকটা terminal-এ:

```bash
grpcurl -plaintext localhost:9000 list
# user.v1.UserService
# grpc.reflection.v1.ServerReflection

grpcurl -plaintext localhost:9000 list user.v1.UserService
# user.v1.UserService.CreateUser
# user.v1.UserService.GetUser
# user.v1.UserService.ListUsers

grpcurl -plaintext -d '{"id": 1}' localhost:9000 user.v1.UserService/GetUser
# {
#   "id": "1",
#   "name": "Sumayya",
#   "email": "sumayya@example.com"
# }

grpcurl -plaintext -d '{"name": "Ruqayya", "email": "ruqayya@example.com"}' \
  localhost:9000 user.v1.UserService/CreateUser
# { "id": "3", "name": "Ruqayya", "email": "ruqayya@example.com" }
```

`-plaintext` flag-টা এই কারণে যে আমরা এখনও TLS চালাচ্ছি না (অধ্যায় 9)। discovery কাজ করল কারণ main-এ `reflection.Register(s)` কল করা হয়েছিল।

## একটা সত্যিকারের client

```go
// cmd/client/main.go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials/insecure"

    pb "example.com/mygrpc/gen/user/v1"
)

func main() {
    conn, err := grpc.NewClient("localhost:9000",
        grpc.WithTransportCredentials(insecure.NewCredentials()))
    if err != nil {
        log.Fatalf("dial: %v", err)
    }
    defer conn.Close()

    client := pb.NewUserServiceClient(conn)

    ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
    defer cancel()

    u, err := client.GetUser(ctx, &pb.GetUserRequest{Id: 1})
    if err != nil {
        log.Fatalf("GetUser: %v", err)
    }
    fmt.Printf("got user: %s <%s>\n", u.GetName(), u.GetEmail())

    new, err := client.CreateUser(ctx, &pb.CreateUserRequest{
        Name:  "Sufyan",
        Email: "sufyan@example.com",
    })
    if err != nil {
        log.Fatalf("CreateUser: %v", err)
    }
    fmt.Printf("created user id=%d\n", new.GetId())

    list, err := client.ListUsers(ctx, &pb.ListUsersRequest{})
    if err != nil {
        log.Fatalf("ListUsers: %v", err)
    }
    fmt.Printf("listed %d users\n", len(list.GetUsers()))
}
```

```bash
go run ./cmd/client
# got user: Sumayya <sumayya@example.com>
# created user id=3
# listed 3 users
```

এটাই end-to-end gRPC। একটা `.proto` contract সংজ্ঞায়িত করল, `protoc` Go কোড generate করল, server interface-টা implement করল, client এমন method কল করল যেগুলো সাধারণ Go-এর মতো দেখায়।

## `*Server`-এর আকৃতি আর কেন এটা generated

`pb.NewUserServiceClient(conn)` proto থেকে generate হওয়া একটা struct return করে। এর method-গুলো wire কলকে মুড়ে রাখে। প্রতিটা method `(ctx, request, ...grpc.CallOption)` নেয় আর `(response, error)` return করে। ওই signature-টা প্রতিটা ভাষায় প্রতিটা gRPC client-এর API surface।

`pb.RegisterUserServiceServer(s, impl)` আপনার `*Server`-কে (যেটা generated interface satisfy করে) gRPC server-এর dispatch table-এ যুক্ত করে। নতুন `.proto` method → regen → interface নতুন method পায় → আপনার `UnimplementedUserServiceServer` embed সেগুলোকে `not implemented` দিয়ে satisfy করে যতক্ষণ না আপনি ঠিকভাবে implement করছেন।

এটাই ছন্দ: `.proto` edit করুন → `make gen` → method implementation লিখুন বা আপডেট করুন → rebuild।

## Reflection — dev-এ বন্ধু, prod-এ প্রায়ই বন্ধ

`reflection.Register(s)` একটা বিশেষ service প্রকাশ করে যা client-দের runtime-এ schema আবিষ্কার করতে দেয়। development-এর জন্য সুবিধাজনক; প্রোডাকশনে যুক্তিসঙ্গতভাবে তথ্য ফাঁস করে।

একটা সাধারণ প্যাটার্ন: এটাকে একটা env var-এর পেছনে gate করুন।

```go
if os.Getenv("ENABLE_REFLECTION") == "1" {
    reflection.Register(s)
}
```

অথবা কেবল internal service-এর জন্য enable করুন। যেসব public service-এ proto-ও প্রকাশিত, সেগুলোতে এটা চালু রাখুন — লুকানোর কিছু নেই।

## Connection reuse — সবচেয়ে গুরুত্বপূর্ণ client অভ্যাস

`pb.NewUserServiceClient(conn)` সস্তা। `grpc.NewClient(...)` খরচবহুল (এটা TCP/TLS/HTTP/2 connection সেট আপ করে)। ভুলটা হলো প্রতি কলে একটা নতুন `conn` বানানো:

```go
// WRONG — defeats multiplexing, makes a new TCP+TLS handshake every call
func GetUser(id int64) (*pb.User, error) {
    conn, _ := grpc.NewClient(...)
    defer conn.Close()
    return pb.NewUserServiceClient(conn).GetUser(...)
}
```

connection-টা app scope-এ ধরে রাখুন:

```go
var userClient pb.UserServiceClient

func init() {
    conn, _ := grpc.NewClient(...)
    userClient = pb.NewUserServiceClient(conn)
}
```

প্রতি backend-এ একটা conn, process-এর আয়ুষ্কালজুড়ে। concurrency multiplexing সামলায় (অধ্যায় 3)।

## একটা static binary বানানো

Node বা Python-এর মতো নয়, Go একটা single static binary ship করে:

```bash
CGO_ENABLED=0 go build -o bin/server ./cmd/server
ldd bin/server  # not a dynamic executable
```

`bin/server` একটা VPS-এ কপি করুন, একটা systemd unit লিখুন, হয়ে গেল। install করার মতো কোনো runtime নেই।

## রিক্যাপ

- প্রজেক্ট layout: `.proto`-এর জন্য `proto/`, generated কোডের জন্য `gen/`, binary-র জন্য `cmd/`, impl-এর জন্য `internal/`।
- `protoc-gen-go` আর `protoc-gen-go-grpc` `*.pb.go` আর `*_grpc.pb.go` বের করে।
- আপনার impl-এ `pb.UnimplementedXxxServer` embed করুন যাতে regen compile না ভাঙে।
- error-গুলো `status.Error(codes.X, msg)` হিসেবে return করুন যাতে client ঠিকঠাক status code দেখে।
- `reflection.Register(s)` `grpcurl list` আর dynamic dispatch enable করে।
- প্রতি backend-এ একটা `grpc.NewClient`, process-এর আয়ুষ্কালজুড়ে। connection reuse করুন।
- `CGO_ENABLED=0 go build` দিয়ে একটা static binary বানায়।

পরবর্তী: [Polyglot — Node আর Python client](/notes/grpc/05-polyglot) — একই `.proto`, তিন ভাষা, সবাই একই server-এর সঙ্গে কথা বলছে।

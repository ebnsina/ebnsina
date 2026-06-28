---
title: 'Your first server and client'
subtitle: 'End-to-end Go gRPC in one chapter — proto, codegen, server, client, reflection, grpcurl. By the end you have a real binary you could deploy.'
chapter: 4
level: 'beginner'
readingTime: '12 min'
topics: ['grpc', 'go', 'protoc', 'codegen', 'reflection']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Theory off. Code on.

This chapter ships a working gRPC service. Real Go binary, real protoc invocation, real client-server roundtrip on `localhost`. By the end you can `grpcurl` it and read the response.

<Callout type="info">

**Real-World Analogy**

Setting up your first gRPC server is like plugging in a phone — the hardware is there, you just need to connect the wires correctly.

</Callout>

## What you need

- Go 1.22+ — `go version`.
- `protoc` — `apt install protobuf-compiler` (Debian/Ubuntu), `brew install protobuf` (Mac). Verify `protoc --version` ≥ 25.
- The Go plugins for protoc:

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
```

Make sure `$(go env GOPATH)/bin` is in `$PATH`. Test with `which protoc-gen-go`.

- `grpcurl` — `brew install grpcurl` (Mac) or `go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest`.

## The project layout

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

## The proto

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

## Generating the Go code

From the project root:

```bash
protoc \
  -I proto \
  --go_out=gen --go_opt=paths=source_relative \
  --go-grpc_out=gen --go-grpc_opt=paths=source_relative \
  proto/user/v1/user.proto
```

This emits `gen/user/v1/user.pb.go` (the message types) and `gen/user/v1/user_grpc.pb.go` (the service interfaces).

You will run this often. Wrap it in a `Makefile`:

```makefile
.PHONY: gen
gen:
	protoc -I proto \
	  --go_out=gen --go_opt=paths=source_relative \
	  --go-grpc_out=gen --go-grpc_opt=paths=source_relative \
	  proto/user/v1/user.proto
```

Then `make gen` whenever you touch the `.proto`.

<Callout type="tip">

**For real projects, use `buf` instead of raw protoc.** It is faster, lints, and detects breaking changes. Chapter 2 introduced it. The raw `protoc` invocation is here so you see what is actually happening — `buf` is the convenience wrapper.

</Callout>

## The server implementation

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

Two things worth flagging.

**1. `pb.UnimplementedUserServiceServer`.** Every service definition gets an embeddable struct that returns "not implemented" for every method. Embed it. When you regenerate from a `.proto` with new RPCs, your code still compiles — old code returns "not implemented" for new methods until you implement them. Without embedding, every regen breaks the build.

**2. `status.Error(codes.NotFound, ...)`.** Returning a plain Go error works but loses the gRPC status code. The wrapper attaches the code so clients can branch on it. Chapter 7 has the full status code map.

## The server entrypoint

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

## Talking to it with grpcurl

In another terminal:

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

The `-plaintext` flag is because we are not running TLS yet (chapter 9). The discovery worked because `reflection.Register(s)` was called in main.

## A real client

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

That is end-to-end gRPC. A `.proto` defined the contract, `protoc` generated the Go code, the server implemented the interface, the client called methods that look like ordinary Go.

## The shape of `*Server` and why it is generated

`pb.NewUserServiceClient(conn)` returns a struct generated from the proto. Its methods wrap the wire calls. Every method takes `(ctx, request, ...grpc.CallOption)` and returns `(response, error)`. That signature is the API surface for every gRPC client in every language.

`pb.RegisterUserServiceServer(s, impl)` wires your `*Server` (which satisfies the generated interface) into the gRPC server's dispatch table. New `.proto` methods → regen → the interface gains new methods → your `UnimplementedUserServiceServer` embed satisfies them with `not implemented` until you implement them properly.

This is the rhythm: edit `.proto` → `make gen` → write or update method implementations → rebuild.

## Reflection — friend in dev, often disabled in prod

`reflection.Register(s)` exposes a special service that lets clients discover the schema at runtime. Convenient for development; arguably leaks information in production.

A common pattern: gate it behind an env var.

```go
if os.Getenv("ENABLE_REFLECTION") == "1" {
    reflection.Register(s)
}
```

Or only enable it for internal services. For public services where the proto is also published, leave it on — there is nothing to hide.

## Connection reuse — the most important client habit

`pb.NewUserServiceClient(conn)` is cheap. `grpc.NewClient(...)` is expensive (it sets up the TCP/TLS/HTTP/2 connection). The mistake is creating a fresh `conn` per call:

```go
// WRONG — defeats multiplexing, makes a new TCP+TLS handshake every call
func GetUser(id int64) (*pb.User, error) {
    conn, _ := grpc.NewClient(...)
    defer conn.Close()
    return pb.NewUserServiceClient(conn).GetUser(...)
}
```

Hold the connection at app scope:

```go
var userClient pb.UserServiceClient

func init() {
    conn, _ := grpc.NewClient(...)
    userClient = pb.NewUserServiceClient(conn)
}
```

One conn per backend, lifetime of the process. Multiplexing handles concurrency (chapter 3).

## Building a static binary

Unlike Node or Python, Go ships a single static binary:

```bash
CGO_ENABLED=0 go build -o bin/server ./cmd/server
ldd bin/server  # not a dynamic executable
```

Copy `bin/server` to a VPS, write a systemd unit, done. No runtime to install.

## Recap

- Project layout: `proto/` for `.proto`, `gen/` for generated code, `cmd/` for binaries, `internal/` for impl.
- `protoc-gen-go` and `protoc-gen-go-grpc` emit `*.pb.go` and `*_grpc.pb.go`.
- Embed `pb.UnimplementedXxxServer` in your impl so regens do not break compile.
- Return errors as `status.Error(codes.X, msg)` so clients see proper status codes.
- `reflection.Register(s)` enables `grpcurl list` and dynamic dispatch.
- One `grpc.NewClient` per backend, lifetime of the process. Reuse the connection.
- Builds a static binary with `CGO_ENABLED=0 go build`.

Next: [Polyglot — Node and Python clients](/notes/grpc/05-polyglot) — same `.proto`, three languages, all talking to the same server.

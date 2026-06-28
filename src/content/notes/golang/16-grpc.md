---
title: 'gRPC & Protocol Buffers'
subtitle: 'High-performance service-to-service communication — gRPC is what REST wants to be when services talk to each other.'
chapter: 16
level: 'intermediate'
readingTime: '20 min'
topics: ['gRPC', 'protobuf', 'RPC', 'microservices', 'streaming', 'service communication']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why gRPC?

REST is great for browser-to-server communication. But for service-to-service communication inside your backend, gRPC is often the better choice:

| Feature         | REST/JSON                          | gRPC/Protobuf                             |
| --------------- | ---------------------------------- | ----------------------------------------- |
| Serialization   | JSON (text, ~10x larger)           | Protobuf (binary, compact)                |
| Schema          | OpenAPI (optional, often outdated) | `.proto` files (required, always current) |
| Code generation | Optional                           | Built-in (Go, Java, Python, etc.)         |
| Streaming       | WebSockets (separate protocol)     | Built-in bidirectional streaming          |
| Performance     | Good                               | Great (2-10x faster serialization)        |
| Browser support | Native                             | Needs gRPC-Web proxy                      |

<Callout type="info">

**Real-World Analogy**

REST is like sending letters — each letter needs an address (URL), a format (JSON), and the post office (HTTP) delivers it. gRPC is like a phone call — you establish a connection, both sides speak a shared language (protobuf), and communication is instant and bidirectional.

</Callout>

## Defining a Service with Protobuf

Protocol Buffers (protobuf) define your API schema:

```protobuf
// proto/user/v1/user.proto
syntax = "proto3";

package user.v1;

option go_package = "github.com/yourname/myapp/gen/user/v1;userv1";

// Messages — your data types
message User {
  int32 id = 1;
  string email = 2;
  string name = 3;
  string role = 4;
  google.protobuf.Timestamp created_at = 5;
}

message CreateUserRequest {
  string email = 1;
  string name = 2;
  string password = 3;
}

message CreateUserResponse {
  User user = 1;
}

message GetUserRequest {
  int32 id = 1;
}

message GetUserResponse {
  User user = 1;
}

message ListUsersRequest {
  int32 page = 1;
  int32 page_size = 2;
}

message ListUsersResponse {
  repeated User users = 1;
  int32 total_count = 2;
}

// Service — your API contract
service UserService {
  rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
}
```

```bash
# Install protoc compiler and Go plugins
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# Generate Go code
protoc --go_out=. --go-grpc_out=. proto/user/v1/user.proto
```

## Implementing the Server

```go
package main

import (
    "context"
    "log"
    "net"

    "google.golang.org/grpc"
    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/status"

    userv1 "github.com/yourname/myapp/gen/user/v1"
)

type userServer struct {
    userv1.UnimplementedUserServiceServer  // Forward compatibility
    repo UserRepository
}

func (s *userServer) CreateUser(ctx context.Context, req *userv1.CreateUserRequest) (*userv1.CreateUserResponse, error) {
    // Validate input
    if req.Email == "" {
        return nil, status.Error(codes.InvalidArgument, "email is required")
    }
    if req.Name == "" {
        return nil, status.Error(codes.InvalidArgument, "name is required")
    }

    // Create user
    user, err := s.repo.Create(ctx, req.Email, req.Name, req.Password)
    if err != nil {
        return nil, status.Errorf(codes.Internal, "failed to create user: %v", err)
    }

    return &userv1.CreateUserResponse{
        User: toProtoUser(user),
    }, nil
}

func (s *userServer) GetUser(ctx context.Context, req *userv1.GetUserRequest) (*userv1.GetUserResponse, error) {
    user, err := s.repo.GetByID(ctx, int(req.Id))
    if err != nil {
        if errors.Is(err, ErrNotFound) {
            return nil, status.Errorf(codes.NotFound, "user %d not found", req.Id)
        }
        return nil, status.Errorf(codes.Internal, "failed to get user: %v", err)
    }

    return &userv1.GetUserResponse{
        User: toProtoUser(user),
    }, nil
}

func (s *userServer) ListUsers(ctx context.Context, req *userv1.ListUsersRequest) (*userv1.ListUsersResponse, error) {
    pageSize := int(req.PageSize)
    if pageSize == 0 {
        pageSize = 20
    }
    offset := int(req.Page-1) * pageSize

    users, total, err := s.repo.List(ctx, pageSize, offset)
    if err != nil {
        return nil, status.Errorf(codes.Internal, "failed to list users: %v", err)
    }

    protoUsers := make([]*userv1.User, len(users))
    for i, u := range users {
        protoUsers[i] = toProtoUser(u)
    }

    return &userv1.ListUsersResponse{
        Users:      protoUsers,
        TotalCount: int32(total),
    }, nil
}

func main() {
    lis, err := net.Listen("tcp", ":50051")
    if err != nil {
        log.Fatalf("failed to listen: %v", err)
    }

    grpcServer := grpc.NewServer()
    userv1.RegisterUserServiceServer(grpcServer, &userServer{repo: repo})

    log.Println("gRPC server starting on :50051")
    if err := grpcServer.Serve(lis); err != nil {
        log.Fatalf("failed to serve: %v", err)
    }
}
```

## gRPC Client

The generated code gives you a type-safe client:

```go
func main() {
    conn, err := grpc.NewClient("localhost:50051",
        grpc.WithTransportCredentials(insecure.NewCredentials()),
    )
    if err != nil {
        log.Fatalf("failed to connect: %v", err)
    }
    defer conn.Close()

    client := userv1.NewUserServiceClient(conn)

    // Create user
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    resp, err := client.CreateUser(ctx, &userv1.CreateUserRequest{
        Email:    "fatima@example.com",
        Name:     "Fatima",
        Password: "secret123",
    })
    if err != nil {
        // gRPC errors have status codes
        st, ok := status.FromError(err)
        if ok {
            log.Printf("gRPC error: code=%s, message=%s", st.Code(), st.Message())
        }
        return
    }

    fmt.Printf("Created user: %+v\n", resp.User)
}
```

## gRPC Streaming

One of gRPC's killer features — built-in streaming:

```protobuf
service AnalyticsService {
  // Server streaming — server sends multiple responses
  rpc WatchMetrics(WatchMetricsRequest) returns (stream MetricUpdate);

  // Client streaming — client sends multiple requests
  rpc UploadLogs(stream LogEntry) returns (UploadLogsResponse);

  // Bidirectional streaming — both sides stream
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}
```

```go
// Server streaming implementation
func (s *analyticsServer) WatchMetrics(req *pb.WatchMetricsRequest, stream pb.AnalyticsService_WatchMetricsServer) error {
    ticker := time.NewTicker(time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            metric := collectMetric(req.MetricName)
            if err := stream.Send(&pb.MetricUpdate{
                Name:      metric.Name,
                Value:     metric.Value,
                Timestamp: timestamppb.Now(),
            }); err != nil {
                return err
            }
        case <-stream.Context().Done():
            return nil  // Client disconnected
        }
    }
}
```

## gRPC Interceptors (Middleware)

```go
// Unary interceptor (for single request/response RPCs)
func loggingInterceptor(
    ctx context.Context,
    req any,
    info *grpc.UnaryServerInfo,
    handler grpc.UnaryHandler,
) (any, error) {
    start := time.Now()
    resp, err := handler(ctx, req)
    slog.Info("gRPC request",
        "method", info.FullMethod,
        "duration_ms", time.Since(start).Milliseconds(),
        "error", err,
    )
    return resp, err
}

// Apply interceptors
grpcServer := grpc.NewServer(
    grpc.UnaryInterceptor(loggingInterceptor),
)
```

<Callout type="tip">

**Use gRPC for internal service-to-service communication** and REST for external/browser-facing APIs. Many companies run both — a REST gateway that translates to gRPC internally. Tools like `grpc-gateway` automate this translation from protobuf definitions.

</Callout>

## Key Takeaways

1. **Protobuf defines the contract** — `.proto` files are the single source of truth for your API
2. **Code generation** creates type-safe clients and servers in any language
3. **gRPC status codes** replace HTTP status codes — `codes.NotFound`, `codes.InvalidArgument`
4. **Streaming is built-in** — server, client, and bidirectional streaming without WebSockets
5. **Interceptors are gRPC middleware** — logging, auth, metrics work the same as HTTP middleware
6. **Use for internal services**, REST for external APIs — combine with `grpc-gateway` for both

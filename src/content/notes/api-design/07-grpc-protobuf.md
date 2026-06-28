---
title: 'gRPC & Protocol Buffers'
subtitle: 'Build high-performance APIs with gRPC — Protocol Buffers, service definitions, streaming, and when to choose gRPC over REST.'
chapter: 7
level: 'advanced'
readingTime: '14 min'
topics: ['gRPC', 'Protocol Buffers', 'protobuf', 'streaming', 'service definitions']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What is gRPC?

gRPC (gRPC Remote Procedure Call) is a high-performance RPC framework created by Google. It uses HTTP/2 for transport, Protocol Buffers for serialization, and provides features like streaming, deadlines, and load balancing out of the box.

<Callout type="info">

**Real-World Analogy**

Like internal radio communication at a warehouse — fast, compact, efficient protocol between workers who know the codes. Not meant for talking to customers, but perfect for internal coordination.

</Callout>

## Protocol Buffers

Protocol Buffers (protobuf) is a language-neutral serialization format. You define your data structure in a `.proto` file, and the protobuf compiler generates code for your language.

```protobuf
// user.proto
syntax = "proto3";

package user;

// Message definitions (like TypeScript interfaces)
message User {
  string id = 1;           // Field number, not default value
  string first_name = 2;
  string last_name = 3;
  string email = 4;
  Role role = 5;
  int64 created_at = 6;    // Unix timestamp
}

enum Role {
  ROLE_UNSPECIFIED = 0;     // Proto3 requires 0 as default
  ROLE_USER = 1;
  ROLE_ADMIN = 2;
  ROLE_MODERATOR = 3;
}

message CreateUserRequest {
  string first_name = 1;
  string last_name = 2;
  string email = 3;
  Role role = 4;
}

message CreateUserResponse {
  User user = 1;
}

message GetUserRequest {
  string id = 1;
}

message GetUserResponse {
  User user = 1;
}

message ListUsersRequest {
  int32 page_size = 1;
  string page_token = 2;   // Cursor for pagination
  Role role_filter = 3;
}

message ListUsersResponse {
  repeated User users = 1;
  string next_page_token = 2;
  int32 total_count = 3;
}
```

### Why Protobuf Over JSON?

```typescript
// JSON (human readable, larger)
{
  "id": "user_42",
  "firstName": "Rahim",
  "lastName": "Ahmed",
  "email": "rahim@example.com",
  "role": "ADMIN",
  "createdAt": 1700000000
}
// Size: ~150 bytes

// Protobuf (binary, compact)
// Same data: ~45 bytes (70% smaller!)
// Also: strict typing, no parsing ambiguity, faster serialization
```

| Feature          | JSON                   | Protobuf               |
| ---------------- | ---------------------- | ---------------------- |
| Format           | Text                   | Binary                 |
| Size             | Larger                 | 3-10x smaller          |
| Parse speed      | Slower                 | 5-100x faster          |
| Schema           | Optional (JSON Schema) | Required (.proto)      |
| Human readable   | Yes                    | No                     |
| Language support | Universal              | Code generation needed |

## Service Definitions

gRPC services are defined in the `.proto` file:

```protobuf
// user_service.proto
syntax = "proto3";

package user;

import "user.proto";

service UserService {
  // Unary RPC — one request, one response
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
  rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);

  // Server streaming — one request, stream of responses
  rpc ListUsers(ListUsersRequest) returns (stream User);

  // Client streaming — stream of requests, one response
  rpc UploadUsers(stream CreateUserRequest) returns (UploadUsersResponse);

  // Bidirectional streaming — stream in both directions
  rpc UserChat(stream ChatMessage) returns (stream ChatMessage);
}

message UploadUsersResponse {
  int32 created_count = 1;
  int32 failed_count = 2;
}

message ChatMessage {
  string user_id = 1;
  string text = 2;
  int64 timestamp = 3;
}
```

## Implementing a gRPC Server

```typescript
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// Load proto definition
const PROTO_PATH = path.join(__dirname, 'protos/user_service.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
	keepCase: true,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true
});
const proto = grpc.loadPackageDefinition(packageDefinition).user as any;

// Implement service handlers
const userService = {
	// Unary RPC
	async getUser(
		call: grpc.ServerUnaryCall<GetUserRequest, GetUserResponse>,
		callback: grpc.sendUnaryData<GetUserResponse>
	) {
		try {
			const user = await db.users.findById(call.request.id);
			if (!user) {
				return callback({
					code: grpc.status.NOT_FOUND,
					message: `User ${call.request.id} not found`
				});
			}
			callback(null, { user });
		} catch (err) {
			callback({
				code: grpc.status.INTERNAL,
				message: 'Internal server error'
			});
		}
	},

	// Server streaming RPC
	async listUsers(call: grpc.ServerWritableStream<ListUsersRequest, User>) {
		const { page_size, role_filter } = call.request;
		const filter: Record<string, unknown> = {};
		if (role_filter) filter.role = role_filter;

		const cursor = db.users.find(filter).limit(page_size || 100);

		for await (const user of cursor) {
			call.write(user);
		}
		call.end();
	},

	// Client streaming RPC
	async uploadUsers(
		call: grpc.ServerReadableStream<CreateUserRequest, UploadUsersResponse>,
		callback: grpc.sendUnaryData<UploadUsersResponse>
	) {
		let createdCount = 0;
		let failedCount = 0;

		call.on('data', async (request: CreateUserRequest) => {
			try {
				await db.users.create(request);
				createdCount++;
			} catch {
				failedCount++;
			}
		});

		call.on('end', () => {
			callback(null, {
				created_count: createdCount,
				failed_count: failedCount
			});
		});
	},

	// Bidirectional streaming
	userChat(call: grpc.ServerDuplexStream<ChatMessage, ChatMessage>) {
		call.on('data', (message: ChatMessage) => {
			// Echo back or broadcast to other clients
			console.log(`[${message.user_id}]: ${message.text}`);

			// Send response back
			call.write({
				user_id: 'server',
				text: `Received: ${message.text}`,
				timestamp: Date.now()
			});
		});

		call.on('end', () => {
			call.end();
		});
	}
};

// Start the server
const server = new grpc.Server();
server.addService(proto.UserService.service, userService);
server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), (err, port) => {
	if (err) throw err;
	console.log(`gRPC server running on port ${port}`);
});
```

## Implementing a gRPC Client

```typescript
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH = path.join(__dirname, 'protos/user_service.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const proto = grpc.loadPackageDefinition(packageDefinition).user as any;

const client = new proto.UserService('localhost:50051', grpc.credentials.createInsecure());

// Unary call
function getUser(id: string): Promise<User> {
	return new Promise((resolve, reject) => {
		client.getUser({ id }, (err: grpc.ServiceError | null, response: GetUserResponse) => {
			if (err) return reject(err);
			resolve(response.user);
		});
	});
}

// Server streaming
function listUsers(pageSize: number): Promise<User[]> {
	return new Promise((resolve, reject) => {
		const users: User[] = [];
		const stream = client.listUsers({ page_size: pageSize });

		stream.on('data', (user: User) => users.push(user));
		stream.on('end', () => resolve(users));
		stream.on('error', reject);
	});
}

// Client streaming
async function uploadUsers(users: CreateUserRequest[]): Promise<UploadUsersResponse> {
	return new Promise((resolve, reject) => {
		const stream = client.uploadUsers(
			(err: grpc.ServiceError | null, response: UploadUsersResponse) => {
				if (err) return reject(err);
				resolve(response);
			}
		);

		for (const user of users) {
			stream.write(user);
		}
		stream.end();
	});
}
```

## gRPC Status Codes

gRPC has its own status code system:

```typescript
// gRPC status codes (not HTTP status codes)
grpc.status.OK; // 0  — Success
grpc.status.CANCELLED; // 1  — Operation cancelled
grpc.status.INVALID_ARGUMENT; // 3  — Bad input
grpc.status.NOT_FOUND; // 5  — Resource not found
grpc.status.ALREADY_EXISTS; // 6  — Duplicate
grpc.status.PERMISSION_DENIED; // 7 — Not authorized
grpc.status.UNAUTHENTICATED; // 16 — Not authenticated
grpc.status.RESOURCE_EXHAUSTED; // 8 — Rate limited
grpc.status.INTERNAL; // 13 — Server error
grpc.status.UNAVAILABLE; // 14 — Service down
grpc.status.DEADLINE_EXCEEDED; // 4 — Timeout

// Setting deadlines (timeouts)
const deadline = new Date();
deadline.setSeconds(deadline.getSeconds() + 5); // 5 second timeout

client.getUser({ id: '42' }, { deadline }, (err, response) => {
	if (err?.code === grpc.status.DEADLINE_EXCEEDED) {
		console.error('Request timed out');
	}
});
```

<Callout type="tip">

**gRPC Best Practices**

- Always set **deadlines** on client calls to prevent hanging requests
- Use **server streaming** for large result sets instead of pagination
- Use **interceptors** (middleware) for logging, auth, and metrics
- Keep messages small — gRPC has a default 4MB message size limit
- Use **health checks** (`grpc.health.v1.Health`) for load balancer integration

</Callout>

## When to Use gRPC vs REST

| Use Case                     | gRPC                  | REST            |
| ---------------------------- | --------------------- | --------------- |
| Microservice-to-microservice | Excellent             | Good            |
| Browser clients              | Limited (needs proxy) | Native          |
| Mobile clients               | Good (with libraries) | Native          |
| Real-time streaming          | Built-in              | Needs WebSocket |
| Public API                   | Poor                  | Excellent       |
| Performance-critical         | Best                  | Good            |
| Human debugging              | Hard (binary)         | Easy (JSON)     |

<Callout type="warning">

**gRPC Limitations**

- Not natively supported in browsers — you need a gRPC-Web proxy (like Envoy)
- Binary format is hard to debug without tooling
- Less ecosystem support than REST for API gateways, documentation, and monitoring
- Requires code generation step in your build pipeline
- Not ideal for public-facing APIs where developers expect REST/JSON

</Callout>

## Key Takeaways

1. **gRPC uses HTTP/2 + Protobuf** for high-performance, typed, binary communication
2. **Protocol Buffers** provide schema-first, compact serialization — 3-10x smaller than JSON
3. **Four RPC types**: unary, server streaming, client streaming, bidirectional streaming
4. **Use gRPC for internal services** where performance and type safety matter
5. **Use REST for public APIs** where developer experience and browser support matter
6. **Always set deadlines** and handle gRPC status codes properly

---
title: 'gRPC ও Protocol Buffers'
subtitle: 'gRPC দিয়ে হাই-পারফরম্যান্স API বানান — Protocol Buffers, service definition, streaming, আর কখন REST-এর বদলে gRPC বেছে নেবেন।'
chapter: 7
level: 'advanced'
readingTime: '14 মিনিট'
topics: ['gRPC', 'Protocol Buffers', 'protobuf', 'streaming', 'service definitions']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

করিমের একটা কুরিয়ার কোম্পানির দুটো ব্রাঞ্চ অফিস — একটা ঢাকায়, একটা চট্টগ্রামে। আগে দুই অফিসের কর্মীরা নিজেদের মধ্যে খবর পাঠাতে লম্বা হাতে-লেখা চিঠি লিখত: "আজ ঢাকা থেকে চট্টগ্রামের গুদামে ৫০টা প্যাকেট গেছে, ওজন এত, গাড়ির নম্বর এই, ডেলিভারির তারিখ এই।" চিঠিগুলো মোটা, লিখতে সময় লাগে, খামে ভরে পাঠাতে হয়, আর হাতের লেখা এদিক-ওদিক হলে অন্য পাশে পড়তে ভুল হয়ে যায়। সোজা কথা — বড়, ধীর, আর ভুল বোঝার সুযোগ বেশি।

তারপর করিম একটা বুদ্ধি বের করল। দুই অফিসকে সে একটা এক রকমের সাংকেতিক কোডবই (codebook) ধরিয়ে দিল — দুই পাশেই হুবহু একই বই। এখন গোটা একটা বাক্য না লিখে শুধু একটা ছোট কোড লেখা স্লিপ পাঠালেই চলে: "K7-42" মানেই কোডবই অনুযায়ী "৫০টা প্যাকেট, স্ট্যান্ডার্ড ওজন, রুট ৭, গাড়ি ৪২"। যেহেতু দুই পাশেরই একদম একই কোডবই, তাই কোডটা খুলতে কোনো ঝামেলা বা ভুল বোঝাবুঝি নেই — আর স্লিপটা এত ছোট যে চিঠির বদলে চোখের পলকে চলে যায়।

এই কোডবইটাই হলো **protobuf**-এর শেয়ার্ড schema বা **contract**, আর ছোট কোড-স্লিপটাই হলো compact **binary** message — লম্বা JSON/text চিঠির বদলে অনেক ছোট আর দ্রুত। দুই পাশে আগে থেকে একই contract থাকায় ডেটা পড়তে কোনো দ্বিধা নেই, আর কোড-জেনারেট করা stub দিয়ে সেই কোডবই দুই অফিসেই এক থাকে। বাস্তবে এভাবেই **gRPC** দিয়ে ভেতরের microservice-গুলো নিজেদের মধ্যে কথা বলে — যেখানে দুটো সার্ভিসই আগে থেকে একই `.proto` contract জানে, সেখানে service-to-service কল দ্রুত, ছোট আর নির্ভুল হয়।

## gRPC কী?

gRPC (gRPC Remote Procedure Call) হলো Google-এর তৈরি একটি হাই-পারফরম্যান্স RPC ফ্রেমওয়ার্ক। এটা transport-এর জন্য HTTP/2, serialization-এর জন্য Protocol Buffers ব্যবহার করে, আর streaming, deadline, load balancing-এর মতো ফিচার আগে থেকেই দেয়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা গুদামে ভেতরের রেডিও যোগাযোগের মতো — কোড জানা কর্মীদের মধ্যে দ্রুত, কম্প্যাক্ট, দক্ষ protocol। কাস্টমারের সাথে কথা বলার জন্য নয়, কিন্তু ভেতরের সমন্বয়ের জন্য নিখুঁত।

</Callout>

## Protocol Buffers

Protocol Buffers (protobuf) হলো একটি language-neutral serialization format। আপনি একটি `.proto` ফাইলে আপনার ডেটা স্ট্রাকচার সংজ্ঞায়িত করেন, আর protobuf compiler আপনার language-এর জন্য কোড generate করে।

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

### JSON-এর বদলে Protobuf কেন?

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

| বৈশিষ্ট্য        | JSON                 | Protobuf              |
| ---------------- | -------------------- | --------------------- |
| Format           | Text                 | Binary                |
| Size             | বড়                  | 3-10x ছোট             |
| Parse speed      | ধীর                  | 5-100x দ্রুত          |
| Schema           | ঐচ্ছিক (JSON Schema) | আবশ্যক (.proto)       |
| Human readable   | হ্যাঁ                | না                    |
| Language support | সর্বজনীন             | code generation দরকার |

## Service Definition

gRPC service `.proto` ফাইলে সংজ্ঞায়িত করা হয়:

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

## একটি gRPC Server ইমপ্লিমেন্ট করা

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

## একটি gRPC Client ইমপ্লিমেন্ট করা

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

## gRPC Status Code

gRPC-এর নিজস্ব status code সিস্টেম আছে:

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

**gRPC Best Practice**

- hang হয়ে থাকা request ঠেকাতে client call-এ সবসময় **deadline** সেট করুন
- বড় result set-এর জন্য pagination-এর বদলে **server streaming** ব্যবহার করুন
- logging, auth, আর metrics-এর জন্য **interceptor** (middleware) ব্যবহার করুন
- message ছোট রাখুন — gRPC-তে ডিফল্ট 4MB message সাইজ লিমিট আছে
- load balancer ইন্টিগ্রেশনের জন্য **health check** (`grpc.health.v1.Health`) ব্যবহার করুন

</Callout>

## কখন gRPC বনাম REST ব্যবহার করবেন

| Use Case                     | gRPC                   | REST            |
| ---------------------------- | ---------------------- | --------------- |
| Microservice-to-microservice | চমৎকার                 | ভালো            |
| Browser client               | সীমিত (proxy দরকার)    | Native          |
| Mobile client                | ভালো (লাইব্রেরি দিয়ে) | Native          |
| Real-time streaming          | বিল্ট-ইন               | WebSocket দরকার |
| Public API                   | দুর্বল                 | চমৎকার          |
| Performance-critical         | সেরা                   | ভালো            |
| Human debugging              | কঠিন (binary)          | সহজ (JSON)      |

<Callout type="warning">

**gRPC-এর সীমাবদ্ধতা**

- browser-এ native সাপোর্ট নেই — আপনার একটি gRPC-Web proxy দরকার (যেমন Envoy)
- binary format tooling ছাড়া ডিবাগ করা কঠিন
- API gateway, documentation, আর monitoring-এর জন্য REST-এর তুলনায় কম ইকোসিস্টেম সাপোর্ট
- আপনার build pipeline-এ একটি code generation ধাপ দরকার
- public-facing API-এর জন্য আদর্শ নয়, যেখানে ডেভেলপাররা REST/JSON আশা করে

</Callout>

## মূল কথা

1. **gRPC HTTP/2 + Protobuf ব্যবহার করে** হাই-পারফরম্যান্স, typed, binary যোগাযোগের জন্য
2. **Protocol Buffers** schema-first, কম্প্যাক্ট serialization দেয় — JSON-এর চেয়ে 3-10x ছোট
3. **চার ধরনের RPC**: unary, server streaming, client streaming, bidirectional streaming
4. যেখানে performance আর type safety গুরুত্বপূর্ণ সেই **internal service-এর জন্য gRPC ব্যবহার করুন**
5. যেখানে developer experience আর browser সাপোর্ট গুরুত্বপূর্ণ সেই **public API-এর জন্য REST ব্যবহার করুন**
6. **সবসময় deadline সেট করুন** আর gRPC status code ঠিকভাবে সামলান

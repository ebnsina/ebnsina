---
title: 'gRPC Between Services'
subtitle: 'Protocol Buffers, generated clients, streaming, আর internal service communication-এ কেন gRPC REST-কে হারায়।'
chapter: 2
level: 'intermediate'
readingTime: '11 মিনিট'
topics:
  ['gRPC', 'Protocol Buffers', 'protobuf', 'streaming', 'service definition', 'code generation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা standardized electrical plug specification বনাম সর্বত্র adapter: যখন প্রতিটা দেশ একটা plug format-এ (the `.proto` file) একমত হয়, তখন ওই spec অনুযায়ী বানানো যেকোনো ডিভাইস (service) যেকোনো outlet-এ (client) adapter (হাতে লেখা HTTP client) ছাড়াই কাজ করে। spec বদলান, adapter আবার generate করুন — যা documented আর যা implemented তার মধ্যে কোনো drift থাকে না।

</Callout>

## গল্পে বুঝি

একটা industrial estate-এ পাশাপাশি দুটো specialist workshop। একটা আল-খোয়ারিজমির — সে ধাতুর নিখুঁত gear কাটে; পাশেরটা ইবনে সিনার — সে সেই gear দিয়ে ঘড়ির যন্ত্র জোড়া দেয়। ইবনে সিনার প্রতিটা যন্ত্রের জন্য নানা মাপের gear দরকার, তাই সারাদিন সে আল-খোয়ারিজমির কাছে অর্ডার পাঠায়। দুই ওয়ার্কশপের দেয়াল ফুটো করে ওরা একটা প্রাইভেট conveyor-tube বসিয়েছে — একটা ছোট টিকিট টিউবে ঢুকিয়ে দিলেই সেকেন্ডের মধ্যে পাশের ওয়ার্কশপে চলে যায়।

মজার ব্যাপার হলো টিকিটের ফরম্যাট। বাইরের কাস্টমার যখন অর্ডার দেয়, তাকে লম্বা কাগুজে ফর্ম ভরতে হয় — "কী চান, কতটা, কোন ফিনিশ" সব পুরো বাক্যে লিখে। কিন্তু দুই ওয়ার্কশপ আগেভাগেই নিজেদের মধ্যে একটা compact কোড ঠিক করে রেখেছে: টিকিটে শুধু লেখা থাকে "G7-x40-B2"। আল-খোয়ারিজমি চোখ বুলিয়েই বোঝে — 7 নম্বর gear, 40টা, ব্রোঞ্জ। ফরম্যাটটা দুজনের কাছেই আগে থেকে ফিক্সড বলে ভুল বোঝাবুঝির সুযোগ নেই, আর ছোট বলে টিউবে যেতেও দ্রুত।

গল্পটাই আসলে **gRPC**। পাশাপাশি দুই ওয়ার্কশপ হলো দুটো internal microservice, আর প্রাইভেট conveyor-tube হলো সরাসরি service-to-service channel। আগে থেকে ঠিক করা compact টিকিট-ফরম্যাটটাই হলো protobuf **contract** — contract-first বলেই মেসেজ ছোট, binary আর unambiguous। আর বাইরের কাস্টমারের লম্বা প্লেইন ফর্ম হলো **REST**/JSON — public API-র জন্য পড়তে-লিখতে সহজ, কিন্তু ভারী। বাস্তবে ঠিক এভাবেই Google-এর ভেতরের হাজারো service নিজেদের মধ্যে gRPC-তে কথা বলে, আর ব্রাউজারের মুখোমুখি public endpoint-এ REST রাখে।

## Internal API-র জন্য কেন gRPC

HTTP/1.1-এর ওপর REST-এ কোনো schema enforcement নেই, কোনো code generation নেই, আর কোনো streaming নেই। প্রতিটা team নিজের HTTP client, নিজের serialization, নিজের error handling লেখে। 10টা service-এ আপনার 10টা সামান্য ভিন্ন convention হয়ে যায়।

gRPC এটা সমাধান করে:

|                     | REST/JSON                  | gRPC                       |
| ------------------- | -------------------------- | -------------------------- |
| **Schema**          | ঐচ্ছিক (OpenAPI)           | আবশ্যক (`.proto`)          |
| **Code generation** | ঐচ্ছিক                     | Built-in                   |
| **Serialization**   | JSON (text, verbose)       | Protobuf (binary, compact) |
| **Streaming**       | না (SSE/WebSocket bolt-on) | First-class (4টা mode)     |
| **Performance**     | Baseline                   | ~5-10x দ্রুত serialization |
| **Browser support** | Native                     | grpc-web proxy দরকার       |

**Internal API** (service-to-service): gRPC। **Public API** (browser client): REST বা GraphQL।

## Protocol Buffers

Contract-টা একটা `.proto` file-এ define করুন:

```protobuf
// proto/order/v1/order.proto
syntax = "proto3";

package order.v1;

option go_package = "github.com/myorg/proto/order/v1";
option java_package = "com.myorg.order.v1";

// Shared types
message Money {
  int64 amount_cents = 1;
  string currency = 2;
}

message Order {
  string id = 1;
  string customer_id = 2;
  repeated OrderItem items = 3;
  Money total = 4;
  OrderStatus status = 5;
  string created_at = 6;
}

message OrderItem {
  string product_id = 1;
  int32 quantity = 2;
  Money price = 3;
}

enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0;
  ORDER_STATUS_PENDING = 1;
  ORDER_STATUS_CONFIRMED = 2;
  ORDER_STATUS_SHIPPED = 3;
  ORDER_STATUS_CANCELLED = 4;
}

// Service definition
service OrderService {
  rpc CreateOrder(CreateOrderRequest) returns (CreateOrderResponse);
  rpc GetOrder(GetOrderRequest) returns (GetOrderResponse);
  rpc ListOrders(ListOrdersRequest) returns (ListOrdersResponse);
  rpc WatchOrderStatus(WatchOrderStatusRequest) returns (stream OrderStatusUpdate);
}

message CreateOrderRequest {
  string customer_id = 1;
  repeated OrderItem items = 2;
}

message CreateOrderResponse {
  Order order = 1;
}

message GetOrderRequest {
  string order_id = 1;
}

message GetOrderResponse {
  Order order = 1;
}

message ListOrdersRequest {
  string customer_id = 1;
  int32 page_size = 2;
  string page_token = 3;
}

message ListOrdersResponse {
  repeated Order orders = 1;
  string next_page_token = 2;
}

message WatchOrderStatusRequest {
  string order_id = 1;
}

message OrderStatusUpdate {
  string order_id = 1;
  OrderStatus status = 2;
  string updated_at = 3;
}
```

## Code Generation

```bash
# Install protoc and plugins
apt install protobuf-compiler
npm install -g @bufbuild/protoc-gen-es @connectrpc/protoc-gen-connect-es

# Or use Buf (recommended)
npm install -g @bufbuild/buf

# buf.yaml
version: v1
modules:
  - directory: proto

# buf.gen.yaml
version: v1
plugins:
  - plugin: es
    out: src/gen
  - plugin: connect-es
    out: src/gen
```

```bash
buf generate
# Generates:
# src/gen/order/v1/order_pb.ts    — types
# src/gen/order/v1/order_connect.ts — service client/server
```

## Server Implementation (Connect সহ Node.js)

```typescript
import { ConnectRouter } from '@connectrpc/connect';
import { OrderService } from './gen/order/v1/order_connect';
import { Order, OrderStatus } from './gen/order/v1/order_pb';

export const orderRoutes = (router: ConnectRouter) =>
	router.service(OrderService, {
		async createOrder(req) {
			const order = await db.orders.create({
				customerId: req.customerId,
				items: req.items.map((item) => ({
					productId: item.productId,
					quantity: item.quantity,
					priceCents: Number(item.price?.amountCents ?? 0)
				}))
			});

			return {
				order: toProtoOrder(order)
			};
		},

		async getOrder(req) {
			const order = await db.orders.findById(req.orderId);
			if (!order) throw new ConnectError('Order not found', Code.NotFound);
			return { order: toProtoOrder(order) };
		},

		// Server-streaming: client subscribes, server sends multiple responses
		async *watchOrderStatus(req) {
			let lastStatus = '';
			while (true) {
				const order = await db.orders.findById(req.orderId);
				if (!order) throw new ConnectError('Order not found', Code.NotFound);

				if (order.status !== lastStatus) {
					lastStatus = order.status;
					yield {
						orderId: order.id,
						status: toProtoStatus(order.status),
						updatedAt: order.updatedAt.toISOString()
					};
				}

				if (order.status === 'delivered' || order.status === 'cancelled') break;
				await sleep(1000);
			}
		}
	});

// Start server
import { createServer } from '@connectrpc/connect-node';
import * as http2 from 'http2';

const server = http2.createServer(createServer({ routes: orderRoutes }));
server.listen(50051);
```

## Client Usage

```typescript
import { createClient } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { OrderService } from './gen/order/v1/order_connect';

const transport = createGrpcTransport({
	baseUrl: 'https://order-service:50051'
});

const client = createClient(OrderService, transport);

// Unary call
const { order } = await client.createOrder({
	customerId: 'cust-123',
	items: [
		{
			productId: 'prod-456',
			quantity: 2,
			price: { amountCents: 999n, currency: 'USD' }
		}
	]
});

// Server-streaming call
for await (const update of client.watchOrderStatus({ orderId: order.id })) {
	console.log(`Order ${update.orderId} is now ${update.status}`);
	if (update.status === OrderStatus.ORDER_STATUS_SHIPPED) break;
}
```

Client-টা proto definition থেকে সম্পূর্ণভাবে typed। কোনো manual HTTP client নেই, কোনো JSON parsing নেই, কোনো type casting নেই।

## ৪টা Streaming Mode

```protobuf
service DataService {
  // Unary: one request, one response
  rpc GetData(GetRequest) returns (GetResponse);

  // Server streaming: one request, many responses
  rpc StreamData(GetRequest) returns (stream DataChunk);

  // Client streaming: many requests, one response
  rpc UploadData(stream DataChunk) returns (UploadResponse);

  // Bidirectional streaming: many requests, many responses
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}
```

Server streaming ব্যবহার করুন এর জন্য:

- Real-time feed (order status, stock price, notification)
- বড় result set (সব memory-তে buffer না করে 1M row পাঠানো)

Client streaming ব্যবহার করুন এর জন্য:

- File upload
- Bulk data ingestion (10k event পাঠান, একটা ack পান)

Bidirectional ব্যবহার করুন এর জন্য:

- Chat
- Collaborative editing
- Interactive shell session

## Error Handling

gRPC-তে standard status code আছে — এগুলো ধারাবাহিকভাবে ব্যবহার করুন:

```typescript
import { ConnectError, Code } from '@connectrpc/connect';

// NOT_FOUND — resource doesn't exist
throw new ConnectError('Order not found', Code.NotFound);

// INVALID_ARGUMENT — bad input
throw new ConnectError('customer_id is required', Code.InvalidArgument);

// ALREADY_EXISTS — conflict
throw new ConnectError('Order already exists', Code.AlreadyExists);

// PERMISSION_DENIED — authn passed, authz failed
throw new ConnectError('Not authorized to view this order', Code.PermissionDenied);

// UNAVAILABLE — temporary failure, safe to retry
throw new ConnectError('Database unavailable', Code.Unavailable);

// DEADLINE_EXCEEDED — timeout
throw new ConnectError('Request timed out', Code.DeadlineExceeded);
```

Client side-এ:

```typescript
import { ConnectError, Code } from '@connectrpc/connect';

try {
	const { order } = await client.getOrder({ orderId });
} catch (err) {
	if (err instanceof ConnectError) {
		if (err.code === Code.NotFound) return null;
		if (err.code === Code.Unavailable) {
			// Retry with backoff
		}
	}
	throw err;
}
```

## Interceptors (Middleware)

```typescript
import { Interceptor } from '@connectrpc/connect';

const loggingInterceptor: Interceptor = (next) => async (req) => {
	const start = Date.now();
	try {
		const res = await next(req);
		console.log(`${req.method.name} OK ${Date.now() - start}ms`);
		return res;
	} catch (err) {
		console.error(`${req.method.name} ERROR ${Date.now() - start}ms`, err);
		throw err;
	}
};

const authInterceptor: Interceptor = (next) => async (req) => {
	req.header.set('authorization', `Bearer ${getServiceToken()}`);
	return next(req);
};

const transport = createGrpcTransport({
	baseUrl: 'https://order-service:50051',
	interceptors: [loggingInterceptor, authInterceptor]
});
```

## Schema Evolution

Protobuf field গুলো number দিয়ে চিহ্নিত হয়, name দিয়ে নয়। নিরাপদ পরিবর্তন:

- একটা নতুন field যোগ করা (নতুন consumer সেটা ব্যবহার করতে পারে; পুরনো consumer উপেক্ষা করে)
- একটা field rename করা (number একই থাকে — wire format অপরিবর্তিত)
- একটা নতুন enum value যোগ করা

Breaking পরিবর্তন:

- একটা field সরিয়ে তার number আবার ব্যবহার করা
- একটা field-এর type বদলানো
- Field গুলো renumber করা

**সরানো field number গুলো reserve করুন** যাতে ভুলবশত আবার ব্যবহার না হয়:

```protobuf
message Order {
  reserved 4, 7;        // field numbers never to reuse
  reserved "legacy_field", "old_name";  // names never to reuse

  string id = 1;
  string customer_id = 2;
  // ...
}
```

`.proto` file গুলো একটা schema registry (Buf Schema Registry) সহ একটা shared repo-তে রাখুন যাতে CI-এর মাধ্যমে compatibility নিয়ম জোরদার হয়।

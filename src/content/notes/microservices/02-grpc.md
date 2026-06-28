---
title: 'gRPC Between Services'
subtitle: 'Protocol Buffers, generated clients, streaming, and why gRPC beats REST for internal service communication.'
chapter: 2
level: 'intermediate'
readingTime: '11 min'
topics:
  ['gRPC', 'Protocol Buffers', 'protobuf', 'streaming', 'service definition', 'code generation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A standardized electrical plug specification vs adapters everywhere: when every country agrees on one plug format (the `.proto` file), any device (service) made to that spec works in any outlet (client) without adapters (hand-written HTTP clients). Change the spec, regenerate the adapters — no drift between what's documented and what's implemented.

</Callout>

## Why gRPC for Internal APIs

REST over HTTP/1.1 has no schema enforcement, no code generation, and no streaming. Each team writes their own HTTP client, their own serialization, their own error handling. At 10 services, you have 10 slightly different conventions.

gRPC solves this:

|                     | REST/JSON                  | gRPC                        |
| ------------------- | -------------------------- | --------------------------- |
| **Schema**          | Optional (OpenAPI)         | Required (`.proto`)         |
| **Code generation** | Optional                   | Built-in                    |
| **Serialization**   | JSON (text, verbose)       | Protobuf (binary, compact)  |
| **Streaming**       | No (SSE/WebSocket bolt-on) | First-class (4 modes)       |
| **Performance**     | Baseline                   | ~5-10x faster serialization |
| **Browser support** | Native                     | Requires grpc-web proxy     |

**Internal APIs** (service-to-service): gRPC. **Public APIs** (browser clients): REST or GraphQL.

## Protocol Buffers

Define the contract in a `.proto` file:

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

## Server Implementation (Node.js with Connect)

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

The client is fully typed from the proto definition. No manual HTTP client, no JSON parsing, no type casting.

## The 4 Streaming Modes

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

Use server streaming for:

- Real-time feeds (order status, stock prices, notifications)
- Large result sets (send 1M rows without buffering all in memory)

Use client streaming for:

- File uploads
- Bulk data ingestion (send 10k events, get one ack)

Use bidirectional for:

- Chat
- Collaborative editing
- Interactive shell sessions

## Error Handling

gRPC has standard status codes — use them consistently:

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

On the client side:

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

Protobuf fields are identified by number, not name. Safe changes:

- Add a new field (new consumers can use it; old consumers ignore it)
- Rename a field (number stays the same — wire format unchanged)
- Add a new enum value

Breaking changes:

- Remove a field and reuse its number
- Change a field's type
- Renumber fields

**Reserve removed field numbers** to prevent accidental reuse:

```protobuf
message Order {
  reserved 4, 7;        // field numbers never to reuse
  reserved "legacy_field", "old_name";  // names never to reuse

  string id = 1;
  string customer_id = 2;
  // ...
}
```

Store `.proto` files in a shared repo with a schema registry (Buf Schema Registry) to enforce compatibility rules via CI.

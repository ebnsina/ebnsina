---
title: 'Subscriptions over WebSockets'
subtitle: 'Subscriptions are realtime queries — clients open a long-lived connection and the server pushes events as they happen. Different transport, different lifecycle, different failure modes than queries and mutations.'
chapter: 9
level: 'advanced'
readingTime: '13 min'
topics: ['graphql', 'subscriptions', 'websockets', 'realtime', 'pubsub']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Queries and mutations are request-response over HTTP. Subscriptions are an open pipe — the client says "I care about post-published events for this org" and the server delivers them whenever they happen. The transport is **WebSockets**, the protocol is **graphql-ws**, and the lifecycle is much longer than a regular request.

This chapter ships subscriptions on graphql-yoga end-to-end, from schema to nginx, with a real PubSub system. By the end you have a notification feature that updates connected clients instantly.

<Callout type="info">

**Real-World Analogy**

A GraphQL subscription is like subscribing to a newspaper — it arrives when printed, not when you ask for it.

</Callout>

## What a subscription looks like

```graphql
type Subscription {
	postPublished(orgId: ID!): Post!
}
```

A subscription field is a generator: it yields zero or more values over time. Each yielded value is a single GraphQL execution — same selection set, same resolver tree, but with the event payload as the root.

A client subscribes with the same query syntax:

```graphql
subscription WatchPosts($orgId: ID!) {
	postPublished(orgId: $orgId) {
		id
		title
		author {
			name
		}
	}
}
```

It opens a WebSocket, sends the subscription message, receives a stream of events as JSON over the socket. When the WebSocket closes (client navigated away, network died, server restarted), the subscription ends.

## The graphql-ws protocol

There are two WebSocket protocols for GraphQL: `subscriptions-transport-ws` (legacy, deprecated) and `graphql-ws` (current). Use **graphql-ws**. Both clients and servers support it; graphql-yoga ships with it.

The wire protocol, simplified:

```
Client → Server: { type: "connection_init", payload: { authToken: "..." } }
Server → Client: { type: "connection_ack" }

Client → Server: { type: "subscribe", id: "1", payload: { query, variables } }
Server → Client: { type: "next", id: "1", payload: { data: { ... } } }
Server → Client: { type: "next", id: "1", payload: { data: { ... } } }
...
Client → Server: { type: "complete", id: "1" }
```

`connection_init` is where you send auth (token, session cookie). The server validates it once per connection and stores the result for the lifetime of the WebSocket. `subscribe` registers a stream; `next` is each delivery; `complete` ends it. Errors are explicit messages too.

## Server-side: the resolver is an async iterator

Subscription resolvers don't return a value — they return an **async iterator** that the executor consumes:

```js
import { createPubSub } from 'graphql-yoga';

const pubsub = createPubSub();

const resolvers = {
	Subscription: {
		postPublished: {
			subscribe: (_, { orgId }, ctx) => {
				if (!ctx.currentUser) throw new Error('Not authenticated');
				return pubsub.subscribe(`post-published:${orgId}`);
			},
			resolve: (payload) => payload // payload is the post object
		}
	}
};
```

The pattern is `{ subscribe, resolve }`. `subscribe` returns the async iterator; `resolve` runs once per emitted event to shape the payload before the response is built (most of the time you return the payload as-is).

Then anywhere in your code (a mutation, a webhook handler, a background job):

```js
publishPost: async (_, { id }, ctx) => {
  const post = await markPublished(ctx.db, id);
  pubsub.publish(`post-published:${post.org_id}`, post);
  return post;
},
```

That `pubsub.publish` fans out the post to every active subscriber on that channel. The executor runs the subscription's selection set with the post as root, returns the data over the WebSocket.

## Wiring graphql-yoga for WebSockets

graphql-yoga handles HTTP. WebSockets need the `graphql-ws` server bound to the same HTTP server:

```js
import { createServer } from 'node:http';
import { createYoga } from 'graphql-yoga';
import { useServer } from 'graphql-ws/use/ws';
import { WebSocketServer } from 'ws';

const yoga = createYoga({
	schema,
	context: async ({ request, connectionParams }) => {
		// HTTP path uses request; WS path uses connectionParams
		const token = request?.headers.get('authorization')?.slice(7) ?? connectionParams?.authToken;
		const currentUser = token ? verifyJwt(token) : null;
		return { db: pool, loaders: buildLoaders(pool), currentUser, pubsub };
	}
});

const httpServer = createServer(yoga);

const wsServer = new WebSocketServer({
	server: httpServer,
	path: yoga.graphqlEndpoint
});

useServer(
	{
		execute: (args) => args.execute(args),
		subscribe: (args) => args.subscribe(args),
		onSubscribe: async (ctx, msg) => {
			const { schema, execute, subscribe, contextFactory, parse, validate } = yoga.getEnveloped({
				...ctx,
				req: ctx.extra.request,
				socket: ctx.extra.socket,
				params: msg.payload
			});

			const args = {
				schema,
				operationName: msg.payload.operationName,
				document: parse(msg.payload.query),
				variableValues: msg.payload.variables,
				contextValue: await contextFactory(),
				rootValue: { execute, subscribe }
			};

			const errors = validate(args.schema, args.document);
			if (errors.length) return errors;
			return args;
		}
	},
	wsServer
);

httpServer.listen(4000);
```

Verbose but boilerplate. Once it is in place you never touch it again.

## PubSub backends

graphql-yoga's built-in `createPubSub` is in-memory. That is fine for one process. It breaks the moment you have two — a subscription registered on instance A misses a publish from instance B.

For multi-process, use **Redis pub/sub**:

```bash
npm install graphql-redis-subscriptions ioredis
```

```js
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';

const pubsub = new RedisPubSub({
	publisher: new Redis(),
	subscriber: new Redis()
});
```

Same `pubsub.publish(channel, payload)` API. Redis handles the fan-out across nodes.

For higher volume or replay needs, **NATS** or **Kafka** are options. Most apps never need them — Redis pub/sub handles tens of thousands of messages per second on commodity hardware.

<Callout type="warn">

**Redis pub/sub is fire-and-forget — no replay.** A subscriber that disconnected at 12:00 and reconnected at 12:05 sees nothing that happened in between. If your subscription needs at-least-once delivery, layer a queue (Redis Streams, NATS JetStream, Kafka) or have clients reconcile via a query on reconnect.

</Callout>

## Filtering subscriptions per subscriber

A common need: "notify only when the new post matches the subscriber's filter."

The dumb approach — one channel per filter combo — explodes fast. Better: one broad channel, filter at delivery:

```js
postPublished: {
  subscribe: async function* (_, { tags }, ctx) {
    for await (const post of ctx.pubsub.subscribe("post-published")) {
      if (!tags || tags.some(t => post.tags.includes(t))) yield post;
    }
  },
  resolve: (post) => post,
},
```

Or use the publish-time payload to address subscribers — `post-published:tag:javascript`, `post-published:tag:graphql`, and the publisher fans out to every relevant tag. Fewer filters but more channels. Pick whichever is cheaper for your cardinality.

## Auth, again, at the connection layer

Sub-protocol auth: the `connectionParams` from `connection_init` is the _only_ time clients hand you credentials. Check there:

```js
context: async ({ connectionParams }) => {
  const token = connectionParams?.authToken;
  if (!token) throw new Error("Auth required");
  return { currentUser: verifyJwt(token), pubsub };
},
```

If verification fails, the WebSocket connection is closed with an error. Subscribers without valid auth never get connected. That is far cleaner than per-message auth checks.

For long-lived connections you also need to handle **token expiry mid-session**. Two strategies: (1) close the connection at expiry, force the client to reconnect with a fresh token; (2) accept refresh tokens over a special message and rotate. Option 1 is simpler. Most clients reconnect transparently.

## Subscriptions and DataLoader

Each emitted event runs a fresh execution — fresh resolvers, fresh DataLoader instances. So per-event the loader cache is fine.

What is _not_ fine: opening a transaction or holding a DB client across the lifetime of a subscription. The connection is open for hours; do not hold a Postgres connection. Pull from the pool only inside resolvers, release immediately.

## Heartbeats, reconnects, and dropped sockets

WebSockets get half-closed. The TCP connection is gone but neither side knows because no traffic flows. Without heartbeats, the server thinks the subscription is alive and burns memory; the client thinks it is connected and shows stale data.

`graphql-ws` server supports `keepAlive` — periodic pings every N seconds. Set it to 30s or less. Clients ack; if no ack, the server drops the connection.

```js
useServer({ ... }, wsServer, /* keepAlive */ 12_000);
```

Reconnects are the client's job. The `graphql-ws` client library supports `retryAttempts` and exponential backoff; most apps need this configured.

## nginx in front of WebSockets

nginx must be configured for WebSocket upgrade — without it, the protocol switch fails:

```nginx
location /graphql {
  proxy_pass http://127.0.0.1:4000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";

  proxy_read_timeout 3600s;     # long-lived
  proxy_send_timeout 3600s;
}
```

Default nginx timeouts (60s) close subscriptions after a minute. The two long timeouts here are essential. Heartbeats also keep the connection looking active to nginx.

## When to use subscriptions — and when not to

**Use them when:**

- A small set of users (single-digit thousands) need realtime updates on a small set of channels.
- Latency matters — sub-second push is the requirement.
- The data is read-mostly: subscriptions deliver, no client-side commands flow back.

**Don't use them for:**

- Mass broadcast to millions. Use a CDN or push notifications.
- Heavy bidirectional control flow. Use plain WebSockets or gRPC streaming.
- Eventual consistency where polling every 5s is fine. Polling is simpler, debuggable, and cacheable.

A subscription is a feature, not a default. Many teams ship beautiful realtime UIs without ever opening a WebSocket — they poll. If your data changes once a minute, polling is correct.

## Recap

- Subscriptions are async iterators over a pub/sub channel, exposed as a GraphQL field.
- Transport is `graphql-ws` over a WebSocket. Auth in `connection_init`, once per connection.
- In-memory `createPubSub` for one process; Redis pub/sub for many. No replay — layer a queue if you need it.
- Filter at delivery time for fine-grained subscriptions; fan-out by channel for coarse ones.
- Heartbeats are mandatory. nginx needs `proxy_read_timeout` raised and Upgrade headers set.
- Don't hold a DB connection across a subscription's lifetime. Fetch inside resolvers, release fast.
- Subscriptions are not a replacement for polling. Use them when realtime is a real requirement.

Next: [Production hardening and self-host](/notes/graphql/10-production) — depth and complexity limits, persisted queries, federation overview, and the full deploy behind nginx.

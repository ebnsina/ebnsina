---
title: 'WebSockets-এর উপর Subscriptions'
subtitle: 'Subscription হলো realtime query — client একটা long-lived connection খোলে আর server ঘটনা ঘটার সাথে সাথে event push করে। query আর mutation-এর তুলনায় ভিন্ন transport, ভিন্ন lifecycle, ভিন্ন failure mode।'
chapter: 9
level: 'advanced'
readingTime: '13 মিনিট'
topics: ['graphql', 'subscriptions', 'websockets', 'realtime', 'pubsub']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Query আর mutation হলো HTTP-এর উপর request-response। Subscription হলো একটা খোলা pipe — client বলে "আমি এই org-এর post-published event নিয়ে আগ্রহী" আর server সেগুলো ঘটার সাথে সাথে পৌঁছে দেয়। transport হলো **WebSockets**, protocol হলো **graphql-ws**, আর lifecycle একটা সাধারণ request-এর চেয়ে অনেক দীর্ঘ।

এই chapter graphql-yoga-তে subscription end-to-end ship করে, schema থেকে nginx পর্যন্ত, একটা বাস্তব PubSub system সহ। শেষে তোমার কাছে একটা notification feature থাকবে যা connected client-দের তাৎক্ষণিকভাবে update করে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা GraphQL subscription অনেকটা খবরের কাগজ subscribe করার মতো — এটা যখন ছাপা হয় তখন আসে, তুমি যখন চাও তখন নয়।

</Callout>

## গল্পে বুঝি

বিরুনি ক্রিকেট-পাগল মানুষ। আগে যা করত — খেলার দিন প্রতি আধ ঘণ্টা পর পর শহরের খবরের কাগজের অফিসে হেঁটে গিয়ে জিজ্ঞেস করত, "নতুন কোনো স্কোর এসেছে?" বেশিরভাগ সময় উত্তর, "না, এখনো কিছু আসেনি।" ফিরে আসত, আবার একটু পর গিয়ে আবার জিজ্ঞেস করত। সারাদিন এই আসা-যাওয়াতেই শেষ, তবু প্রতিবার জিজ্ঞেস করা ছাড়া সে জানতে পারত না কিছু বদলেছে কি না।

একদিন অফিসের কেরানি সিনা তাকে বুদ্ধি দিল — "এভাবে বারবার এসো না। একবার এখানে তোমার নাম লিখিয়ে দাও, শুধু ক্রিকেটের স্কোরের জন্য। তারপর যতবার নতুন বুলেটিন আসবে, আমার রানার সঙ্গে সঙ্গে তোমার দরজায় সেটা পৌঁছে দিয়ে আসবে। তোমাকে আর একবারও হাঁটতে হবে না।" বিরুনি একবার নাম লিখিয়ে দিল, আর সেদিন থেকে প্রতিটা নতুন স্কোর — যখনই ঘটছে তখনই — রানার তার দরজায় দিয়ে যেতে লাগল। খেলা শেষ হলে সে শুধু বলে দিল, "আর দরকার নেই," আর ব্যবস্থাটা বন্ধ হয়ে গেল।

এই গল্পটাই আসলে একটা GraphQL **subscription**। বারবার অফিসে গিয়ে "নতুন খবর আছে?" জিজ্ঞেস করাটা হলো সাধারণ **query** — এক-একবারের request-response, প্রতিবার নিজে থেকে জিজ্ঞেস করতে হয়। একবার নাম লিখিয়ে দেওয়াটা হলো একটা **topic**-এ subscribe করা (এখানে "ক্রিকেটের স্কোর"), অফিসের সঙ্গে ওই স্থায়ী ব্যবস্থাটা হলো **persistent WebSocket connection**, আর রানারের প্রতিটা বুলেটিন ঘটামাত্র দিয়ে যাওয়াটাই server-এর **real-time push**। "আর দরকার নেই" বলাটা subscription বন্ধ করা। বাস্তবে ঠিক এভাবেই live cricket score, chat message, বা notification client-এর কাছে পৌঁছে — client একবার subscribe করে, তারপর server নিজে থেকে update push করতে থাকে, বারবার query করার দরকার হয় না।

## একটা subscription দেখতে কেমন

```graphql
type Subscription {
	postPublished(orgId: ID!): Post!
}
```

একটা subscription field একটা generator: এটা সময়ের সাথে শূন্য বা একাধিক value yield করে। প্রতিটি yield করা value একটা single GraphQL execution — একই selection set, একই resolver tree, কিন্তু event payload-টা root হিসেবে।

একটা client একই query syntax দিয়ে subscribe করে:

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

এটা একটা WebSocket খোলে, subscription message পাঠায়, socket-এর উপর JSON হিসেবে event-এর একটা stream পায়। WebSocket বন্ধ হলে (client অন্য জায়গায় গেছে, network মরে গেছে, server restart হয়েছে), subscription শেষ হয়।

## graphql-ws protocol

GraphQL-এর জন্য দুটো WebSocket protocol আছে: `subscriptions-transport-ws` (legacy, deprecated) আর `graphql-ws` (current)। **graphql-ws** ব্যবহার করো। client আর server দুটোই এটা support করে; graphql-yoga এটা সহ আসে।

wire protocol, সরল করে:

```
Client → Server: { type: "connection_init", payload: { authToken: "..." } }
Server → Client: { type: "connection_ack" }

Client → Server: { type: "subscribe", id: "1", payload: { query, variables } }
Server → Client: { type: "next", id: "1", payload: { data: { ... } } }
Server → Client: { type: "next", id: "1", payload: { data: { ... } } }
...
Client → Server: { type: "complete", id: "1" }
```

`connection_init` হলো যেখানে তুমি auth (token, session cookie) পাঠাও। server এটা প্রতি connection-এ একবার validate করে এবং WebSocket-এর সারা জীবনের জন্য ফলাফলটা রাখে। `subscribe` একটা stream register করে; `next` প্রতিটি delivery; `complete` এটা শেষ করে। Error-ও explicit message।

## Server-side: resolver একটা async iterator

Subscription resolver কোনো value return করে না — এটা একটা **async iterator** return করে যা executor consume করে:

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

pattern-টা হলো `{ subscribe, resolve }`। `subscribe` async iterator return করে; `resolve` প্রতিটি emit হওয়া event-এ একবার চলে response build হওয়ার আগে payload-কে রূপ দিতে (বেশিরভাগ সময় তুমি payload যেমন আছে তেমনই return করো)।

তারপর তোমার code-এর যেকোনো জায়গায় (একটা mutation, একটা webhook handler, একটা background job):

```js
publishPost: async (_, { id }, ctx) => {
  const post = await markPublished(ctx.db, id);
  pubsub.publish(`post-published:${post.org_id}`, post);
  return post;
},
```

ওই `pubsub.publish` post-টাকে ওই channel-এর প্রতিটি active subscriber-এ fan out করে। executor post-টাকে root হিসেবে নিয়ে subscription-এর selection set চালায়, WebSocket-এর উপর data return করে।

## WebSockets-এর জন্য graphql-yoga wiring

graphql-yoga HTTP handle করে। WebSockets-এর জন্য `graphql-ws` server-টাকে একই HTTP server-এ bind করতে হয়:

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

লম্বা কিন্তু boilerplate। একবার বসিয়ে দিলে আর কখনো ছুঁতে হয় না।

## PubSub backends

graphql-yoga-র built-in `createPubSub` in-memory। এক process-এর জন্য সেটা ঠিক আছে। কিন্তু দুটো হওয়ার মুহূর্তেই ভেঙে পড়ে — instance A-তে register হওয়া একটা subscription instance B থেকে আসা একটা publish মিস করে।

Multi-process-এর জন্য **Redis pub/sub** ব্যবহার করো:

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

একই `pubsub.publish(channel, payload)` API। Redis node-গুলোর মধ্যে fan-out সামলায়।

আরও বেশি volume বা replay দরকার হলে **NATS** বা **Kafka** option। বেশিরভাগ app-এর এগুলো কখনো লাগে না — Redis pub/sub commodity hardware-এ প্রতি সেকেন্ডে হাজার হাজার message সামলায়।

<Callout type="warn">

**Redis pub/sub fire-and-forget — কোনো replay নেই।** যে subscriber 12:00-এ disconnect হয়ে 12:05-এ reconnect হলো সে এর মাঝে যা ঘটেছিল কিছুই দেখে না। তোমার subscription-এর at-least-once delivery দরকার হলে একটা queue (Redis Streams, NATS JetStream, Kafka) layer করো বা reconnect-এ client-দের একটা query দিয়ে reconcile করাও।

</Callout>

## প্রতি subscriber-এ subscription filter করা

একটা common প্রয়োজন: "নতুন post subscriber-এর filter-এর সাথে মিললে তবেই notify করো।"

বোকা approach — প্রতিটি filter combo-র জন্য একটা channel — দ্রুত বিস্ফোরিত হয়। ভালো: একটা broad channel, delivery-তে filter করো:

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

অথবা subscriber-দের address করতে publish-time payload ব্যবহার করো — `post-published:tag:javascript`, `post-published:tag:graphql`, আর publisher প্রতিটি প্রাসঙ্গিক tag-এ fan out করে। কম filter কিন্তু বেশি channel। তোমার cardinality-র জন্য যেটা সস্তা সেটা বেছে নাও।

## Auth, আবার, connection layer-এ

Sub-protocol auth: `connection_init` থেকে আসা `connectionParams` হলো _একমাত্র_ সময় যখন client তোমাকে credential দেয়। সেখানেই check করো:

```js
context: async ({ connectionParams }) => {
  const token = connectionParams?.authToken;
  if (!token) throw new Error("Auth required");
  return { currentUser: verifyJwt(token), pubsub };
},
```

verification fail করলে WebSocket connection একটা error সহ বন্ধ হয়ে যায়। valid auth ছাড়া subscriber কখনো connect হয় না। এটা per-message auth check-এর চেয়ে অনেক পরিচ্ছন্ন।

long-lived connection-এর জন্য তোমাকে **token expiry mid-session**-ও handle করতে হয়। দুটো strategy: (1) expiry-তে connection বন্ধ করে দাও, client-কে fresh token দিয়ে reconnect করতে বাধ্য করো; (2) একটা special message-এর উপর refresh token গ্রহণ করে rotate করো। Option 1 সরল। বেশিরভাগ client স্বচ্ছভাবে reconnect করে।

## Subscriptions আর DataLoader

প্রতিটি emit হওয়া event একটা fresh execution চালায় — fresh resolver, fresh DataLoader instance। তাই per-event loader cache ঠিক আছে।

যা _ঠিক নয়_: একটা subscription-এর সারা জীবন ধরে একটা transaction খোলা রাখা বা একটা DB client ধরে রাখা। connection ঘণ্টার পর ঘণ্টা খোলা থাকে; একটা Postgres connection ধরে রেখো না। শুধু resolver-এর ভেতরে pool থেকে টেনে নাও, সঙ্গে সঙ্গে release করো।

## Heartbeat, reconnect, আর ঝরে যাওয়া socket

WebSocket half-closed হয়ে যায়। TCP connection চলে গেছে কিন্তু কোনো পক্ষ জানে না কারণ কোনো traffic চলছে না। heartbeat ছাড়া server ভাবে subscription জীবিত আর memory পোড়ায়; client ভাবে সে connected আর বাসি data দেখায়।

`graphql-ws` server `keepAlive` support করে — প্রতি N সেকেন্ডে periodic ping। এটা 30s বা তার কম সেট করো। client ack দেয়; ack না এলে server connection ফেলে দেয়।

```js
useServer({ ... }, wsServer, /* keepAlive */ 12_000);
```

Reconnect client-এর কাজ। `graphql-ws` client library `retryAttempts` আর exponential backoff support করে; বেশিরভাগ app-এর এটা configure করা দরকার।

## WebSockets-এর সামনে nginx

nginx-কে WebSocket upgrade-এর জন্য configure করতে হবে — এটা ছাড়া protocol switch fail করে:

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

default nginx timeout (60s) এক মিনিট পর subscription বন্ধ করে দেয়। এখানকার দুটো long timeout অপরিহার্য। heartbeat-ও connection-টাকে nginx-এর কাছে active দেখায়।

## Subscription কখন ব্যবহার করবে — আর কখন নয়

**যখন ব্যবহার করবে:**

- অল্প কিছু user (single-digit হাজার) অল্প কিছু channel-এ realtime update চায়।
- Latency গুরুত্বপূর্ণ — sub-second push-ই প্রয়োজন।
- data read-mostly: subscription deliver করে, কোনো client-side command ফিরে আসে না।

**যেসবে ব্যবহার কোরো না:**

- লক্ষ লক্ষ-এ mass broadcast। একটা CDN বা push notification ব্যবহার করো।
- ভারী bidirectional control flow। plain WebSocket বা gRPC streaming ব্যবহার করো।
- eventual consistency যেখানে প্রতি 5s-এ polling ঠিক আছে। Polling সরল, debuggable, আর cacheable।

Subscription একটা feature, default নয়। অনেক team WebSocket না খুলেই সুন্দর realtime UI ship করে — তারা poll করে। তোমার data মিনিটে একবার বদলালে, polling-ই সঠিক।

## সারসংক্ষেপ

- Subscription একটা pub/sub channel-এর উপর async iterator, একটা GraphQL field হিসেবে exposed।
- Transport হলো WebSocket-এর উপর `graphql-ws`। Auth `connection_init`-এ, প্রতি connection-এ একবার।
- এক process-এর জন্য in-memory `createPubSub`; অনেকের জন্য Redis pub/sub। কোনো replay নেই — দরকার হলে একটা queue layer করো।
- fine-grained subscription-এর জন্য delivery-time-এ filter করো; coarse-এর জন্য channel অনুযায়ী fan-out।
- Heartbeat বাধ্যতামূলক। nginx-এর `proxy_read_timeout` বাড়ানো আর Upgrade header সেট করা দরকার।
- একটা subscription-এর সারা জীবন ধরে DB connection ধরে রেখো না। resolver-এর ভেতরে fetch করো, দ্রুত release করো।
- Subscription polling-এর বিকল্প নয়। realtime সত্যিকারের প্রয়োজন হলে তবেই ব্যবহার করো।

পরবর্তী: [Production hardening এবং self-host](/notes/graphql/10-production) — depth ও complexity limit, persisted query, federation overview, আর nginx-এর পেছনে পুরো deploy।

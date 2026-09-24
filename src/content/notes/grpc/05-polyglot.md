---
title: 'Polyglot — Node আর Python client'
subtitle: 'একই `.proto`, তিন ভাষা। gRPC-এর পুরো বক্তব্যই হলো wire শেয়ার্ড আর codegen ফ্রি। একবার করে ফেললে এটা আর জাদু মনে হয় না।'
chapter: 5
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['grpc', 'node', 'python', 'codegen', 'polyglot']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

বাগদাদের পাসপোর্ট অফিসে একটাই কাউন্টার, একজন কেরানি — খোয়ারিজমি। সারাদিন লাইনে দাঁড়ায় নানা দেশের মানুষ। সিনার মাতৃভাষা বাংলা, ফাতিমা বলেন আরবি, আর বিরুনি বলেন ফারসি। কেরানি এদের কারও ভাষাই জানেন না। তবু অফিসে ঝামেলা হয় না, কারণ সবার হাতে একই স্ট্যান্ডার্ড ফর্ম — একই টেমপ্লেট থেকে ছাপা, ঘর নম্বর ১ নাম, ২ জন্মতারিখ, ৩ ঠিকানা। কেরানি শুধু ঘর নম্বর দেখেই কাজ সারেন, কে কোন ভাষায় ভাবছে তাতে তাঁর কিছু যায়-আসে না।

কিন্তু বাংলা-জানা সিনা তো আরবি ফর্মের ঘরগুলো নিজে বুঝবেন না। তাই অফিস প্রত্যেক ভাষার জন্য একজন করে দোভাষী বসিয়ে রেখেছে — সিনার জন্য বাংলা দোভাষী, ফাতিমার জন্য আরবি, বিরুনির জন্য ফারসি। প্রত্যেক দোভাষীকে বানানো হয়েছে ওই একই স্ট্যান্ডার্ড ফর্মের টেমপ্লেট দেখে। যে যার মাতৃভাষায় কথা বলে, দোভাষী সেই কথা তুলে দেয় ঠিক ওই একই নম্বরওয়ালা ঘরে। ফলে তিনজন তিন ভাষার মানুষ একই কেরানির কাছে গিয়ে হুবহু একই সেবা পান।

গল্পটাই polyglot gRPC। ওই একটা স্ট্যান্ডার্ড ফর্মের টেমপ্লেট হলো শেয়ার্ড `.proto` contract — সত্যের একমাত্র উৎস। প্রত্যেক ভাষার আলাদা দোভাষী হলো সেই ভাষার জন্য generate করা stub (Node, Python, Go client নিজ নিজ ভাষায় stub বানায়)। আর একজন কেরানি হলো একটাই gRPC service, যে সব client-কে একইভাবে সামলায়। বাস্তবে ঠিক এভাবেই একটা Go service-এর সামনে Node আর Python team আলাদা SDK না লিখে, একই `.proto` থেকে যার যার ভাষার stub generate করে নেয় — নতুন ভাষা যোগ করা তাই rewrite নয়, স্রেফ একটা code-generation ধাপ।

অধ্যায় 4-এর Go server-এর কে কল করছে তা নিয়ে কোনো মাথাব্যথা নেই। wire হলো HTTP/2 আর protobuf — দুটোই ভাষা-নিরপেক্ষ। এই অধ্যায় একই `.proto` থেকে Node আর Python-এ client generate করে আর চালু Go server-কে কল করে।

আসল কথা এই নয় যে Node আর Python বিশেষ কিছু। আসল কথা হলো **একটা gRPC service-এ নতুন ভাষা যোগ করা একটা code-generation ধাপ, rewrite নয়**। এটা মিশ্র দল নিয়ে আপনি কী ধরনের service বানাতে পারেন সেটাই বদলে দেয়।

<Callout type="info">

**বাস্তব জীবনের উপমা**

Polyglot gRPC হলো জাতিসংঘের দোভাষীর মতো — দুই পক্ষ ভিন্ন ভাষায় কথা বলে কিন্তু একটা শেয়ার্ড standard-এর মাধ্যমে নিখুঁতভাবে যোগাযোগ করে।

</Callout>

## "polyglot" আসলে আপনাকে কী এনে দেয়

তিনটা জিনিস:

1. **কোনো হাতে-লেখা client SDK নেই।** একটা Python data team-এর আপনার Go service কল করা দরকার? তারা আপনার `.proto` `protoc` করে আর method কল করে। আপনি কোনো Python SDK maintain করেন না।
2. **wire জুড়ে type safety।** দুই পক্ষই schema জানে। server-এ একটা field-এর নাম বদলালে client-এ codegen build time-এ ভেঙে যায়, load-এর নিচে runtime-এ নয়।
3. **schema-ই source of truth।** documentation, test, code, আর wire — সবই একই `.proto` থেকে আসে। ভাষাগুলোর মধ্যে drift গঠনগতভাবেই অসম্ভব।

উল্টো দিক: প্রতিটা দলকে proto repo-র সঙ্গে তাল মিলিয়ে চলতে হবে। যে দল একবার `.proto` কপি করে আর কখনো আপডেট করে না, তারা কোনো সতর্কতা-ব্যবস্থা ছাড়া একটা manual SDK-তে ফিরে গেছে।

## proto repo প্যাটার্ন

সবচেয়ে পরিচ্ছন্ন সেটআপ: `.proto` ফাইলের জন্য একটা git repo, প্রতিটা ভাষা সেটা consume করে।

```
protos/
├── buf.yaml
├── buf.gen.yaml
└── proto/
    └── user/v1/user.proto
```

proto repo-র CI ভাষা-ভিত্তিক artefact generate আর publish করে:

- **Go module** — repo-তে `go.mod`, consumer-রা `go get example.com/protos/gen/go/user/v1`।
- **npm package** — একটা private registry-তে publish করা বা `git+ssh` দিয়ে install করা।
- **Python wheel** — একই ধারণা।

`buf` এটার জন্যই বানানো হয়েছিল। এই অধ্যায়ের জন্য publish করার ধাপটা বাদ দিন; আমরা লোকালি generate করব আর অধ্যায় 4-এর Go server-কে কল করব।

## Node client

Node **`@grpc/grpc-js`** (pure JS, কোনো native dep নেই) সঙ্গে `@grpc/proto-loader` (runtime-এ `.proto` parse করে — কোনো codegen ধাপ নেই) বা `protoc-gen-grpc-web` (`.proto`-কে TypeScript-এ compile করে) ব্যবহার করে। প্রথম পদ্ধতিটা শুরু করতে সবচেয়ে দ্রুত।

```bash
mkdir node-client && cd node-client
npm init -y
npm install @grpc/grpc-js @grpc/proto-loader
mkdir proto/user/v1
# copy user.proto from chapter 4 into proto/user/v1/user.proto
```

```js
// client.js
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const packageDef = protoLoader.loadSync(resolve(__dirname, 'proto/user/v1/user.proto'), {
	keepCase: false, // converts snake_case → camelCase
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
	includeDirs: [resolve(__dirname, 'proto')]
});

const proto = grpc.loadPackageDefinition(packageDef).user.v1;

const client = new proto.UserService('localhost:9000', grpc.credentials.createInsecure());

function rpc(method, req) {
	return new Promise((res, rej) => {
		client[method](req, (err, val) => (err ? rej(err) : res(val)));
	});
}

const got = await rpc('GetUser', { id: 1 });
console.log('got user:', got);

const created = await rpc('CreateUser', { name: 'Habiba', email: 'habiba@example.com' });
console.log('created:', created);

const list = await rpc('ListUsers', {});
console.log('count:', list.users.length);
```

```bash
node client.js
# got user: { id: '1', name: 'Sumayya', email: 'sumayya@example.com' }
# created: { id: '4', name: 'Habiba', email: 'habiba@example.com' }
# count: 4
```

Node client সম্পর্কে দুটো জিনিস জানার মতো:

**1. `keepCase: false` হলো ডিফল্ট আর আপনি প্রায় সবসময়ই এটা চান।** proto field-গুলো `snake_case`; idiomatic JS হলো `camelCase`। loader রূপান্তর করে। এই flag ছাড়া আপনি স্বাভাবিক `pageToken`-এর বদলে `client.GetUser({id: 1, page_token: ""})` লেখেন।

**2. Callback-ই native API।** `util.promisify` বা উপরের `rpc`-এর মতো একটা wrapper দিয়ে সেগুলোকে promisify করুন। এর সঙ্গে লড়বেন না।

TypeScript-এর জন্য **`buf` + `protoc-gen-es` + `connect-es`**-এ যান (বা plain gRPC-এর জন্য `ts-proto`)। আপনি strict type পান। `@grpc/proto-loader` dynamic; type-গুলো ঢিলেঢালা।

## Python client

Python codegen-এর জন্য **`grpcio`** সঙ্গে **`grpcio-tools`** ব্যবহার করে।

```bash
mkdir py-client && cd py-client
python3 -m venv .venv && source .venv/bin/activate
pip install grpcio grpcio-tools
mkdir -p proto/user/v1
# copy user.proto into proto/user/v1/user.proto
```

Python কোড generate করুন:

```bash
python -m grpc_tools.protoc \
  -I proto \
  --python_out=. \
  --grpc_python_out=. \
  proto/user/v1/user.proto
```

এটা `proto/user/v1/user_pb2.py` (messages) আর `proto/user/v1/user_pb2_grpc.py` (service stubs) বের করে।

```python
# client.py
import grpc

from proto.user.v1 import user_pb2, user_pb2_grpc

with grpc.insecure_channel("localhost:9000") as channel:
    stub = user_pb2_grpc.UserServiceStub(channel)

    got = stub.GetUser(user_pb2.GetUserRequest(id=1))
    print("got user:", got.name, got.email)

    created = stub.CreateUser(user_pb2.CreateUserRequest(
        name="Asma",
        email="asma@example.com",
    ))
    print("created id:", created.id)

    listed = stub.ListUsers(user_pb2.ListUsersRequest())
    print("count:", len(listed.users))
```

```bash
python client.py
# got user: Sumayya sumayya@example.com
# created id: 5
# count: 5
```

Python codegen-এর একটা খুঁত আছে: import-গুলো proto root থেকে absolute path, তাই generated `user_pb2_grpc.py` করে `import user_pb2`। আপনার proto যদি একটা sub-package-এ থাকে, তাহলে আপনাকে import path adjust করতে হবে বা হাতে relative import ব্যবহার করতে হবে। 2025+-এ সবচেয়ে পরিচ্ছন্ন fix হলো `python` plugin-কে `paths=source_relative`-সমতুল্য setting-এ সেট করে **`buf generate`**, বা type stub-এর জন্য `protoc-gen-mypy`।

Python-এ type safety-র জন্য: `pip install protobuf-mypy-plugin` বা **`betterproto`** ব্যবহার করুন, একটা third-party generator যা protobuf-এর ক্লাসিক API-এর বদলে dataclass-ধাঁচের message বের করে। adopt করতে পারলে পরিচ্ছন্নতর।

## তিনটাকেই একসঙ্গে কল করা

Go server চালান (অধ্যায় 4)। এক terminal-এ:

```bash
cd mygrpc
go run ./cmd/server
```

দ্বিতীয় terminal-এ, Go client:

```bash
go run ./cmd/client
# got user: Sumayya <sumayya@example.com>
```

তৃতীয় terminal, Node:

```bash
cd ../node-client
node client.js
# got user: { id: '1', ... }
```

চতুর্থ terminal, Python:

```bash
cd ../py-client
python client.py
# got user: Sumayya sumayya@example.com
```

তিনটাই একই server-এ পৌঁছায়, একই ডেটা পায়। যেহেতু wire-এ protobuf আছে, তাই ID-গুলো Node-এ string হিসেবে আসে (JS number নিরাপদে int64 প্রকাশ করতে পারে না), Python-এ string (যেখানে সেগুলো int-এ parse হয় কারণ ভাষাটায় bignum আছে), আর Go-তে `int64`।

<Callout type="warn">

**int64 + JavaScript = footgun।** JS-এ number হলো 64-bit float; 2^53-এর ওপরের integer precision হারায়। Node loader option `longs: String` int64 field-কে string হিসেবে আসতে দেয় — সাবধানে সামলান নয়তো আপনার ID scale-এ গিয়ে নিঃশব্দে corrupt হবে। যেসব নতুন API-তে JS client আছে, তাদের জন্য ID-এর জন্য `string` পছন্দ করুন আর সমস্যাটা পুরোপুরি এড়িয়ে যান।

</Callout>

## Server reflection — ভাষা-নিরপেক্ষ discovery

অধ্যায় 4-এ আমরা server reflection enable করেছিলাম। সেটা যেকোনো client-এর জন্য একইভাবে কাজ করে। Node থেকে:

```js
const reflection = await rpc("__file_descriptor", ...); // not standard; needs a reflection client lib
```

বাস্তবে সবচেয়ে সহজ reflection client হলো `grpcurl`। programmatic ব্যবহারের জন্য `nice-grpc-reflection` (Node) বা `grpcio-reflection` (Python)-এর মতো library সেটা সামলায়।

একটা polyglot সেটআপে reflection মানে একটা Node client কোনো code regen ছাড়াই নতুন RPC আবিষ্কার আর কল করতে পারে — tooling, script, আর admin UI-এর জন্য সুবিধাজনক।

## ভাষারা যখন একমত হয় না

জানার মতো তিনটা সত্যিকারের পার্থক্য:

**1. Default value।** proto3-এর "wire-এ কোনো default নেই" তিনটার জন্যই কাজ করে। কিন্তু Node unset int field-এর জন্য `0` আর unset string-এর জন্য `""` return করে — Go-এর মতোই। Python (`grpcio`) একই করে। `optional` field (proto3.15+) সব জায়গায় explicit `HasField()` পায়।

**2. Streaming।** তিনটাই চার রকমের call shape সাপোর্ট করে। async iteration প্যাটার্ন ভিন্ন — Node ব্যবহার করে `for await (const msg of stream)`, Python ব্যবহার করে `for msg in stream:` (synchronous) বা `grpc.aio` সহ `async for`। Go একটা loop-এ `stream.Recv()` ব্যবহার করে। একই wire, ভিন্ন ergonomics।

**3. Error code।** প্রতিটা ভাষা একই `codes.NotFound`, `codes.InvalidArgument` ইত্যাদি mapping প্রকাশ করে। server যা-ই throw করুক (অধ্যায় 7), সব client একই code দেখে।

## ভাষা জুড়ে versioning

proto repo-ই source of truth ধরে রাখে। ভাষারা নির্দিষ্ট tagged version consume করে:

- Go: `go get example.com/protos@v1.4.2`
- Node: `npm install @example/protos@1.4.2`
- Python: `pip install example-protos==1.4.2`

proto repo bump করা একটা release event। CI নতুন artefact publish করে। প্রতিটা ভাষা দল প্রস্তুত হলে consume করে। Backward-compatible পরিবর্তন (field যোগ করা) মানে পুরনো client version এখনও নতুন server-এর বিরুদ্ধে কাজ করে।

যখন আপনাকে compatibility ভাঙতেই হবে, একটা নতুন package (`user.v2`) ব্যবহার করুন। দুটোই deploy করা থাকে; client-রা সময়ের সঙ্গে migrate করে। অধ্যায় 2-এর evolution rule-গুলোই contract।

## রিক্যাপ

- একটা `.proto`, তিন ভাষা — codegen-ই সংযোগকারী কলা।
- Node: dynamic-এর জন্য `@grpc/grpc-js` + `@grpc/proto-loader`, বা typed-এর জন্য `connect-es`/`ts-proto`।
- Python: ক্যানোনিকাল codegen-এর জন্য `grpcio` + `grpcio-tools`, বা পরিচ্ছন্নতর ergonomics-এর জন্য `betterproto`।
- `buf` সহ একটা proto repo হলো প্রোডাকশন প্যাটার্ন; CI প্রতি-ভাষা artefact publish করে।
- তিনটাই একই wire-এ কথা বলে। int64 + JS-এর যত্ন লাগে; বাকি সব কেবল কাজ করে যায়।
- Reflection যেকোনো ভাষার client-কে rebuild ছাড়া service আবিষ্কার করতে দেয়।
- tag দিয়ে versioning — ভাষার package নির্দিষ্ট proto-repo tag consume করে।

পরবর্তী: [Streaming RPC](/notes/grpc/06-streaming) — server, client, আর bidirectional stream, যেখানে gRPC আর REST-এর মতো দেখতে থাকে না।

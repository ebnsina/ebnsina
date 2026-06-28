---
title: 'Polyglot — Node and Python clients'
subtitle: 'The same `.proto`, three languages. The whole pitch of gRPC is that the wire is shared and the codegen is free. Once you have done it once it stops feeling like magic.'
chapter: 5
level: 'intermediate'
readingTime: '11 min'
topics: ['grpc', 'node', 'python', 'codegen', 'polyglot']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

The Go server from chapter 4 does not care who is calling it. The wire is HTTP/2 and protobuf — both language-neutral. This chapter generates clients in Node and Python from the same `.proto` and calls the running Go server.

The point is not that Node and Python are special. It is that **adding a new language to a gRPC service is a code-generation step, not a rewrite**. That changes what kinds of services you can build with mixed teams.

<Callout type="info">

**Real-World Analogy**

Polyglot gRPC is like a UN interpreter — both sides speak different languages but communicate perfectly through a shared standard.

</Callout>

## What "polyglot" actually buys you

Three things:

1. **No hand-written client SDKs.** A Python data team needs to call your Go service? They `protoc` your `.proto` and call methods. You do not maintain a Python SDK.
2. **Type safety across the wire.** Both ends know the schema. Renaming a field on the server breaks codegen on the client at build time, not at runtime under load.
3. **Schema is the source of truth.** Documentation, tests, code, and the wire all derive from the same `.proto`. Drift between languages is impossible by construction.

The flip side: every team must keep up with the proto repo. A team that copies the `.proto` once and never updates it is back to a manual SDK with no warning system.

## The proto repo pattern

The cleanest setup: one git repo for `.proto` files, every language consumes it.

```
protos/
├── buf.yaml
├── buf.gen.yaml
└── proto/
    └── user/v1/user.proto
```

The proto repo's CI generates and publishes language artefacts:

- **Go module** — `go.mod` in the repo, consumers `go get example.com/protos/gen/go/user/v1`.
- **npm package** — published to a private registry or installed via `git+ssh`.
- **Python wheel** — same idea.

This is what `buf` was made for. Skip the publishing step for this chapter; we will generate locally and call the Go server from chapter 4.

## Node client

Node uses **`@grpc/grpc-js`** (pure JS, no native deps) plus `@grpc/proto-loader` (parses `.proto` at runtime — no codegen step) or `protoc-gen-grpc-web` (compiles `.proto` to TypeScript). The first approach is fastest to get started.

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

Two things worth knowing about the Node client:

**1. `keepCase: false` is the default and you almost always want it.** Proto fields are `snake_case`; idiomatic JS is `camelCase`. The loader converts. Without this flag, you write `client.GetUser({id: 1, page_token: ""})` instead of the natural `pageToken`.

**2. Callbacks are the native API.** Promisify them with `util.promisify` or a wrapper like `rpc` above. Don't fight it.

For TypeScript, switch to **`buf` + `protoc-gen-es` + `connect-es`** (or `ts-proto` for plain gRPC). You get strict types. `@grpc/proto-loader` is dynamic; types are loose.

## Python client

Python uses **`grpcio`** plus **`grpcio-tools`** for codegen.

```bash
mkdir py-client && cd py-client
python3 -m venv .venv && source .venv/bin/activate
pip install grpcio grpcio-tools
mkdir -p proto/user/v1
# copy user.proto into proto/user/v1/user.proto
```

Generate Python code:

```bash
python -m grpc_tools.protoc \
  -I proto \
  --python_out=. \
  --grpc_python_out=. \
  proto/user/v1/user.proto
```

This emits `proto/user/v1/user_pb2.py` (messages) and `proto/user/v1/user_pb2_grpc.py` (service stubs).

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

The Python codegen has a quirk: imports are absolute paths from the proto root, so the generated `user_pb2_grpc.py` does `import user_pb2`. If your proto lives in a sub-package, you need to adjust the import path or use relative imports manually. The cleanest fix in 2025+ is **`buf generate`** with the `python` plugin set to `paths=source_relative`-equivalent settings, or `protoc-gen-mypy` for type stubs.

For type safety in Python: `pip install protobuf-mypy-plugin` or use **`betterproto`**, a third-party generator that emits dataclass-style messages instead of protobuf's classic API. Cleaner if you can adopt it.

## Calling all three at once

Run the Go server (chapter 4). In one terminal:

```bash
cd mygrpc
go run ./cmd/server
```

In a second terminal, the Go client:

```bash
go run ./cmd/client
# got user: Sumayya <sumayya@example.com>
```

Third terminal, Node:

```bash
cd ../node-client
node client.js
# got user: { id: '1', ... }
```

Fourth terminal, Python:

```bash
cd ../py-client
python client.py
# got user: Sumayya sumayya@example.com
```

All three hit the same server, get the same data. Because protobuf is on the wire, IDs come through as strings in Node (JS numbers can't safely represent int64), strings in Python (where they parse to ints because the language has bignums), and `int64` in Go.

<Callout type="warn">

**int64 + JavaScript = footgun.** Numbers in JS are 64-bit floats; integers above 2^53 lose precision. The Node loader option `longs: String` makes int64 fields come through as strings — handle them with care or your IDs will silently corrupt at scale. For new APIs that have JS clients, prefer `string` for IDs and avoid the issue entirely.

</Callout>

## Server reflection — language-agnostic discovery

In chapter 4 we enabled server reflection. That works the same way for any client. From Node:

```js
const reflection = await rpc("__file_descriptor", ...); // not standard; needs a reflection client lib
```

Practically, the easiest reflection client is `grpcurl`. For programmatic use, libraries like `nice-grpc-reflection` (Node) or `grpcio-reflection` (Python) handle it.

In a polyglot setup, reflection means a Node client can discover and call new RPCs without any code regen — convenient for tooling, scripts, and admin UIs.

## When languages disagree

Three real differences to know:

**1. Default values.** proto3's "no defaults on the wire" works for all three. But Node returns `0` for unset int fields and `""` for unset strings — same as Go. Python (`grpcio`) does the same. `optional` fields (proto3.15+) get explicit `HasField()` everywhere.

**2. Streaming.** All three support all four call shapes. Async iteration patterns differ — Node uses `for await (const msg of stream)`, Python uses `for msg in stream:` (synchronous) or `async for` with `grpc.aio`. Go uses `stream.Recv()` in a loop. Same wire, different ergonomics.

**3. Error codes.** Every language exposes the same `codes.NotFound`, `codes.InvalidArgument`, etc. mapping. Whatever the server throws (chapter 7), all clients see the same code.

## Versioning across languages

The proto repo holds the source of truth. Languages consume specific tagged versions:

- Go: `go get example.com/protos@v1.4.2`
- Node: `npm install @example/protos@1.4.2`
- Python: `pip install example-protos==1.4.2`

Bumping the proto repo is a release event. CI publishes new artefacts. Each language team consumes when ready. Backward-compatible changes (adding fields) mean old client versions still work against new servers.

When you must break compatibility, use a new package (`user.v2`). Both are deployed; clients migrate over time. Chapter 2's evolution rules are the contract.

## Recap

- One `.proto`, three languages — codegen is the connective tissue.
- Node: `@grpc/grpc-js` + `@grpc/proto-loader` for dynamic, or `connect-es`/`ts-proto` for typed.
- Python: `grpcio` + `grpcio-tools` for canonical codegen, or `betterproto` for cleaner ergonomics.
- A proto repo with `buf` is the production pattern; CI publishes per-language artefacts.
- All three speak the same wire. int64 + JS needs care; everything else just works.
- Reflection lets clients in any language discover services without rebuilds.
- Versioning by tag — language packages consume specific proto-repo tags.

Next: [Streaming RPCs](/notes/grpc/06-streaming) — server, client, and bidirectional streams, where gRPC stops looking like REST.

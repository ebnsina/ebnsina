---
title: "Protocol Buffers"
subtitle: "Protobuf is the schema language and the wire format. Get the schema rules right and your services stay compatible for a decade. Get them wrong and one bad commit breaks every client at once."
chapter: 2
level: "beginner"
readingTime: "13 min"
topics: ["grpc", "protobuf", "proto3", "schema", "wire format"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A `.proto` file is the contract. It defines messages (data shapes) and services (RPCs). `protoc` reads the file and emits language-specific code. The wire format is decoupled — a Go server can talk to a Python client because both encode and decode the same bytes.

This chapter is the language reference plus the rules you must not break. Every protobuf horror story is one of these rules being broken in a hurry.

<Callout type="info">

**Real-World Analogy**

A protobuf schema is like a shared blueprint both sender and receiver have agreed on — no guessing what the fields mean.

</Callout>

## A real `.proto` file

```proto
syntax = "proto3";

package user.v1;

option go_package = "example.com/api/user/v1;userv1";

import "google/protobuf/timestamp.proto";

service UserService {
  rpc GetUser    (GetUserRequest)    returns (User);
  rpc CreateUser (CreateUserRequest) returns (User);
  rpc ListUsers  (ListUsersRequest)  returns (ListUsersResponse);
}

message User {
  int64 id = 1;
  string name = 2;
  string email = 3;
  Role role = 4;
  google.protobuf.Timestamp created_at = 5;
  repeated string tags = 6;
}

enum Role {
  ROLE_UNSPECIFIED = 0;
  ROLE_MEMBER = 1;
  ROLE_ADMIN = 2;
}

message GetUserRequest {
  int64 id = 1;
}

message CreateUserRequest {
  string name = 1;
  string email = 2;
  Role role = 3;
}

message ListUsersRequest {
  int32 page_size = 1;
  string page_token = 2;
}

message ListUsersResponse {
  repeated User users = 1;
  string next_page_token = 2;
}
```

Read it slowly. Every concept you need for 90% of `.proto` files is in there.

## Anatomy of a `.proto`

**`syntax = "proto3";`** — proto3, the modern dialect. proto2 is legacy; do not use it for new code.

**`package user.v1;`** — namespacing. Goes into generated code as a module/package and into the wire as part of the fully-qualified name. The `.v1` is intentional; see versioning below.

**`option go_package = "..."`** — language-specific output paths. Each language has its own `option` directives. You will see `option java_package`, `option ruby_package`, etc. in real codebases.

**`import "..."`** — pull in another `.proto`. Standard well-known types live in `google/protobuf/*.proto` (Timestamp, Duration, Empty, FieldMask, Any).

**`service`** — a set of RPCs. Each RPC has a request type and a response type. We expand on services in chapter 4.

**`message`** — a record. Fields are typed and numbered.

**`enum`** — a finite set of values. The `_UNSPECIFIED = 0` convention is mandatory; see below.

## Field numbers — the most important rule

Every field has a number. That number is the *only* thing that goes on the wire — names are stripped. So the contract is the numbers, not the names.

**The rules:**

1. **Numbers 1 through 15 are one byte.** Numbers 16 through 2047 are two bytes. Use 1–15 for the fields you serialize most often.
2. **Numbers are forever.** Once a field has a number, that number cannot be reused for any other field. Ever.
3. **Reserve numbers when you delete fields.** This is the second-most-important rule.

```proto
message User {
  reserved 4;                    // field number that used to be `phone`
  reserved "phone";              // also reserve the name to prevent reuse

  int64 id = 1;
  string name = 2;
  string email = 3;
  // 4 is reserved
  Role role = 5;
}
```

If you do not reserve, someone adds `string country = 4` next year and clients with old data send what they think is `phone` (a string of digits) into a `country` field. Garbage data, no error, silent corruption.

<Callout type="warn">

**Reserve. Always.** Deleting a field without reserving its number is the most common protobuf bug in real codebases. The wire format is forgiving; that forgiveness becomes a footgun.

</Callout>

## Scalar types

| Proto type | Go type | Notes |
|---|---|---|
| `double` | `float64` | |
| `float` | `float32` | |
| `int32` / `int64` | `int32` / `int64` | varint encoded; smaller for small values |
| `uint32` / `uint64` | `uint32` / `uint64` | unsigned varint |
| `sint32` / `sint64` | `int32` / `int64` | zigzag encoded; better for negatives |
| `fixed32` / `fixed64` | `uint32` / `uint64` | always 4 / 8 bytes; better for large random values |
| `bool` | `bool` | |
| `string` | `string` | UTF-8 |
| `bytes` | `[]byte` | arbitrary bytes |

The integer choice matters. `int64` for "user IDs" — if some IDs are large, varint costs many bytes per ID. `fixed64` for opaque large IDs (random hashes). `sint32` for "delta" values that can be negative.

## Default values

In proto3, every scalar has a default — `0` for numbers, `""` for strings, `false` for bool, empty for repeated and bytes. **Default values are not on the wire.** A `User` message with `name = ""` serializes the same way as a `User` with `name` not set.

This causes two kinds of confusion:

1. **You cannot tell "explicitly set to zero" from "unset."** A `Status status = 3` where status is `0` is indistinguishable from an unset field.
2. **Adding `optional` brings explicit presence back.** Since proto3 v3.15, you can write `optional string nickname = 7;` and the generated code exposes a "has it" check (`HasNickname()` in Go).

Use `optional` for fields where "unset" and "explicit empty" are different concepts. Otherwise, accept default semantics.

## Enums and the zero rule

The first enum value must be `_UNSPECIFIED = 0`:

```proto
enum Role {
  ROLE_UNSPECIFIED = 0;  // mandatory zero
  ROLE_MEMBER = 1;
  ROLE_ADMIN = 2;
}
```

Why: zero is the proto3 default. Any unset enum becomes `_UNSPECIFIED`, which makes "the client did not say" explicit. Without the unspecified zero, an unset `Role` would silently become `MEMBER`, which is a bug factory.

Some teams prefix every enum value with the enum name (e.g. `ROLE_MEMBER`). The reason: enum values are global per file in many languages. Without prefixes, two enums with the same value names collide.

## Repeated, maps, oneof

```proto
message Post {
  repeated string tags = 1;       // []string in Go
  map<string, int32> reactions = 2; // map[string]int32 in Go

  oneof reference {
    string url = 3;
    int64 internal_id = 4;
  }
}
```

**`repeated`** is a list. Order is preserved.

**`map<K, V>`** is a key-value map. Keys can be integral or string types; values can be anything except other maps. Maps do not preserve insertion order on the wire.

**`oneof`** lets exactly one of several fields be set. Setting one clears the others. Use for tagged unions ("either a URL or an internal ID, never both").

## Well-known types

Standard Google types you will reach for:

- `google.protobuf.Timestamp` — UTC instants, seconds + nanoseconds.
- `google.protobuf.Duration` — durations, signed.
- `google.protobuf.Empty` — for RPCs that have no request or response data: `rpc Ping (Empty) returns (Empty);`.
- `google.protobuf.FieldMask` — paths into a message ("update only `email` and `name`"). Use for partial updates.
- `google.protobuf.Any` — type-erased message ("some other proto, look up its type by URL"). Powerful, dangerous, use rarely.

Always import explicitly:

```proto
import "google/protobuf/timestamp.proto";

message User {
  google.protobuf.Timestamp created_at = 5;
}
```

Never invent your own timestamp type. Other tools (gRPC-gateway, buf, openapi generators) understand `Timestamp` natively.

## The wire format, briefly

You do not need to encode protobuf by hand, but knowing the shape helps debugging.

Each field on the wire is `(tag, value)`. The tag packs the field number and the wire type. There are five wire types:

| Wire type | Used for |
|---|---|
| 0 — Varint | int32, int64, uint32, uint64, bool, enum |
| 1 — 64-bit | fixed64, sfixed64, double |
| 2 — Length-delimited | string, bytes, embedded messages, repeated |
| 5 — 32-bit | fixed32, sfixed32, float |

Default values are skipped. Unknown fields are preserved on round-trips (so a server that doesn't know about a new field still passes it through). Endianness is little-endian for fixed types.

Two practical consequences:

1. **Varint encoding rewards small numbers.** Field numbers 1–15 take one byte for the tag. Field numbers 16+ take two bytes. Same for integer values: small unsigned ints are tiny, large ones are bigger.
2. **You can decode a protobuf without the schema** — `protoc --decode_raw` shows the wire structure. You see field numbers, types, and bytes; you do not see field *names* (those are stripped).

`protoc --decode_raw &lt; captured-message.bin` is the gRPC equivalent of "open it in a hex editor."

## Schema evolution rules

This is what keeps a service compatible across years.

**Safe changes (backward compatible):**

- Add a new field. Old clients ignore it.
- Add a new enum value. Old clients see `_UNSPECIFIED`.
- Mark a field `optional` (proto3.15+). Now you can detect presence.
- Add a new RPC to a service.
- Add a new message type.

**Breaking changes (avoid):**

- Change a field's number.
- Change a field's type (most cases).
- Rename a field. The wire is fine but generated code changes; clients must regenerate.
- Remove a field without reserving its number.
- Change `repeated` to non-`repeated` or vice versa.

`buf breaking` (from the `buf` tool) automates checking this. Run it in CI on every PR; reject any breaking change unless explicitly approved.

## Versioning a `.proto` package

Use `package user.v1;`. When you need a hard break, create `user.v2;` alongside it. Old service stays running; new clients move over field by field. Two RPCs, two service definitions, both deployed. There is no rolling upgrade trick that beats "ship v2, retire v1 when usage is zero."

This is why every well-run proto repo has `proto/user/v1/`, `proto/user/v2/`, `proto/billing/v1/` directory layout.

## Linting and breaking-change detection

`buf` is the modern toolchain:

```bash
brew install bufbuild/buf/buf  # or apt
buf lint    # lints style
buf format  # formats files
buf breaking --against '.git#branch=main'  # checks vs main
buf generate  # codegen via buf.gen.yaml
```

Use `buf` over raw `protoc` for any non-trivial codebase. The lint rules catch real bugs (no enum zero value, missing service comments, naming, missing reserve on deletion).

## A complete `buf.yaml`

```yaml
# buf.yaml
version: v2
modules:
  - path: proto
breaking:
  use:
    - FILE
lint:
  use:
    - DEFAULT
  except:
    - PACKAGE_VERSION_SUFFIX  # if you don't use versioned packages yet
```

```yaml
# buf.gen.yaml
version: v2
plugins:
  - remote: buf.build/protocolbuffers/go
    out: gen/go
    opt:
      - paths=source_relative
  - remote: buf.build/grpc/go
    out: gen/go
    opt:
      - paths=source_relative
```

`buf generate` reads both, fetches the remote plugins, emits code into `gen/go/`. Add `gen/` to `.gitignore` if codegen runs in CI; check it in if you want reproducibility offline.

## Recap

- `.proto` is a small, strict language. Five concepts: messages, fields, enums, services, packages.
- Field numbers are forever. Reserve them when you delete fields.
- proto3 default values are not on the wire. `optional` brings presence back.
- Enums must have `_UNSPECIFIED = 0`. Zero is unset.
- Use well-known types (`Timestamp`, `Duration`, `Empty`) — never invent your own.
- Wire format: tag (field number + wire type) plus value. Unknown fields preserved.
- Safe: add fields, RPCs, enum values. Unsafe: change types, numbers, remove without reserve.
- Use `buf` for lint, format, breaking-change checks. Run in CI.

Next: [HTTP/2 underneath](/notes/grpc/03-http2) — the transport that makes gRPC fast, and what its features mean for your service.


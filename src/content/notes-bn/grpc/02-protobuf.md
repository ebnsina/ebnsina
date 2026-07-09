---
title: 'Protocol Buffers'
subtitle: 'Protobuf হলো schema language আর wire format। schema-র নিয়মগুলো ঠিকঠাক করুন, আপনার service গুলো এক দশক ধরে compatible থাকবে। ভুল করুন, একটা খারাপ commit-ই একসাথে প্রতিটা client ভেঙে ফেলবে।'
chapter: 2
level: 'beginner'
readingTime: '13 মিনিট'
topics: ['grpc', 'protobuf', 'proto3', 'schema', 'wire format']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

একটা `.proto` ফাইল হলো contract। এটা message (data shape) আর service (RPC) সংজ্ঞায়িত করে। `protoc` ফাইলটা পড়ে আর language-specific কোড emit করে। wire format টা decoupled — একটা Go server একটা Python client-এর সাথে কথা বলতে পারে কারণ দুটোই একই byte encode আর decode করে।

এই অধ্যায় হলো language reference, সাথে সেই নিয়মগুলো যা আপনার ভাঙা উচিত না। প্রতিটা protobuf ভয়ের গল্প হলো এই নিয়মগুলোর একটা তাড়াহুড়ো করে ভাঙার ঘটনা।

<Callout type="info">

**Real-World Analogy**

একটা protobuf schema হলো একটা shared blueprint-এর মতো যা sender আর receiver দুজনেই মেনে নিয়েছে — field গুলোর মানে কী তা আন্দাজ করার দরকার নেই।

</Callout>

## একটা আসল `.proto` ফাইল

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

ধীরে পড়ুন। 90% `.proto` ফাইলের জন্য আপনার যা যা concept দরকার তার সবই এখানে আছে।

## একটা `.proto`-র anatomy

**`syntax = "proto3";`** — proto3, আধুনিক dialect। proto2 legacy; নতুন কোডের জন্য এটা ব্যবহার করবেন না।

**`package user.v1;`** — namespacing। generated code-এ একটা module/package হিসেবে আর wire-এ fully-qualified name-এর অংশ হিসেবে যায়। `.v1`-টা ইচ্ছাকৃত; নিচে versioning দেখুন।

**`option go_package = "..."`** — language-specific output path। প্রতিটা ভাষার নিজস্ব `option` directive আছে। আসল codebase-এ আপনি `option java_package`, `option ruby_package` ইত্যাদি দেখবেন।

**`import "..."`** — আরেকটা `.proto` টেনে আনে। Standard well-known type গুলো `google/protobuf/*.proto`-তে থাকে (Timestamp, Duration, Empty, FieldMask, Any)।

**`service`** — RPC-র একটা সেট। প্রতিটা RPC-র একটা request type আর একটা response type আছে। service নিয়ে আমরা অধ্যায় 4-এ বিস্তারিত বলব।

**`message`** — একটা record। Field গুলো typed আর numbered।

**`enum`** — মানগুলোর একটা সসীম সেট। `_UNSPECIFIED = 0` convention বাধ্যতামূলক; নিচে দেখুন।

## Field number — সবচেয়ে গুরুত্বপূর্ণ নিয়ম

প্রতিটা field-এর একটা number আছে। সেই number-ই _একমাত্র_ জিনিস যা wire-এ যায় — name গুলো ছেঁটে ফেলা হয়। তাই contract হলো number গুলো, name নয়।

**নিয়মগুলো:**

1. **1 থেকে 15 number গুলো এক byte।** 16 থেকে 2047 number গুলো দুই byte। যে field গুলো আপনি সবচেয়ে বেশি serialize করেন সেগুলোর জন্য 1–15 ব্যবহার করুন।
2. **Number চিরস্থায়ী।** একবার একটা field-এর একটা number হয়ে গেলে, সেই number আর কোনো field-এর জন্য পুনরায় ব্যবহার করা যায় না। কখনোই না।
3. **Field মুছলে number reserve করুন।** এটা দ্বিতীয়-সবচেয়ে-গুরুত্বপূর্ণ নিয়ম।

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

আপনি যদি reserve না করেন, কেউ পরের বছর `string country = 4` যোগ করে আর পুরনো data সহ client গুলো যেটাকে তারা `phone` মনে করে (কয়েকটা সংখ্যার একটা string) সেটা একটা `country` field-এ পাঠায়। Garbage data, কোনো error নেই, নীরব corruption।

<Callout type="warn">

**Reserve করুন। সবসময়।** একটা field-এর number reserve না করে সেটা মুছে ফেলা হলো আসল codebase-এ সবচেয়ে common protobuf bug। wire format ক্ষমাশীল; সেই ক্ষমাশীলতাই একটা footgun হয়ে ওঠে।

</Callout>

## Scalar type

| Proto type            | Go type             | Notes                                              |
| --------------------- | ------------------- | -------------------------------------------------- |
| `double`              | `float64`           |                                                    |
| `float`               | `float32`           |                                                    |
| `int32` / `int64`     | `int32` / `int64`   | varint encoded; smaller for small values           |
| `uint32` / `uint64`   | `uint32` / `uint64` | unsigned varint                                    |
| `sint32` / `sint64`   | `int32` / `int64`   | zigzag encoded; better for negatives               |
| `fixed32` / `fixed64` | `uint32` / `uint64` | always 4 / 8 bytes; better for large random values |
| `bool`                | `bool`              |                                                    |
| `string`              | `string`            | UTF-8                                              |
| `bytes`               | `[]byte`            | arbitrary bytes                                    |

integer পছন্দটা গুরুত্বপূর্ণ। "user ID"-র জন্য `int64` — কিছু ID যদি বড় হয়, তাহলে varint প্রতি ID-তে অনেক byte খরচ করে। opaque বড় ID-র (random hash) জন্য `fixed64`। negative হতে পারে এমন "delta" মানের জন্য `sint32`।

## Default value

proto3-তে প্রতিটা scalar-এর একটা default আছে — number-এর জন্য `0`, string-এর জন্য `""`, bool-এর জন্য `false`, repeated আর bytes-এর জন্য empty। **Default value গুলো wire-এ থাকে না।** `name = ""` সহ একটা `User` message ঠিক একইভাবে serialize হয় যেভাবে `name` সেট না করা একটা `User` হয়।

এটা দুই ধরনের বিভ্রান্তি ঘটায়:

1. **আপনি "স্পষ্টভাবে zero সেট করা"-কে "unset"-এর থেকে আলাদা করতে পারবেন না।** একটা `Status status = 3` যেখানে status হলো `0`, সেটা একটা unset field থেকে আলাদা করা যায় না।
2. **`optional` যোগ করলে স্পষ্ট presence ফিরে আসে।** proto3 v3.15 থেকে আপনি `optional string nickname = 7;` লিখতে পারেন আর generated code একটা "has it" check প্রকাশ করে (Go-তে `HasNickname()`)।

যে field-এ "unset" আর "explicit empty" আলাদা concept, সেখানে `optional` ব্যবহার করুন। নইলে default semantics মেনে নিন।

## Enum আর zero-র নিয়ম

প্রথম enum value অবশ্যই `_UNSPECIFIED = 0` হতে হবে:

```proto
enum Role {
  ROLE_UNSPECIFIED = 0;  // mandatory zero
  ROLE_MEMBER = 1;
  ROLE_ADMIN = 2;
}
```

কেন: zero হলো proto3 default। যেকোনো unset enum `_UNSPECIFIED` হয়ে যায়, যা "client কিছু বলেনি" ব্যাপারটা স্পষ্ট করে। unspecified zero ছাড়া, একটা unset `Role` নীরবে `MEMBER` হয়ে যেত, যা একটা bug factory।

কিছু টিম প্রতিটা enum value-র আগে enum-এর name বসায় (যেমন `ROLE_MEMBER`)। কারণ: অনেক ভাষায় enum value গুলো প্রতি file-এ global। prefix ছাড়া, একই value name সহ দুটো enum সংঘর্ষ করে।

## Repeated, map, oneof

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

**`repeated`** হলো একটা list। ক্রম সংরক্ষিত থাকে।

**`map<K, V>`** হলো একটা key-value map। Key integral বা string type হতে পারে; value অন্য map ছাড়া যেকোনো কিছু হতে পারে। Map wire-এ insertion order সংরক্ষণ করে না।

**`oneof`** কয়েকটা field-এর ঠিক একটাকে সেট হতে দেয়। একটা সেট করলে বাকিগুলো clear হয়ে যায়। tagged union-এর জন্য ব্যবহার করুন ("হয় একটা URL নয়তো একটা internal ID, কখনো দুটো একসাথে না")।

## Well-known type

Standard Google type যেগুলোর দিকে আপনি হাত বাড়াবেন:

- `google.protobuf.Timestamp` — UTC instant, second + nanosecond।
- `google.protobuf.Duration` — duration, signed।
- `google.protobuf.Empty` — যেসব RPC-তে কোনো request বা response data নেই তার জন্য: `rpc Ping (Empty) returns (Empty);`।
- `google.protobuf.FieldMask` — একটা message-এর ভেতরে path ("শুধু `email` আর `name` update করো")। partial update-এর জন্য ব্যবহার করুন।
- `google.protobuf.Any` — type-erased message ("অন্য কোনো proto, তার type URL দিয়ে খুঁজে নাও")। শক্তিশালী, বিপজ্জনক, কম ব্যবহার করুন।

সবসময় স্পষ্টভাবে import করুন:

```proto
import "google/protobuf/timestamp.proto";

message User {
  google.protobuf.Timestamp created_at = 5;
}
```

কখনো নিজের timestamp type বানাবেন না। অন্য tool গুলো (gRPC-gateway, buf, openapi generator) `Timestamp` natively বোঝে।

## wire format, সংক্ষেপে

আপনাকে হাত দিয়ে protobuf encode করতে হবে না, কিন্তু shape জানলে debugging-এ সাহায্য করে।

wire-এ প্রতিটা field হলো `(tag, value)`। tag-টা field number আর wire type প্যাক করে। পাঁচটা wire type আছে:

| Wire type            | Used for                                   |
| -------------------- | ------------------------------------------ |
| 0 — Varint           | int32, int64, uint32, uint64, bool, enum   |
| 1 — 64-bit           | fixed64, sfixed64, double                  |
| 2 — Length-delimited | string, bytes, embedded messages, repeated |
| 5 — 32-bit           | fixed32, sfixed32, float                   |

Default value গুলো skip করা হয়। Unknown field গুলো round-trip-এ সংরক্ষিত থাকে (তাই একটা server যা একটা নতুন field সম্পর্কে জানে না সেটাও এটা pass through করে)। fixed type-এর জন্য endianness little-endian।

দুটো practical পরিণতি:

1. **Varint encoding ছোট number-কে পুরস্কৃত করে।** Field number 1–15 tag-এর জন্য এক byte নেয়। Field number 16+ দুই byte নেয়। integer value-র জন্যও একই: ছোট unsigned int খুব ছোট, বড়গুলো বড়।
2. **আপনি schema ছাড়াই একটা protobuf decode করতে পারেন** — `protoc --decode_raw` wire structure দেখায়। আপনি field number, type, আর byte দেখেন; আপনি field _name_ দেখেন না (সেগুলো ছেঁটে ফেলা)।

`protoc --decode_raw &lt; captured-message.bin` হলো "একটা hex editor-এ এটা খোলা"-র gRPC সমতুল্য।

## Schema evolution-এর নিয়ম

এটাই একটা service-কে বছরের পর বছর compatible রাখে।

**নিরাপদ পরিবর্তন (backward compatible):**

- একটা নতুন field যোগ করুন। পুরনো client উপেক্ষা করে।
- একটা নতুন enum value যোগ করুন। পুরনো client `_UNSPECIFIED` দেখে।
- একটা field-কে `optional` mark করুন (proto3.15+)। এখন আপনি presence detect করতে পারবেন।
- একটা service-এ একটা নতুন RPC যোগ করুন।
- একটা নতুন message type যোগ করুন।

**Breaking পরিবর্তন (এড়িয়ে চলুন):**

- একটা field-এর number বদলানো।
- একটা field-এর type বদলানো (বেশিরভাগ ক্ষেত্রে)।
- একটা field rename করা। wire ঠিক আছে কিন্তু generated code বদলায়; client-কে আবার generate করতে হয়।
- number reserve না করে একটা field মুছে ফেলা।
- `repeated`-কে non-`repeated`-এ বদলানো বা উল্টোটা।

`buf breaking` (`buf` tool থেকে) এটা check করা automate করে। প্রতিটা PR-এ CI-তে চালান; স্পষ্টভাবে approve না করা পর্যন্ত যেকোনো breaking change reject করুন।

## একটা `.proto` package-এর versioning

`package user.v1;` ব্যবহার করুন। যখন আপনার একটা hard break দরকার, তখন এর পাশে `user.v2;` তৈরি করুন। পুরনো service চলতেই থাকে; নতুন client field ধরে ধরে সরে আসে। দুটো RPC, দুটো service definition, দুটোই deployed। "v2 ship করো, usage zero হলে v1 retire করো"-কে হারিয়ে দেয় এমন কোনো rolling upgrade কৌশল নেই।

এই কারণেই প্রতিটা ভালোভাবে চালানো proto repo-তে `proto/user/v1/`, `proto/user/v2/`, `proto/billing/v1/` directory layout থাকে।

## Linting আর breaking-change detection

`buf` হলো আধুনিক toolchain:

```bash
brew install bufbuild/buf/buf  # or apt
buf lint    # lints style
buf format  # formats files
buf breaking --against '.git#branch=main'  # checks vs main
buf generate  # codegen via buf.gen.yaml
```

যেকোনো non-trivial codebase-এর জন্য raw `protoc`-এর বদলে `buf` ব্যবহার করুন। lint rule গুলো আসল bug ধরে (কোনো enum zero value নেই, service comment অনুপস্থিত, naming, deletion-এ reserve অনুপস্থিত)।

## একটা সম্পূর্ণ `buf.yaml`

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
    - PACKAGE_VERSION_SUFFIX # if you don't use versioned packages yet
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

`buf generate` দুটোই পড়ে, remote plugin গুলো fetch করে, `gen/go/`-তে কোড emit করে। codegen যদি CI-তে চলে তাহলে `gen/`-কে `.gitignore`-এ যোগ করুন; offline reproducibility চাইলে এটা check in করুন।

## রিক্যাপ

- `.proto` একটা ছোট, কড়া language। পাঁচটা concept: message, field, enum, service, package।
- Field number চিরস্থায়ী। Field মুছলে সেগুলো reserve করুন।
- proto3 default value গুলো wire-এ থাকে না। `optional` presence ফিরিয়ে আনে।
- Enum-এ অবশ্যই `_UNSPECIFIED = 0` থাকতে হবে। Zero হলো unset।
- well-known type ব্যবহার করুন (`Timestamp`, `Duration`, `Empty`) — কখনো নিজের বানাবেন না।
- wire format: tag (field number + wire type) সাথে value। Unknown field সংরক্ষিত।
- নিরাপদ: field, RPC, enum value যোগ করা। অনিরাপদ: type, number বদলানো, reserve ছাড়া মুছে ফেলা।
- lint, format, breaking-change check-এর জন্য `buf` ব্যবহার করুন। CI-তে চালান।

পরবর্তী: [নিচে HTTP/2](/notes/grpc/03-http2) — যে transport gRPC-কে দ্রুত করে, আর আপনার service-এর জন্য এর feature গুলোর মানে কী।

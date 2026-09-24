---
title: 'Event contract design'
subtitle: 'আপনার event payload-এর গড়ন এমন একটা contract হয়ে দাঁড়ায় যা প্রত্যেক integrate-কারীর সাথে বাঁধা। প্রথম দুপুরে নেওয়া সিদ্ধান্তগুলো নিয়েই আপনাকে বছরের পর বছর কাটাতে হয়।'
chapter: 2
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['webhooks', 'events', 'schema', 'versioning']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

একটা webhook event হলো একটা JSON object। field যোগ করা সস্তা; সরানো খরচসাপেক্ষ। rename করা কোনো সতর্কতা ছাড়াই প্রতিটা integration ভেঙে দেয়। প্রথম দিনেই envelope আর per-type payload-গুলো যত্ন করে ডিজাইন করলে আপনি বহু বছরের compatibility tax থেকে বাঁচেন।

এই অধ্যায়টা হলো schema design-এর checklist: envelope, type, ID, timestamp, versioning, আর সেই field-গুলো যেগুলো লাগবে না মনে হলেও ship করা উচিত।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা event contract অনেকটা দুই পক্ষের মধ্যে করা আইনি চুক্তির মতো — বাঁধ্যতামূলক কিছু বিনিময়ের আগে দুজনকেই format নিয়ে একমত হতে হয়।

</Callout>

## গল্পে বুঝি

খোয়ারিজমির একটা কুরিয়ার কোম্পানি, বাগদাদ থেকে সমরকন্দ পর্যন্ত ছড়ানো তার বহু শাখা। শুরুর দিকে প্রতিটা শাখা যার যার মতো করে ডেলিভারির খবর পাঠাত — কেউ ছোট কাগজে দুই লাইন লিখত, কেউ শুধু মুখে বলে দিত। ফলে প্রাপকের কেরানিরা প্রতিবার মাথা চুলকাত: এই কাগজটা কি ডেলিভারি হয়েছে বোঝাচ্ছে, নাকি পার্সেল ফেরত গেছে? তারিখটা কোথায়? কোন পার্সেলের কথা? বিভ্রান্তির শেষ ছিল না।

তাই খোয়ারিজমি একটা বাঁধা **"ডেলিভারি নোটিফিকেশন স্লিপ"** template চালু করলেন, যা প্রতিটা শাখাকে হুবহু মানতে হবে। প্রতিটা স্লিপে সবসময় একই চারটে ঘর থাকে — উপরে বড় করে কী ঘটেছে ("পার্সেল ডেলিভারড"), একটা ইউনিক স্লিপ নম্বর, তার নিচে ঠিক দিন-তারিখ-সময়, আর একটা বিস্তারিত ঘর যেখানে প্রাপক-ঠিকানা-ওজন সব লেখা। format যেহেতু বাঁধা আর সবার জানা, যেকোনো শাখার কেরানি স্লিপ হাতে পেয়েই বিনা বিভ্রান্তিতে কাজ সেরে ফেলে। আর কখনও নতুন তথ্য লাগলে? পুরনো ঘরগুলোয় হাত না দিয়ে স্লিপের নিচে শুধু নতুন ঘর **যোগ** করা হয় — পুরনো কেরানিদের চেনা ছকটা তাতে একটুও নড়ে না।

এই বাঁধা স্লিপ template-টাই হলো **event contract** (payload schema)। "কী ঘটেছে" ঘরটা হলো **event type**, ইউনিক স্লিপ নম্বর হলো **event id** (যেটা দিয়ে dedup করা যায়), দিন-তারিখ-সময় হলো **timestamp**, আর বিস্তারিত ঘরটা হলো **data object**। আর পুরনো ঘরে হাত না দিয়ে শুধু নতুন ঘর যোগ করার নিয়মটাই হলো compatible (additive) evolution — মানে schema বদলালেও পুরনো consumer-দের কোড ভাঙে না। বাস্তবেও Stripe বা GitHub-এর মতো সব বড় webhook system ঠিক এভাবেই একটা fixed envelope আর add-only rule ধরে রাখে, যাতে বছর পেরোলেও কারও integration হঠাৎ ভেঙে না পড়ে।

## Standard envelope

আপনি যত event পাঠান, প্রতিটা একই envelope বহন করে। Consumer-রা generic handler লিখতে পারে আর কেবল যেখানে দরকার সেখানেই per-type কোডে branch করতে পারে:

```json
{
	"id": "evt_01HF5J7XK4TG6N2VRT9P0M3DZ4",
	"type": "payment.succeeded",
	"created": "2026-05-04T12:00:00.123Z",
	"api_version": "2026-04-01",
	"data": {
		"object": {
			"id": "py_01HF5J7Y2C8K9PT8AYB4M3DPVF",
			"amount": 4200,
			"currency": "usd",
			"customer": "cus_42"
		}
	}
}
```

পাঁচটা envelope field:

- **`id`** — event ID। Globally unique। retry জুড়ে stable। receiver এটার ওপর dedupe করে।
- **`type`** — dot-namespaced event name (`payment.succeeded`, `user.created`)। receiver এটার ওপর route করে।
- **`created`** — RFC 3339 timestamp, UTC, millisecond। ordering আর replay window-এর জন্য কাজে লাগে।
- **`api_version`** — schema version। migration চলাকালীন receiver এটার ওপর branch করতে পারে।
- **`data.object`** — payload, forward-compat-এর জন্য একটা `object`-এ মোড়ানো (পরে parser না ভেঙেই আপনি `previous_attributes`-এর মতো sibling field যোগ করতে পারবেন)।

Stripe-এর envelope-এ আরও কয়েকটা field আছে (`livemode`, `pending_webhooks`, `request`); উপরের পাঁচটাই হলো ন্যূনতম, যেটা আর কমানো যায় না।

## Event ID — ULID বা UUID বেছে নিন

`id` field-এ তিনটে property আপনি চান:

1. **Globally unique।** দুটো event কখনও collide করে না।
2. **Time-orderable।** পরের event আপনার DB index-এ আগের event-এর পরে sort হয়।
3. **Consumer-এর কাছে opaque।** তারা এটা কখনও parse করে না।

UUIDv4 unique কিন্তু random, যা index locality মেরে ফেলে। UUIDv7 (time-ordered) আর **ULID** (Crockford base32, 26 char, time-prefixed) দুটোই locality-তে জেতে। ULID log-এ পড়তে একটু সহজ:

```
evt_01HF5J7XK4TG6N2VRT9P0M3DZ4
```

`evt_` prefix-টা একটা convention — এক নজরে event-কে অন্য ID থেকে আলাদা করে তোলে। Stripe প্রতিটা type-এর জন্য এটা করে (`cus_`, `py_`, `sub_`)।

```go
import "github.com/oklog/ulid/v2"

func newEventID() string {
    return "evt_" + ulid.Make().String()
}
```

UUIDv4-এর বদলে ULID। dependency-টা রাখার মূল্য আছে।

## `type` field — naming convention

তিনটে নিয়ম যা scale করে।

**১. Dot-namespaced, lowercase, period-separated।** `resource.action` হলো standard form:

```
user.created
user.updated
user.deleted
payment.succeeded
payment.failed
subscription.canceled
```

**২. Past tense verb।** Event হলো ইতিমধ্যে ঘটে যাওয়া জিনিস সম্পর্কে fact, command নয়। `payment.succeeded`, `succeed.payment` বা `payment.succeed` নয়।

**৩. Stable noun; specific verb।** `user.created` ঠিক; `user.signup` ভুল (signup একটা flow, noun-verb জোড়া নয়)।

subresource-সহ composite event-এর জন্য, আরও গভীরে namespace করুন:

```
invoice.line_item.added
invoice.line_item.removed
```

এড়িয়ে চলুন:

- type name-এ version রাখা (`user.created.v2`)। এর জন্য `api_version` ব্যবহার করুন।
- Generic type (`event`, `update`)। receiver route করতে পারে না।
- Mixed casing (`User.Created`, `userCreated`)। একটা বেছে নিয়ে সেটাই ধরে রাখুন।

## একটা `data` শেপ বেছে নিন আর কখনও ভাঙবেন না

`data.object` হলো একটা event-এর payload। সিদ্ধান্ত: এটা কি resource-এর _পুরো state_ হবে, নাকি শুধু _delta_ (যা বদলেছে)?

**Full state (recommended)।** পুরো resource, প্রতিবার। receiver-দের সবসময় একটা complete view থাকে; field ভরাট করতে তাদের আপনার API query করতে হয় না।

```json
"data": {
  "object": {
    "id": "py_...",
    "amount": 4200,
    "currency": "usd",
    "status": "succeeded",
    "customer": "cus_42",
    "created": "2026-05-04T11:59:58Z",
    "metadata": {...}
  }
}
```

**Delta-only।** শুধু বদলানো field আর ID। ছোট payload, কিন্তু সব জানতে হলে receiver-কে resource fetch করতে হতে পারে।

Full state প্রায় সবসময়ই সঠিক সিদ্ধান্ত। Bandwidth সস্তা; receiver-এর জটিলতা দামি। ব্যতিক্রম: অত্যন্ত বড় resource (একটা 10 MB document)। ওগুলোর জন্য একটা ছোট reference পাঠান আর receiver-কে টেনে নিতে দিন।

state transition জড়িত এমন event-এর জন্য একটা `previous_attributes` sibling রাখলে সাহায্য হয়:

```json
"data": {
  "object": { "id": "sub_...", "status": "canceled", ... },
  "previous_attributes": { "status": "active" }
}
```

এখন consumer-রা শুধু "resource এখন canceled" নয়, "এটা আগে active ছিল"-ও জানে।

<Callout type="tip">

**প্রতিটা resource-এর canonical field একবার document করুন।** `user.created`-তে ফেরত আসা একটা `User`-এর গড়ন `user.updated`-এ ফেরত আসা `User`-এর মতোই হওয়া উচিত। event type জুড়ে resource-এর গড়ন reuse করা receiver-এর কোডে বিশাল সরলীকরণ — তারা একটা গড়ন parse করে, আটটা নয়।

</Callout>

## Timestamps — RFC 3339, millisecond সহ, UTC

সর্বত্র `2026-05-04T12:00:00.123Z` ব্যবহার করুন। তিনটে কারণ:

1. String হিসেবে sortable।
2. Regional খুঁতখুঁতানি ছাড়াই সব ভাষায় parsable।
3. UTC-তে কোনো daylight-saving খাদ নেই।

Millisecond precision পাঠান। কিছু receiver একই সেকেন্ডে emit হওয়া দুটো event-এর ordering নিয়ে ভাবে।

JSON body-তে কখনও Unix epoch-কে integer হিসেবে পাঠাবেন না — receiver-রা unit ভুলে যায় (second? millisecond?)। String দ্ব্যর্থহীন।

(Replay protection-এর জন্য header timestamp আলাদা ব্যাপার, অধ্যায় ৪-এ কভার করা হয়েছে।)

## Idempotency key

অধ্যায় ১-এ ইতিমধ্যে বলা হয়েছে: event-এর `id`-ই হলো idempotency key। receiver এটার ওপর dedupe করে।

দুটো স্পষ্টীকরণ:

- **retry জুড়ে producer-কে একই `id` রাখতে হবে।** retry করে যদি একটা নতুন ULID generate করেন, receiver dedupe করতে পারে না আর দুবার process করে।
- **`id` হলো per event, per resource নয়।** গতকালের user 42-এর একটা `user.updated` event আর আজকের user 42-এর একটা `user.updated` event-এর `id` আলাদা।

Producer-এর দিকে, event ID একবারই generate হয় যখন event প্রথম persist হয় (অধ্যায় ১০-এর outbox pattern); প্রতিটা retry একই ID পাঠায়।

## Versioning — `api_version` আর additive change

Backward-compat একটা বাধ্যবাধকতা। Customer-রা integrate করে; তাদের কোড আজকের গড়ন চিরকালের জন্য আশা করে।

নিয়মগুলো gRPC track-এর protobuf নিয়মের অনুরূপ:

**নিরাপদ (consumer-দের ভাঙবে না):**

- একটা নতুন event type যোগ করুন।
- `data.object`-এ একটা নতুন field যোগ করুন।
- `data`-এর তলায় একটা নতুন optional sibling যোগ করুন (যেমন `previous_attributes`)।

**Breaking (করবেন না):**

- একটা field সরানো।
- একটা field rename করা।
- একটা field-এর type বদলানো।
- একটা value-এর মানে বদলানো।
- একটা array-তে element reorder করা, যদি না ordering আগে থেকেই random ছিল।

যখন ভাঙতেই হবে, **`api_version` bump করুন** আর consumer-দের opt in করতে দিন। Stripe এটা date-based version দিয়ে করে (`2026-04-01`); প্রতিটা customer একটা version-এ pinned থাকে যা তারা স্পষ্টভাবে upgrade করে।

```go
type Event struct {
    ID         string          `json:"id"`
    Type       string          `json:"type"`
    Created    time.Time       `json:"created"`
    APIVersion string          `json:"api_version"`
    Data       json.RawMessage `json:"data"`
}
```

Producer প্রতিটা subscriber-এর জন্য API version বহন করে। একই event subscriber A-কে (`2025-01-01`-এ) আর subscriber B-কে (`2026-04-01`-এ) পাঠালে দুটো ভিন্ন গড়নে render হয়। যন্ত্রণাদায়ক, কিন্তু বিকল্প হলো পুরো দুনিয়াকে একসাথে upgrade করতে বাধ্য করা।

আপনার নিয়ন্ত্রণে থাকা মুষ্টিমেয় কয়েকটা consumer-সহ একটা ছোট সিস্টেমের জন্য, সত্যিকারের দরকার না পড়া পর্যন্ত API versioning skip করতে পারেন। একটা public webhook product-এর জন্য, পারবেন না।

## Event type — granularity

একটা common design ভুল: খুব কম type অথবা খুব বেশি।

**খুব কম।** একটা generic `entity.changed` type। consumer route করতে পারে না; তারা data parse করে `data.object.type`-এর ওপর switch করে। parsing-এর কাজ বাড়ায় আর তাদের আপনার internal model-এর সাথে couple করে।

**খুব বেশি।** যত code path emit করে প্রতিটার জন্য একটা করে type (`user.profile_updated_via_settings_page`, `user.profile_updated_via_admin_api`)। consumer পার্থক্যটা উপেক্ষা করে; producer internal codepath-গুলো public রাখতে প্রতিশ্রুতিবদ্ধ হয়ে পড়ে।

**সঠিক মাত্রা।** প্রতিটা business event-এর জন্য একটা type। `user.updated` যেকোনো পরিবর্তন কভার করে। নতুন user-এর জন্য `user.created`। সরানোর জন্য `user.deleted`। receiver পুরো updated object পায় আর কোন field নড়ল তা নিয়ে ভাবলে নিজের state-এর সাথে diff করতে পারে।

সাধারণ rule of thumb: **প্রতি (resource, lifecycle state) জোড়ায় একটা event type**, আর সাধারণ পরিবর্তনের জন্য একটা `*.updated`। একটা `subscription` resource emit করতে পারে `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.payment_failed`। চারটে type; পুরো universe কভার করে।

## Sub-event vs আলাদা type

যখন এমন কিছু বদলায় যা দুটো resource-কে প্রভাবিত করে, দুটো পছন্দ:

**A. দুটো event।** `subscription.canceled` আর `customer.updated`। প্রতিটা consumer যা নিয়ে ভাবে তাতে subscribe করে।

**B. একটা nested event।** `subscription.canceled` যার `data.object.customer` populated। consumer দুটো অংশই পড়ে।

Option B producer-এর জন্য সরল; A সরল সেসব consumer-এর জন্য যারা কেবল একটা resource নিয়ে ভাবে। বেশিরভাগ production webhook সিস্টেম denormalized data সহ B ব্যবহার করে (customer ID, নাম, email সবই subscription event-এ অন্তর্ভুক্ত)।

## Per-event metadata

দুটো field সবসময় ship করা মূল্যবান:

- **`livemode: bool`** — test আর production traffic আলাদা করে। consumer-দের আপনার sandbox-এর বিপরীতে integration test চালাতে দেয়, আসল সিস্টেম প্রভাবিত না করে।
- **`request_id`** — যে API request-এর কারণে event ঘটল তার ID, যদি থাকে। consumer-দের তাদের নিজেদের outbound API call-এর সাথে webhook correlate করতে দেয়।

Optional কিন্তু কাজের:

- **`tenant_id`** / **`account_id`** — multi-tenant scope।
- **`source`** — কোন subsystem event emit করল।
- **`signature_payload`** version — canonical signing string বদলালে (অধ্যায় ৪), এটা আপনাকে migrate করতে দেয়।

Field রক্ষণশীলভাবে যোগ করুন। প্রতিটা field একটা স্থায়ী প্রতিশ্রুতি।

## Event document করা

প্রতিটা event type-এর জন্য document করুন:

- trigger ("একটা payment `succeeded`-এ transition করলে emit হয়")।
- প্রত্যাশিত payload গড়ন (resource schema-র link, প্লাস `previous_attributes`-এর মতো যেকোনো extra)।
- প্রত্যাশিত ordering ("`payment.created`-এর পরে emit হয়")।
- retry behaviour ("৩ দিন ধরে retried")।
- উদাহরণ — happy path আর edge case দুটোই।

Documentation-কে contract হিসেবে গণ্য করুন। Customer-দের কোড আপনার doc-এর বিপরীতে লেখা; সেগুলো বাস্তবতা থেকে সরে গেলে integration ভাঙে।

Schema-র জন্য, envelope আর per-type payload বর্ণনা করে একটা JSON Schema বা OpenAPI spec ship করুন। `quicktype`-এর মতো tool ওই spec থেকে যেকোনো ভাষায় type binding generate করে — আপনার customer-রা কম wrapper কোড লেখে।

## রিক্যাপ

- একটা envelope: `id`, `type`, `created`, `api_version`, `data.object`।
- ID-র জন্য ULID বা UUIDv7 ব্যবহার করুন। Time-ordered ID ভালো index হয়।
- Naming: `resource.action`, past-tense verb, dot-namespaced।
- `data.object`-এ পুরো resource state পাঠান, delta নয়।
- RFC 3339 millisecond UTC timestamp string হিসেবে, epoch int হিসেবে নয়।
- Event ID-ই হলো idempotency key। retry জুড়ে একই।
- শুধু additive change। opt-in breaking change-এর জন্য date-string `api_version`।
- প্রতি (resource, lifecycle state) জোড়ায় একটা type। code path দিয়ে fragment করবেন না।
- সবসময় `livemode` আর `request_id` রাখুন। Optional `tenant_id`, `source`।
- Contract document করুন — receiver আপনার doc-এর বিপরীতে কোড করে।

পরবর্তী: [Webhooks পাঠানো](/notes/webhooks/03-sending) — Go-তে producer-এর দিকটা, ৬০ লাইনে, একটা আসল receiver-এর সাথে কথা বলে।

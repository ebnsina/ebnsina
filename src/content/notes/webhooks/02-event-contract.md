---
title: 'Event contract design'
subtitle: 'The shape of your event payload becomes a contract with everyone who integrates. The decisions you make in the first afternoon are the ones you live with for years.'
chapter: 2
level: 'beginner'
readingTime: '12 min'
topics: ['webhooks', 'events', 'schema', 'versioning']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A webhook event is a JSON object. Adding fields is cheap; removing them is costly. Renaming them breaks every integration without warning. Designing the envelope and the per-type payloads carefully on day one saves you from a multi-year compatibility tax.

This chapter is the schema design checklist: envelope, types, IDs, timestamps, versioning, and the fields you should ship even when you think you don't need them.

<Callout type="info">

**Real-World Analogy**

An event contract is like a legal contract between two parties — both must agree on the format before exchanging anything binding.

</Callout>

## The standard envelope

Every event you send carries the same envelope. Consumers can write generic handlers and only branch into per-type code where it matters:

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

The five envelope fields:

- **`id`** — the event ID. Globally unique. Stable across retries. The receiver dedupes on this.
- **`type`** — dot-namespaced event name (`payment.succeeded`, `user.created`). Receivers route on this.
- **`created`** — RFC 3339 timestamp, UTC, milliseconds. Useful for ordering and replay windows.
- **`api_version`** — the schema version. Receivers can branch on it during migrations.
- **`data.object`** — the payload, wrapped in an `object` for forward-compat (you can add sibling fields like `previous_attributes` later without breaking parsers).

Stripe's envelope has a few more fields (`livemode`, `pending_webhooks`, `request`); the five above are the irreducible minimum.

## Event IDs — choose ULID or UUID

The `id` field has three properties you want:

1. **Globally unique.** Two events never collide.
2. **Time-orderable.** A later event sorts after an earlier one in your DB index.
3. **Opaque to consumers.** They never parse it.

UUIDv4 is unique but random, killing index locality. UUIDv7 (time-ordered) and **ULID** (Crockford base32, 26 chars, time-prefixed) both win on locality. ULIDs are slightly easier to read in logs:

```
evt_01HF5J7XK4TG6N2VRT9P0M3DZ4
```

The `evt_` prefix is convention — makes events distinguishable from other IDs at a glance. Stripe does this for every type (`cus_`, `py_`, `sub_`).

```go
import "github.com/oklog/ulid/v2"

func newEventID() string {
    return "evt_" + ulid.Make().String()
}
```

ULID over UUIDv4. Worth the dependency.

## The `type` field — naming conventions

Three rules that scale.

**1. Dot-namespaced, lowercase, period-separated.** `resource.action` is the standard form:

```
user.created
user.updated
user.deleted
payment.succeeded
payment.failed
subscription.canceled
```

**2. Past tense verbs.** Events are facts about things that already happened, not commands. `payment.succeeded`, not `succeed.payment` or `payment.succeed`.

**3. Stable nouns; specific verbs.** `user.created` is right; `user.signup` is wrong (signup is a flow, not a noun-verb pair).

For composite events with subresources, namespace deeper:

```
invoice.line_item.added
invoice.line_item.removed
```

Avoid:

- Versioned in the type name (`user.created.v2`). Use `api_version` for that.
- Generic types (`event`, `update`). Receivers cannot route.
- Mixed casing (`User.Created`, `userCreated`). Pick one and stick.

## Pick a `data` shape and never break it

The `data.object` is the payload for one event. The decision: should it be the _full state_ of the resource, or just the _delta_ (what changed)?

**Full state (recommended).** The whole resource, every time. Receivers always have a complete view; they don't need to query your API to fill in fields.

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

**Delta-only.** Just the changed fields plus the ID. Smaller payloads, but the receiver may need to fetch the resource to know everything.

Full state is almost always the right call. Bandwidth is cheap; receiver complexity is expensive. The exception: extremely large resources (a 10 MB document). For those, send a small reference and let the receiver pull.

For events that involve state transitions, including a `previous_attributes` sibling helps:

```json
"data": {
  "object": { "id": "sub_...", "status": "canceled", ... },
  "previous_attributes": { "status": "active" }
}
```

Now consumers know not just "the resource is now canceled" but "it was previously active."

<Callout type="tip">

**Document the canonical fields per resource once.** A `User` returned in `user.created` should have the same shape as a `User` returned in `user.updated`. Reusing the resource shape across event types is a giant simplification for receiver code — they parse one shape, not eight.

</Callout>

## Timestamps — RFC 3339 with milliseconds, UTC

Use `2026-05-04T12:00:00.123Z` everywhere. Three reasons:

1. Sortable as strings.
2. Parsable in every language without regional quirks.
3. UTC has no daylight-saving cliffs.

Send millisecond precision. Some receivers care about ordering of two events emitted in the same second.

Never send Unix epochs as integers in the JSON body — receivers forget the unit (seconds? milliseconds?). Strings are unambiguous.

(Header timestamps for replay protection are a separate concern, covered in chapter 4.)

## Idempotency keys

Already mentioned in chapter 1: the event `id` is the idempotency key. The receiver dedupes on it.

Two clarifications:

- **The producer must keep the same `id` across retries.** If you retry and generate a new ULID, the receiver cannot dedupe and processes twice.
- **The `id` is per event, not per resource.** A `user.updated` event for user 42 yesterday and a `user.updated` event for user 42 today have different `id`s.

For the producer side, the event ID is generated once when the event is first persisted (chapter 10's outbox pattern); every retry sends the same ID.

## Versioning — `api_version` and additive changes

Backward-compat is an obligation. Customers integrate; their code expects today's shape forever.

The rules mirror the protobuf rules from the gRPC track:

**Safe (won't break consumers):**

- Add a new event type.
- Add a new field to `data.object`.
- Add a new optional sibling under `data` (e.g. `previous_attributes`).

**Breaking (don't):**

- Remove a field.
- Rename a field.
- Change a field's type.
- Change the meaning of a value.
- Reorder elements in an array unless ordering was already random.

When you must break, **bump `api_version`** and let consumers opt in. Stripe does this with date-based versions (`2026-04-01`); each customer is pinned to a version they upgrade explicitly.

```go
type Event struct {
    ID         string          `json:"id"`
    Type       string          `json:"type"`
    Created    time.Time       `json:"created"`
    APIVersion string          `json:"api_version"`
    Data       json.RawMessage `json:"data"`
}
```

The producer carries the API version per subscriber. Same event sent to subscriber A (on `2025-01-01`) and subscriber B (on `2026-04-01`) renders to two different shapes. Painful, but the alternative is forcing the world to upgrade in lockstep.

For a small system with a handful of consumers all under your control, you can skip API versioning until you actually need it. For a public webhook product, you cannot.

## Event types — granularity

A common design mistake: too few types or too many.

**Too few.** One generic `entity.changed` type. Consumers cannot route; they parse the data and switch on `data.object.type`. Adds parsing work and couples them to your internal model.

**Too many.** One type per code path that emits (`user.profile_updated_via_settings_page`, `user.profile_updated_via_admin_api`). Consumers ignore the distinction; the producer commits to keeping internal codepaths public.

**Right level.** One type per business event. `user.updated` covers any change. `user.created` for new users. `user.deleted` for removal. The receiver gets the full updated object and can diff against their own state if they care which fields moved.

Typical rule of thumb: **one event type per (resource, lifecycle state) pair**, plus a `*.updated` for general changes. A `subscription` resource might emit `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.payment_failed`. Four types; covers the universe.

## Sub-event vs separate type

When something changes that affects two resources, two choices:

**A. Two events.** `subscription.canceled` and `customer.updated`. Each consumer subscribes to what they care about.

**B. One nested event.** `subscription.canceled` with `data.object.customer` populated. Consumers read both pieces.

Option B is simpler for the producer; A is simpler for consumers who care about only one resource. Most production webhook systems use B with denormalized data (customer ID, name, email all included in the subscription event).

## Per-event metadata

Two fields worth always shipping:

- **`livemode: bool`** — distinguishes test from production traffic. Lets consumers run integration tests against your sandbox without affecting real systems.
- **`request_id`** — the ID of the API request that caused the event, if any. Lets consumers correlate webhooks with their own outbound API calls.

Optional but useful:

- **`tenant_id`** / **`account_id`** — the multi-tenant scope.
- **`source`** — what subsystem emitted the event.
- **`signature_payload`** version — if the canonical signing string changes (chapter 4), this lets you migrate.

Add fields conservatively. Every field is a permanent commitment.

## Documenting events

For each event type, document:

- The trigger ("emitted when a payment transitions to `succeeded`").
- The expected payload shape (link to the resource schema, plus any extras like `previous_attributes`).
- The expected ordering ("emitted after `payment.created`").
- The retry behaviour ("retried for 3 days").
- Examples — both happy path and edge cases.

Treat the documentation as the contract. Customers' code is written against your docs; if they diverge from reality, integrations break.

For schema, ship a JSON Schema or OpenAPI spec describing the envelope and per-type payloads. Tools like `quicktype` generate type bindings in any language from those specs — your customers write less wrapper code.

## Recap

- One envelope: `id`, `type`, `created`, `api_version`, `data.object`.
- Use ULID or UUIDv7 for IDs. Time-ordered IDs index well.
- Naming: `resource.action`, past-tense verbs, dot-namespaced.
- Send the full resource state in `data.object`, not deltas.
- RFC 3339 millisecond UTC timestamps as strings, not epoch ints.
- Event ID is the idempotency key. Same across retries.
- Additive changes only. Date-string `api_version` for opt-in breaking changes.
- One type per (resource, lifecycle state) pair. Don't fragment by code path.
- Always include `livemode` and `request_id`. Optional `tenant_id`, `source`.
- Document the contract — receivers code against your docs.

Next: [Sending webhooks](/notes/webhooks/03-sending) — the producer side in Go, in 60 lines, talking to a real receiver.

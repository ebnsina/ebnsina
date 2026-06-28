---
title: "A primer on durable execution"
description: "What durable execution actually buys you, when it's worth the complexity, and the two failure modes nobody warns you about."
date: 2026-04-28
tags: ["distributed-systems", "architecture", "reliability"]
minutesRead: 2
---

<script>
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

Most "background job" systems are durable in name only. They guarantee
the job was *enqueued*, not that it ran to completion. Durable execution
flips that promise: the workflow is the source of truth, the code is
just instructions to replay.

## The core idea

A durable execution engine records every side effect your workflow makes
&mdash; HTTP calls, DB writes, timer fires &mdash; into a log. On crash,
replay the log up to the last recorded step and continue from there.

```ts
// This survives process restarts, deploys, and partial failures.
async function chargeAndShip(ctx: Context, orderId: string) {
  const order = await ctx.run('load-order', () => db.orders.get(orderId));
  await ctx.run('charge', () => stripe.charge(order.total, order.card));
  await ctx.sleep('cooldown', '15m');
  await ctx.run('ship', () => fulfillment.ship(order));
}
```

If the process dies after `charge` but before `ship`, replay re-enters the
function, re-reads `load-order` and `charge` from the log (no re-execution),
sleeps for the *remaining* 15 minutes, and ships.

<Mermaid
	title="Durable execution: record, then replay"
	code={`
graph TD
  E["Durable Engine"] --> S1["run: load-order"]
  S1 --> S2["run: charge"]
  S2 --> S3["sleep 15m"]
  S3 --> S4["run: ship"]
  S1 -.->|append| L["Append-only Event Log"]
  S2 -.->|append| L
  S3 -.->|append| L
  S4 -.->|append| L
  L -.->|replay after crash| E
`}
/>

## When it's worth it

- Workflows that span minutes, hours, or days.
- Money or physical-world side effects where retries cost real dollars.
- "Saga"-style orchestration with compensations.

## When it isn't

- Anything that fits in a single request/response.
- Throughput-critical paths. The log is in the hot path.
- Teams without operational appetite for one more stateful system.

## Two failure modes nobody warns you about

1. **Non-determinism in workflow code.** Reading `Date.now()` directly
   means replay sees a different value. Engines wrap time, randomness,
   and UUID generation for a reason &mdash; bypass them and you break replay.
2. **Schema evolution.** Logs outlive code. When you rename a step from
   `charge` to `chargeCard`, in-flight workflows can't find their history.
   Either version steps or never rename them.

Durable execution is one of those technologies that feels like overkill
right up until the first time a deploy mid-charge would have lost an
order. Then it feels obvious.


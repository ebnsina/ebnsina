---
title: 'Transactions & Lua Scripting'
subtitle: 'MULTI/EXEC, optimistic locking with WATCH, and atomic multi-step logic with Lua.'
chapter: 7
level: 'advanced'
readingTime: '13 min'
topics: ['multi', 'lua', 'atomicity']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A single Redis command is atomic, but real operations often need several commands to happen together with nothing slipping in between. Redis offers two tools: transactions, which group commands, and Lua scripting, which runs arbitrary logic atomically on the server. Both rely on the single-threaded core — but Redis transactions behave differently from the database transactions you may expect, and that difference trips people up.

## MULTI / EXEC: grouping commands

`MULTI` opens a transaction. Commands typed after it are **queued**, not executed, each replying `QUEUED`. `EXEC` runs the whole batch atomically — no other client's command can interleave between them. `DISCARD` throws the queue away.

```text
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> SET account:a 100
QUEUED
127.0.0.1:6379> DECRBY account:a 20
QUEUED
127.0.0.1:6379> INCRBY account:b 20
QUEUED
127.0.0.1:6379> EXEC
1) OK
2) (integer) 80
3) (integer) 20
```

Between `MULTI` and `EXEC`, no other client runs. The three commands above execute as one indivisible unit. That is the guarantee — and the whole guarantee.

## Why these are not rollback transactions

Coming from SQL, you expect a transaction to be all-or-nothing: if any statement fails, the whole thing rolls back. **Redis does not do this.** If a queued command fails _at execution time_, the other commands still run, and there is no rollback.

```text
127.0.0.1:6379> SET counter "not-a-number"
OK
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> INCR counter        # will fail at EXEC — not an integer
QUEUED
127.0.0.1:6379> SET flag "done"     # this still runs
QUEUED
127.0.0.1:6379> EXEC
1) (error) ERR value is not an integer or out of range
2) OK                                # flag was set despite the error above
```

There are two kinds of failure to distinguish:

- **Errors detected at queue time** (a syntactically wrong command, an unknown command) abort the whole transaction — `EXEC` refuses to run it. This is checked since modern Redis versions.
- **Errors detected at run time** (like `INCR` on a non-numeric value) do _not_ abort the others. The bad command returns an error inside the `EXEC` result array, and everything else still applies.

Redis's author defends this deliberately: run-time errors are almost always programming bugs that would be caught in development, and omitting rollback keeps the server simple and fast. The practical takeaway is to stop thinking "transaction = safety net" and think "transaction = these commands run together, isolated, with no rollback." If a step can fail meaningfully, you must handle it yourself — and Lua is usually the better fit.

<Callout type="warning">

**Note:** A Redis transaction gives you **atomic isolation** (no interleaving) but **not atomic rollback**. Do not assume a failed command undoes its predecessors — it does not. If your logic genuinely needs "all or nothing" with conditional steps, reach for a Lua script, which lets you check conditions and decide before mutating anything.

</Callout>

## WATCH: optimistic locking

A transaction alone cannot make a decision based on current data, because the commands are queued before they run. `WATCH` bridges that gap with **optimistic concurrency control**: you watch one or more keys, read them, build your transaction based on what you saw, and `EXEC` succeeds only if none of the watched keys changed in the meantime. If any did, `EXEC` returns nil and you retry.

```text
127.0.0.1:6379> WATCH stock:item42
OK
127.0.0.1:6379> GET stock:item42
"3"
# application logic: 3 > 0, so we may decrement
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> DECR stock:item42
QUEUED
127.0.0.1:6379> EXEC
1) (integer) 2          # success: nobody else touched stock:item42
```

If another client modified `stock:item42` after the `WATCH` but before the `EXEC`, then `EXEC` returns `(nil)` and nothing is applied — you loop and try again. This is "optimistic" because it assumes conflicts are rare and only pays a cost (a retry) when one actually happens, unlike a pessimistic lock that blocks everyone up front. It is the right tool for low-contention check-then-act sequences.

## Lua scripting: atomic logic on the server

`WATCH` retries get awkward when the logic is complex. Lua scripting sidesteps that entirely: you send a script with `EVAL`, and Redis runs the _whole script_ atomically — no other command interleaves, no network round-trips between steps, and the script can branch on values it reads.

```lua
-- Atomic conditional decrement: only if stock remains
-- KEYS[1] = stock key, ARGV[1] = amount to remove
local current = tonumber(redis.call("GET", KEYS[1]))
if current and current >= tonumber(ARGV[1]) then
    return redis.call("DECRBY", KEYS[1], ARGV[1])
else
    return -1            -- signal "not enough stock"
end
```

```text
127.0.0.1:6379> SET stock:item42 5
OK
127.0.0.1:6379> EVAL "local c=tonumber(redis.call('GET',KEYS[1])) if c and c>=tonumber(ARGV[1]) then return redis.call('DECRBY',KEYS[1],ARGV[1]) else return -1 end" 1 stock:item42 2
(integer) 3
127.0.0.1:6379> EVAL "local c=tonumber(redis.call('GET',KEYS[1])) if c and c>=tonumber(ARGV[1]) then return redis.call('DECRBY',KEYS[1],ARGV[1]) else return -1 end" 1 stock:item42 10
(integer) -1
```

The call shape is `EVAL script numkeys key [key ...] arg [arg ...]`. Keys go through `KEYS` and other parameters through `ARGV` — keep all key names in `KEYS` so the script works correctly in Cluster mode (chapter 8), which routes by key.

To avoid resending the script body every time, load it once and call it by SHA hash:

```text
127.0.0.1:6379> SCRIPT LOAD "return redis.call('GET', KEYS[1])"
"a5260dd66ce02462c5b5231c727b3f7772c0bcc5"
127.0.0.1:6379> EVALSHA a5260dd66ce02462c5b5231c727b3f7772c0bcc5 1 greeting
"hello"
```

Why Lua beats a `WATCH` loop for hard cases: the entire decision-and-mutation happens in one atomic, server-side step. There is nothing to retry because nothing can interleave, and there are no extra round-trips. The earlier safe lock-release (chapter 6) — check the token, then delete only if it matches — is a perfect example: as a Lua script it is atomic; as separate `GET` then `DEL` commands it has a race.

<Callout type="info">

**Note:** Because a script blocks the single thread until it finishes, keep scripts short and avoid long loops or O(N) work over big collections inside them. A slow script stalls every other client, exactly like a slow command. Lua is for _atomic_, _small_ multi-step logic — not for batch processing.

</Callout>

## Redis Functions

Newer Redis versions add **Functions**, an evolution of scripting. Instead of an app sending script text on the fly, you register a named library of functions on the server with `FUNCTION LOAD`, then invoke them by name with `FCALL`. This treats server-side logic as first-class, deployable code — versioned, listed with `FUNCTION LIST`, and persisted/replicated with the dataset — rather than ad-hoc strings scattered through the application. The atomicity and execution model are the same as `EVAL`; Functions mainly improve how that logic is organized and shipped.

The mental model for the whole chapter: use **MULTI/EXEC** to group independent commands, **WATCH** for simple optimistic check-then-act, and **Lua (or Functions)** whenever the logic needs to read a value and branch before deciding what to write.

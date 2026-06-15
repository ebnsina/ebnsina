---
title: "Presence and rooms"
subtitle: "Knowing who is online and which channel they are watching looks easy in a one-process demo and is genuinely hard at scale. The data model is half the work; the eviction story is the other half."
chapter: 7
level: "intermediate"
readingTime: "12 min"
topics: ["websockets", "presence", "rooms", "redis", "sets"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

In chapter 6 we wired multi-process pub/sub. This chapter answers two questions every realtime app eventually faces:

- **Presence:** who is currently online? How do we tell the rest of the room when someone joins or leaves?
- **Rooms:** which clients are subscribed to which channels? How do we keep that map consistent across processes when clients can reconnect to any of them?

Both are state-tracking problems. The trap is: connections die in many ways, and a stale presence record is worse than no record. Get the eviction right or your "who is online" widget shows ghosts.

<Callout type="info">

**Real-World Analogy**

Presence tracking is like a physical room where you can see who has walked in and who has left — the challenge is knowing when someone slipped out without saying goodbye.

</Callout>

## Per-process presence — the easy part

If you only run one process, presence is in-memory. Chapter 6 already had `rooms map[string]map[*Client]struct{}`. For each room you can iterate the clients and emit presence events:

```go
func (h *Hub) onJoin(c *Client, room string) {
    h.publish(ctx, room, mustJSON(map[string]any{
        "type": "presence.joined",
        "data": map[string]any{
            "userId": c.userID,
            "name":   c.name,
        },
    }))
}

func (h *Hub) listMembers(room string) []string {
    h.mu.Lock()
    defer h.mu.Unlock()
    out := make([]string, 0, len(h.rooms[room]))
    for c := range h.rooms[room] {
        out = append(out, c.userID)
    }
    return out
}
```

When the client connects, send them the current member list. When others join or leave, broadcast a `presence.joined` / `presence.left` event. This is the entire pattern, and it works perfectly inside one process.

The moment you scale to multiple processes (chapter 6), `listMembers` only sees clients connected to the local process. You need a shared store.

## Multi-process presence — Redis sets

The natural shape is a Redis **set** per room: `presence:room:general` contains every user ID currently in `general`. Adding a member, removing, listing, and counting are O(1) or O(N) ops:

```go
// on join
rdb.SAdd(ctx, "presence:room:" + room, userID)

// on leave
rdb.SRem(ctx, "presence:room:" + room, userID)

// list members
rdb.SMembers(ctx, "presence:room:" + room).Result()

// count members
rdb.SCard(ctx, "presence:room:" + room).Result()
```

After every change, publish a `presence.changed` event so other processes (and their clients) hear about it.

This works until a process crashes without cleaning up. Then the set has stale members forever, and your "who is online" widget shows people who aren't.

## Ghosts and how to evict them

Three sources of stale presence:

1. **Process crashed.** It never ran the leave handler.
2. **Network died.** Process is alive but the client is gone; the disconnect detection took minutes.
3. **Same user, two devices.** They have two connections; closing one doesn't make them offline.

The fix: presence entries **expire** unless renewed. Treat each connected client as holding a renewable lease.

The pattern: store presence as a **Redis hash with per-member timestamps**, plus a separate sorted set indexed by expiry, plus a periodic sweeper.

Simpler version that handles 90% of cases: **per-connection key with a TTL, refreshed by heartbeats**.

```go
// every 30 seconds, while connected:
rdb.SetEX(ctx, "presence:conn:" + connID, userID, 60*time.Second)

// roster: the user IDs of every connection currently alive
// scan keys matching "presence:conn:*" — but SCAN is heavy

// better: keep the room → user mapping in a sorted set with score = expiry
// on each heartbeat:
rdb.ZAdd(ctx, "presence:room:" + room, redis.Z{
    Score:  float64(time.Now().Add(60 * time.Second).Unix()),
    Member: connID,
})

// to read members: drop expired first, then list
rdb.ZRemRangeByScore(ctx, "presence:room:" + room, "-inf", strconv.FormatInt(time.Now().Unix(), 10))
ids, _ := rdb.ZRange(ctx, "presence:room:" + room, 0, -1).Result()
```

Sorted sets with expiry-as-score are the standard pattern. A read either trims expired entries or ignores them; a write re-scores the entry to push its expiry forward.

The **score** is the expiry timestamp. A periodic sweeper (or every reader) drops members whose score is in the past. Even if a process dies, its members age out within one heartbeat interval.

<Callout type="warn">

**Do not try to make presence perfectly accurate.** A 30-second window where a crashed process's members linger is fine. Trying to make it instant requires distributed coordination that adds complexity for little real benefit. Pick a heartbeat interval (15–60 seconds), accept that staleness is bounded, document it, move on.

</Callout>

## The heartbeat itself

In the WebSocket world, you already have control-frame pings (chapter 2). Use *application-level* heartbeats for presence:

```go
ticker := time.NewTicker(30 * time.Second)
defer ticker.Stop()

for {
    select {
    case <-ctx.Done():
        return
    case <-ticker.C:
        h.refreshPresence(client)
    }
}
```

Refresh updates the sorted set entry for this connection, pushing the expiry 60 seconds out. If the process dies, the entries age out; if the client disconnects gracefully, you `ZREM` them immediately.

The refresh should ride on the writer goroutine's existing context — when the writer dies (any reason), you stop refreshing, and Redis evicts.

## Multi-device users

A single user has two laptops open. Both connect; both add to presence. They count once for "is the user online" but you need both connections for "send them this message."

The model:

- **Connection-level identity:** `connID` (random UUID per connection).
- **User-level identity:** `userID` (the logged-in user).

Track both. Presence sorted set members are `connID`; you also maintain `presence:user:42 → set of connIDs`. The user is online iff `presence:user:42` is non-empty.

When all of a user's connections drop (or expire), they go offline; emit a `presence.user.left` event. When the first connection appears, `presence.user.joined`.

Most apps need both granularities. "Send to user" needs a list of conn IDs (broadcast to all of them); "is user online" needs the user-level rollup.

## Joining and leaving rooms

Three patterns for room subscription, in order of complexity:

**1. Permanent rooms.** Like Slack channels. You either are a member (server-side persisted) or not. Joining writes a row; leaving removes it. Reconnect re-subscribes to all your rooms.

**2. Ephemeral rooms.** Like a live document. Join creates a room if it doesn't exist; leave possibly deletes it (if last member). Server doesn't persist membership across disconnects.

**3. Reactive rooms.** Like a "viewers" indicator. Joining is implicit (user opens the page); leaving is implicit (user closes it). Membership is purely the live presence set.

The implementation pattern is the same — a per-room presence set — but the **persistence story** differs. Permanent rooms need a `room_members` table; ephemeral rooms only need Redis; reactive rooms only need the presence sweeper.

## Subscribing to rooms across the bus

When a process has clients in `room:general`, it should be subscribed to the Redis channel `room:general`. As clients move (join/leave), subscriptions change.

Two approaches.

**A. Pattern-subscribe to everything.**

```go
sub := rdb.PSubscribe(ctx, "room:*")
```

The process receives every room's events; it filters by matching against local clients. Simple. Wasteful at scale (every process gets every event for every room).

**B. Subscribe per-room as the first local client joins.**

```go
func (h *Hub) join(c *Client, room string) {
    h.mu.Lock()
    first := len(h.rooms[room]) == 0
    h.rooms[room][c] = struct{}{}
    h.mu.Unlock()
    if first {
        h.subscribeRoom(room)
    }
}
```

On the last client leaving the room locally, unsubscribe. Each process only listens to rooms it has clients in. Scales to thousands of rooms.

Pick approach A for a few hundred rooms, B for thousands or more. Most chat-style apps do A and never feel the cost.

## Presence as a feature spec

A real presence feature usually has more requirements than "online/offline":

- **Idle vs active.** User has been idle for 5 minutes; show them as away. The client tells you (mouse moved? keypress?). Presence sets become hashes carrying status.
- **Custom status.** "in a meeting", "🍌 lunch". Stored as a field per user.
- **Typing indicators.** A bursty, ephemeral presence — appear when typing, disappear after 5 seconds. Either short-TTL Redis keys or a pure pub/sub broadcast.
- **Last-seen.** Even when offline, "last seen 2 hours ago." Persist `last_seen_at` to Postgres on disconnect.

Each is a small extension. The common pattern: `presence:user:42` is a hash carrying `status`, `device`, `since`, etc. Heartbeat refreshes the TTL. Other clients subscribe to a Redis channel for changes.

## Reconnects and presence

A flaky client reconnects every minute. Presence ping-pongs: leave/join/leave/join.

To smooth this, **debounce** the offline event. When a connection dies, do not immediately fire `presence.user.left`. Wait some grace period (15–30 seconds). If the user reconnects within it, suppress the event.

```go
func (h *Hub) onDisconnect(client *Client) {
    h.removeConn(client)
    if h.userOnlineConns(client.userID) == 0 {
        time.AfterFunc(20*time.Second, func() {
            if h.userOnlineConns(client.userID) == 0 {
                h.broadcastUserLeft(client.userID)
            }
        })
    }
}
```

Without this, a 1-second network blip causes every other client to see the user disappear and reappear. Annoying for chat, fatal for collaborative editing.

## Presence with SSE

Same patterns work with SSE. The differences:

- The server pushes presence events; the client cannot say "I joined a room" over SSE — it does that via a normal `POST /rooms/:id/join`.
- Subscriptions are still per-server-connection (one SSE stream per browser).
- Heartbeats can be the SSE comment lines (chapter 5) — same liveness check.

Where WebSockets feel natural for chat (typing back), SSE plus REST is the right shape for "show me presence + I commit changes via REST" — collaborative documents often work this way.

## Storage and limits

A few sizing notes for Redis-based presence:

- A sorted set with 10,000 members is small (a few hundred KB). Redis handles millions easily.
- Heartbeat traffic at 30s intervals × 10K connected users = 333 ops/sec. Trivial.
- The sweeper running every 60s and dropping expired members from each room is amortised across all reads (any reader can run `ZREMRANGEBYSCORE` first).
- For very large fan-out (100K+ users in one room), consider sampling or pagination — sending a "who's here" event with a hundred members is more useful than ten thousand.

## Recap

- Presence is state-tracking with eviction. The eviction is the hard part.
- Single process: in-memory map. Multi-process: Redis sorted set with expiry-as-score.
- Heartbeats refresh entries. If a process dies, members age out within one heartbeat window.
- Track at two levels: per-connection (for routing) and per-user (for "is online").
- Rooms come in three flavours: permanent, ephemeral, reactive. Same data shape, different persistence.
- Subscribe per-room (B) for thousands of rooms; pattern-subscribe (A) for hundreds.
- Debounce disconnect events with a grace period to avoid flicker.
- Presence as a feature: idle/active, custom status, typing indicators, last-seen — all small extensions.
- Same patterns work for SSE — separate the read channel (SSE) from the write channel (REST).

Next: [Auth, origin, and rate limits](/notes/websockets/08-auth-origin) — production-safe handshakes that survive the open internet.


---
title: "Backpressure, reconnects, heartbeats"
subtitle: "Networks drop. Clients stall. Tabs sleep. The patterns in this chapter are the difference between a WebSocket service that runs for a week and one that limps for an hour."
chapter: 9
level: "advanced"
readingTime: "13 min"
topics: ["websockets", "backpressure", "reconnect", "heartbeat", "resilience"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A demo WebSocket server works. A production one survives the worst clients on the worst networks for weeks. The gap is filled by three concerns:

- **Backpressure** — slow consumers can take down a server unless you bound their effect.
- **Heartbeats** — TCP does not detect dead peers fast enough; you need an application-layer check.
- **Reconnects** — clients will disconnect; the server and client both need to behave well when they do.

Each is small in isolation. Get all three right and the service feels boring.

<Callout type="info">

**Real-World Analogy**

Backpressure is like a pressure valve on a garden hose — without it, too much flow bursts the hose; the valve lets you control the rate so the system stays intact.

</Callout>

## Backpressure recap

Chapter 3 introduced the per-client buffered channel and the drop-on-full pattern. Chapter 6 extended it to multi-process pub/sub. The principle:

> Never let a slow client slow down the rest of the system.

There are only three things to do when a client cannot keep up:

1. **Buffer.** Some queue depth absorbs short stalls.
2. **Drop.** Past the buffer, throw messages away.
3. **Disconnect.** If drops become a pattern, kill the connection.

Each has a place. Buffering alone fails on sustained slowness (memory blowup). Dropping alone makes a slow client invisibly broken. Disconnecting alone is too aggressive for transient hiccups.

## A real backpressure policy

```go
type Client struct {
    conn  *websocket.Conn
    out   chan []byte
    drops int
}

const (
    bufferSize        = 64
    maxConsecutiveDrops = 100
)

func (h *Hub) deliver(c *Client, msg []byte) {
    select {
    case c.out <- msg:
        c.drops = 0
    default:
        c.drops++
        if c.drops > maxConsecutiveDrops {
            log.Printf("disconnecting slow client %s (drops=%d)", c.id, c.drops)
            c.conn.Close(websocket.StatusPolicyViolation, "too slow")
        }
    }
}
```

64 buffered messages absorbs network jitter. If the client cannot drain that within ~hundreds of messages of new traffic, it is unhealthy. Disconnect; let it reconnect when it can keep up.

The exact numbers depend on your traffic. For chat at 1 msg/sec, a 64-message buffer is over a minute of slack. For a high-frequency dashboard at 100 msg/sec, it is under a second; raise the buffer to 1024 and the disconnect threshold accordingly.

## Write timeouts

A separate failure mode: `conn.Write` itself blocks forever because the kernel's TCP send buffer is full and the network is wedged. `coder/websocket` requires you to pass a context — use one with a timeout:

```go
go func() {
    for msg := range c.out {
        wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
        err := c.conn.Write(wctx, websocket.MessageText, msg)
        cancel()
        if err != nil {
            return // writer goroutine exits, reader will too
        }
    }
}()
```

10 seconds is generous; 5 is fine for most apps. If a write to the network does not complete in that window, the connection is effectively dead — close and move on.

## Heartbeats — protocol level vs application level

Two complementary patterns.

**Protocol-level pings.** RFC 6455 ping/pong frames. The library handles it transparently when you configure it:

```go
// coder/websocket already pings periodically; tune via context and Read:
// the read context's deadline acts as the inactivity timeout
```

Practically, `coder/websocket` sends pings when the connection has been idle, and a missed pong via the read context's deadline becomes a read error. The default behaviour is fine; you do not write ping code.

**Application-level pings.** Your own protocol's `{"type":"ping"}` and `{"type":"pong"}`. Useful for:

- Carrying timestamps for latency measurement.
- Working through proxies that strip or buffer protocol-level pings.
- Detecting half-open connections from the client side without privileged access.

Most apps do both: protocol-level pings handled by the library, application-level pings every 30 seconds for health and latency.

```js
// client side
setInterval(() => {
    ws.send(JSON.stringify({ type: "ping", t: Date.now() }));
}, 30_000);

ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "pong") {
        const rtt = Date.now() - msg.t;
        console.log("rtt", rtt, "ms");
    }
});
```

The server echoes `{"type":"pong","t":<original>}`. Easy. Now you have round-trip-time per connection — log it, alert on spikes.

## Why pings keep middleboxes happy

NAT routers, corporate proxies, mobile carrier middleboxes drop "idle" connections after some duration. The thresholds are inconsistent — sometimes 30 seconds, sometimes minutes. Pings keep traffic flowing so the connection looks active.

If your app sees connections die after ~1 minute of inactivity, something in the path is dropping idle TCP. Add a ping every 25 seconds and the issue disappears. This is the single most common cause of "WebSockets work locally but die in production."

## Detecting half-open connections

A "half-open" connection is one where the TCP state on one side is alive but the other side is gone (network blip, peer crashed, NAT box dropped state). Without traffic, neither side notices for a long time.

Both sides should:

- Send pings periodically.
- Set a **read deadline** on the connection that exceeds the ping interval.

If pings are every 25s and the read deadline is 60s, a missed two-ping-cycle without traffic kills the connection. The `coder/websocket` `Read(ctx)` honors the context deadline; chain a `context.WithTimeout` around each Read inside the reader loop:

```go
for {
    rctx, rcancel := context.WithTimeout(ctx, 60*time.Second)
    _, data, err := conn.Read(rctx)
    rcancel()
    if err != nil {
        return // dead or timed out
    }
    handle(data)
}
```

Combined with periodic pings (which generate inbound pong frames or app-level messages), the deadline only fires when truly nothing arrived for a minute.

## Server-side reconnection logic — there isn't any

Important realization: the server does not reconnect. The server only handles disconnects gracefully. The client is responsible for reconnecting.

Server side:

- Detect disconnect quickly (timeouts above).
- Run all cleanup (`leave` from rooms, decrement presence, drop subscriptions).
- Log the disconnect with reason.
- Wait for the reconnect — it will come from somewhere, likely the same user.

Server has zero state about "this is the same client coming back." All it sees is a fresh handshake. The client carries identity (auth token, user ID, last-seen-event) — server matches.

## Client-side reconnect — exponential backoff

```js
class ReconnectingWS {
    constructor(url, onMessage) {
        this.url = url;
        this.onMessage = onMessage;
        this.attempts = 0;
        this.connect();
    }

    connect() {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            this.attempts = 0;
            console.log("ws connected");
        };

        this.ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));

        this.ws.onclose = (e) => {
            if (e.code === 1000 || e.code === 1001) {
                return; // intentional close, do not reconnect
            }
            const delay = Math.min(30_000, 500 * 2 ** this.attempts);
            const jitter = Math.random() * 0.3 * delay;
            this.attempts++;
            setTimeout(() => this.connect(), delay + jitter);
        };
    }

    send(msg) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        } else {
            // queue or drop — application choice
        }
    }
}
```

Three production-flavoured details.

**1. Backoff with cap.** 500ms, 1s, 2s, 4s, 8s, 16s, 30s, then plateau. Never reconnect faster than 500ms — a permanent failure becomes a denial-of-service against your own server.

**2. Jitter.** Without it, a server outage means every client reconnects at the same instant when service returns, and you get a thundering herd. ~30% jitter spreads the reconnects.

**3. Don't reconnect on intentional closes.** Codes `1000` (normal) and `1001` (going away) mean the server told you to leave. Respect it.

For a production-ready client, libraries like `partysocket`, `reconnecting-websocket`, or `nice-grpc-web` (for the gRPC-Web case) handle this for you. Roll your own only if you understand the cases above.

## Resumption — picking up where you left off

A reconnect that just opens a fresh stream loses everything that happened during the disconnection. For chat, that is usually fine; the client requests history on reconnect via REST. For a notification stream where every event matters, you need resumption.

Pattern: every server-pushed message has a sequence ID. The client tracks the last one it saw. On reconnect, the client sends `last_seq` and the server replays from there.

```js
ws.send({ type: "subscribe", room: "general", lastSeq: this.lastSeq });
```

Server-side requires:

- A persistent log of recent events per room (Redis Streams, Postgres, NATS JetStream).
- A subscription handler that backfills from the log up to "now" before joining the live stream.

Identical to SSE's `Last-Event-ID` (chapter 5). Build it once, reuse the data store across both protocols.

## Page visibility and tab sleep

When a browser tab is hidden, the OS may throttle or suspend timers and JS execution. `setInterval` for a heartbeat may not fire on schedule. The WebSocket itself does not close — the tab is paused, not gone.

Two practical effects:

1. **Server pings still arrive.** The connection stays alive; it just queues messages.
2. **On tab focus, the client sees a flood of messages.** Buffer client-side and process at a sane pace.

The `Page Visibility API` lets you handle the transitions:

```js
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        // catch up on missed messages, refresh state
    }
});
```

For some apps the right move is to **disconnect when hidden** to free server resources, **reconnect** (with resumption) when visible. Worth it when you have many users with many tabs idle.

## Mobile — the network is hostile

Mobile networks roam, hand off between cells, lose signal in tunnels. Connections drop frequently. Two patterns help:

1. **Aggressive heartbeats** (every 15 seconds) detect drops faster. Worth the bandwidth cost.
2. **Faster initial reconnect** on mobile clients — start at 250ms, jitter 50%. The user is more likely to be in a quick recovery from a brief drop.

For pure-mobile apps, libraries like `Starscream` (iOS), `OkHttp WebSocket` (Android), or `flutter_socket_io` already handle reconnect; tune the cadence.

## Graceful server shutdown

When the server is restarting:

1. **Stop accepting new connections.** `srv.SetKeepAlivesEnabled(false)` plus a healthcheck flip.
2. **Tell connected clients to reconnect.** Send `{"type":"reconnect","data":{"after":2000}}` then close with `1001 GoingAway`.
3. **Wait for in-flight closes** with a deadline (30s).
4. **Force-close** the rest.

```go
sigs := make(chan os.Signal, 1)
signal.Notify(sigs, syscall.SIGTERM, syscall.SIGINT)

<-sigs
log.Println("draining...")
hub.broadcastReconnectHint(2000)
time.Sleep(2 * time.Second) // let clients see it

deadline := time.Now().Add(30 * time.Second)
hub.closeAllByDeadline(websocket.StatusGoingAway, deadline)

srv.Shutdown(context.Background())
```

Combined with client-side backoff and jitter, this lets you deploy without thousands of clients reconnecting at the same instant.

## Recap

- Backpressure: bounded buffer, drop-on-full, disconnect after sustained drops.
- Write timeouts on every `conn.Write`. The connection is dead if writes hang.
- Pings: protocol-level handled by the library; application-level for latency and proxy friendliness.
- Read deadline that exceeds ping interval — detects half-open connections.
- Server doesn't reconnect; clients do, with exponential backoff plus jitter, capped at 30s.
- Don't reconnect on close codes 1000 and 1001.
- Resumption: client tracks last sequence, server backfills from a persistent log.
- Tab visibility: handle catch-up on focus; disconnect-when-hidden for high-traffic apps.
- Mobile: tighter heartbeats, faster initial reconnect.
- Graceful shutdown: stop new connections, hint reconnect, drain, force-close at deadline.

Next: [Production self-host](/notes/websockets/10-production) — nginx, systemd, observability, and scaling out on a VPS.


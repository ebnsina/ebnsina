---
title: 'Backpressure, reconnects, heartbeats'
subtitle: 'Network ড্রপ করে। Client stall করে। Tab ঘুমায়। এই চ্যাপ্টারের প্যাটার্নগুলোই একটা WebSocket service যা এক সপ্তাহ চলে আর একটা যা এক ঘণ্টা খুঁড়িয়ে চলে — এদের মধ্যে পার্থক্য।'
chapter: 9
level: 'advanced'
readingTime: '13 মিনিট'
topics: ['websockets', 'backpressure', 'reconnect', 'heartbeat', 'resilience']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

আল-খোয়ারিজমির কারখানায় একটা লম্বা conveyor belt চলে — একদিক থেকে পার্সেল আসে, অন্য মাথায় বসে ইবনে সিনা সেগুলো একটা একটা করে বাক্সে ভরে সিল করে। belt-এর গতি ঠিক থাকলে সব মসৃণ। কিন্তু একদিন পার্সেল আসার হার হঠাৎ বেড়ে গেল, আর ইবনে সিনা হাত চালিয়েও কুলিয়ে উঠতে পারছিলেন না। তার সামনে পার্সেল জমতে জমতে টাল হয়ে যাচ্ছিল, একটু পরেই মেঝেতে গড়িয়ে পড়ে ভাঙার দশা। তাই belt-এর সাথে একটা sensor জুড়ে দেওয়া হলো — packer পিছিয়ে পড়লে belt নিজে থেকেই গতি কমায়, দরকারে খানিক জমতে দেয় (একটা ছোট ট্রে-তে), আর ট্রে-ও উপচে গেলে belt একদম থামিয়ে দেয়। packer সামলে নিলে belt আবার স্বাভাবিক গতিতে চলে।

তার উপরে সুপারভাইজার ফাতিমা আল-ফিহরি প্রতি মিনিটে একবার হাঁক দেন — "আছো তো?" — আর packer-কে "হ্যাঁ" বলে জবাব দিতে হয়। কোনো মিনিটে জবাব না এলে ধরে নেওয়া হয় packer কাহিল হয়ে পড়েছে, সাথে সাথে খোঁজ নেওয়া হয়। আর belt-টা যদি কখনো ছিঁড়ে যায়, সেটা তক্ষুনি আবার চালু করার চেষ্টা হয় না — আগে অল্প কয়েক সেকেন্ড থামা, না হলে আরেকটু বেশি, তারপরও না হলে আরও বেশি — এভাবে বাড়তে থাকা বিরতি দিয়ে belt নিজে থেকে রিস্টার্ট হয়, যাতে একসাথে ঝাঁকুনি দিয়ে পুরো মোটর পুড়ে না যায়।

এই কারখানাটাই আসলে একটা টেকসই WebSocket connection। belt-এর গতি packer-এর সাথে মিলিয়ে কমানো আর ট্রে-তে জমতে দেওয়াটাই **backpressure** — slow client সামলাতে message buffer করা, দরকারে drop করা, একদম না পারলে connection বন্ধ করা। সুপারভাইজারের প্রতি মিনিটের "আছো তো?" আর তার জবাবটাই **heartbeat** বা **ping/pong** — জবাব না এলে মরা connection দ্রুত ধরা পড়ে। আর belt ছিঁড়লে বাড়তে থাকা বিরতি দিয়ে রিস্টার্ট করাটাই **reconnect with exponential backoff** — drop হলে client প্রতিবার একটু বেশি সময় অপেক্ষা করে আবার connect করে, যাতে server-এর উপর একসাথে ঝাঁপিয়ে না পড়ে (thundering herd)। বাস্তবে এই তিনটা প্যাটার্নই একটা service-কে "এক সপ্তাহ চলে" আর "এক ঘণ্টা খুঁড়িয়ে চলে"-র মধ্যে আলাদা করে দেয়।

একটা demo WebSocket server কাজ করে। একটা production-টা সবচেয়ে খারাপ network-এ সবচেয়ে খারাপ client-দের সপ্তাহের পর সপ্তাহ টিকিয়ে রাখে। ব্যবধানটা তিনটা বিষয় দিয়ে ভরাট:

- **Backpressure** — slow consumer একটা server নামিয়ে দিতে পারে যদি না আপনি তাদের প্রভাব bound করেন।
- **Heartbeat** — TCP dead peer যথেষ্ট দ্রুত detect করে না; আপনার একটা application-layer check দরকার।
- **Reconnect** — client disconnect করবেই; disconnect করলে server আর client দুজনকেই ভালো আচরণ করতে হবে।

প্রতিটা বিচ্ছিন্নভাবে ছোট। তিনটাই ঠিক করুন আর service একঘেয়ে লাগে।

<Callout type="info">

**বাস্তব উদাহরণ**

Backpressure হলো একটা garden hose-এর উপর একটা pressure valve-এর মতো — এটা ছাড়া, অতিরিক্ত flow hose ফাটায়; valve আপনাকে rate control করতে দেয় যাতে system অক্ষত থাকে।

</Callout>

## Backpressure recap

চ্যাপ্টার 3 per-client buffered channel আর drop-on-full প্যাটার্ন introduce করেছিল। চ্যাপ্টার 6 এটা multi-process pub/sub-এ বিস্তৃত করেছিল। নীতি:

> কখনো একটা slow client-কে বাকি system slow করতে দেবেন না।

একটা client keep up করতে না পারলে করার মাত্র তিনটা জিনিস আছে:

1. **Buffer.** কিছু queue depth ছোট stall শোষণ করে।
2. **Drop.** buffer পার হলে, message ফেলে দিন।
3. **Disconnect.** drop একটা প্যাটার্ন হয়ে গেলে, connection kill করুন।

প্রতিটার একটা জায়গা আছে। শুধু buffering sustained slowness-এ fail করে (memory blowup)। শুধু dropping একটা slow client-কে অদৃশ্যভাবে ভাঙা করে। শুধু disconnect করা transient hiccup-এর জন্য অতিরিক্ত আক্রমণাত্মক।

## একটা বাস্তব backpressure policy

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

64 buffered message network jitter শোষণ করে। client যদি নতুন traffic-এর ~শত শত message-এর মধ্যে সেটা drain করতে না পারে, এটা unhealthy। Disconnect করুন; keep up করতে পারলে এটাকে reconnect করতে দিন।

সঠিক সংখ্যা আপনার traffic-এর উপর নির্ভর করে। 1 msg/sec-এ chat-এর জন্য, একটা 64-message buffer এক মিনিটের বেশি slack। 100 msg/sec-এ একটা high-frequency dashboard-এর জন্য, এটা এক সেকেন্ডের কম; buffer 1024-এ বাড়ান আর disconnect threshold সেই অনুযায়ী।

## Write timeout

একটা আলাদা failure mode: `conn.Write` নিজেই চিরকাল block করে কারণ kernel-এর TCP send buffer full আর network আটকে গেছে। `coder/websocket`-এ আপনাকে একটা context pass করতে হয় — একটা timeout সহ একটা ব্যবহার করুন:

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

10 সেকেন্ড উদার; বেশিরভাগ app-এর জন্য 5 ঠিক আছে। network-এ একটা write যদি সেই window-এ সম্পন্ন না হয়, connection কার্যত মৃত — close করুন আর এগিয়ে যান।

## Heartbeat — protocol level vs application level

দুটো পরিপূরক প্যাটার্ন।

**Protocol-level ping.** RFC 6455 ping/pong frame। আপনি configure করলে library এটা স্বচ্ছভাবে সামলায়:

```go
// coder/websocket already pings periodically; tune via context and Read:
// the read context's deadline acts as the inactivity timeout
```

বাস্তবিকভাবে, connection idle থাকলে `coder/websocket` ping পাঠায়, আর read context-এর deadline-এর মাধ্যমে একটা missed pong একটা read error হয়ে যায়। Default behaviour ঠিক আছে; আপনি কোনো ping code লেখেন না।

**Application-level ping.** আপনার নিজের protocol-এর `{"type":"ping"}` আর `{"type":"pong"}`। কাজে লাগে:

- latency measurement-এর জন্য timestamp বহন করতে।
- যে proxy protocol-level ping strip বা buffer করে তার ভেতর দিয়ে কাজ করতে।
- privileged access ছাড়া client side থেকে half-open connection detect করতে।

বেশিরভাগ app দুটোই করে: library দিয়ে সামলানো protocol-level ping, health আর latency-র জন্য প্রতি 30 সেকেন্ডে application-level ping।

```js
// client side
setInterval(() => {
	ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
}, 30_000);

ws.addEventListener('message', (e) => {
	const msg = JSON.parse(e.data);
	if (msg.type === 'pong') {
		const rtt = Date.now() - msg.t;
		console.log('rtt', rtt, 'ms');
	}
});
```

server `{"type":"pong","t":<original>}` echo করে। সহজ। এখন আপনার প্রতি connection-এ round-trip-time আছে — এটা log করুন, spike-এ alert দিন।

## ping কেন middlebox-দের খুশি রাখে

NAT router, corporate proxy, mobile carrier middlebox কিছু সময় পর "idle" connection ড্রপ করে। threshold অসামঞ্জস্যপূর্ণ — কখনো 30 সেকেন্ড, কখনো মিনিট। Ping traffic চালু রাখে যাতে connection active দেখায়।

আপনার app যদি ~1 মিনিট inactivity-র পর connection মারা যেতে দেখে, path-এর কিছু idle TCP ড্রপ করছে। প্রতি 25 সেকেন্ডে একটা ping যোগ করুন আর সমস্যা মিলিয়ে যায়। এটা "WebSockets locally কাজ করে কিন্তু production-এ মারা যায়"-এর একক সবচেয়ে সাধারণ কারণ।

## Half-open connection detect করা

একটা "half-open" connection হলো এমন একটা যেখানে এক পক্ষের TCP state জীবিত কিন্তু অন্য পক্ষ চলে গেছে (network blip, peer crash, NAT box state ড্রপ)। traffic ছাড়া, কোনো পক্ষ অনেকক্ষণ টের পায় না।

দুই পক্ষেরই উচিত:

- periodic-ভাবে ping পাঠানো।
- connection-এ একটা **read deadline** set করা যা ping interval-এর বেশি।

ping যদি প্রতি 25s আর read deadline 60s হয়, traffic ছাড়া দুই-ping-cycle miss connection kill করে। `coder/websocket`-এর `Read(ctx)` context deadline সম্মান করে; reader loop-এর ভেতরে প্রতিটা Read-এর চারপাশে একটা `context.WithTimeout` chain করুন:

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

periodic ping-এর (যা inbound pong frame বা app-level message তৈরি করে) সাথে মিলিত, deadline শুধু তখনই fire করে যখন সত্যিই এক মিনিট কিছু আসেনি।

## Server-side reconnection logic — কোনোটা নেই

গুরুত্বপূর্ণ উপলব্ধি: server reconnect করে না। server শুধু disconnect gracefully সামলায়। reconnect করার দায়িত্ব client-এর।

Server side:

- disconnect দ্রুত detect করুন (উপরের timeout)।
- সব cleanup চালান (room থেকে `leave`, presence decrement, subscription drop)।
- reason সহ disconnect log করুন।
- reconnect-এর জন্য অপেক্ষা করুন — এটা কোথাও থেকে আসবে, সম্ভবত একই user।

Server-এর "এটা একই client ফিরে আসছে" সম্পর্কে শূন্য state। এটা যা দেখে তা হলো একটা fresh handshake। client identity বহন করে (auth token, user ID, last-seen-event) — server match করে।

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
			console.log('ws connected');
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

তিনটা production-স্বাদের detail।

**1. Cap সহ backoff।** 500ms, 1s, 2s, 4s, 8s, 16s, 30s, তারপর plateau। কখনো 500ms-এর চেয়ে দ্রুত reconnect করবেন না — একটা permanent failure আপনার নিজের server-এর বিরুদ্ধে একটা denial-of-service হয়ে যায়।

**2. Jitter.** এটা ছাড়া, একটা server outage মানে service ফিরলে প্রতিটা client একই মুহূর্তে reconnect করে, আর আপনি একটা thundering herd পান। ~30% jitter reconnect ছড়িয়ে দেয়।

**3. Intentional close-এ reconnect করবেন না।** Code `1000` (normal) আর `1001` (going away) মানে server আপনাকে চলে যেতে বলেছে। সম্মান করুন।

একটা production-ready client-এর জন্য, `partysocket`, `reconnecting-websocket`, বা `nice-grpc-web`-এর (gRPC-Web ক্ষেত্রের জন্য) মতো library আপনার জন্য এটা সামলায়। উপরের ক্ষেত্রগুলো বুঝলে তবেই নিজেরটা বানান।

## Resumption — যেখানে ছেড়েছিলেন সেখান থেকে তুলে নেওয়া

একটা reconnect যা শুধু একটা fresh stream খোলে সেটা disconnection-এর সময় ঘটা সবকিছু হারায়। chat-এর জন্য, সেটা সাধারণত ঠিক আছে; client REST-এর মাধ্যমে reconnect-এ history request করে। যে notification stream-এ প্রতিটা event গুরুত্বপূর্ণ তার জন্য, আপনার resumption দরকার।

প্যাটার্ন: প্রতিটা server-pushed message-এর একটা sequence ID আছে। client শেষ যেটা দেখেছে সেটা track করে। reconnect-এ, client `last_seq` পাঠায় আর server সেখান থেকে replay করে।

```js
ws.send({ type: 'subscribe', room: 'general', lastSeq: this.lastSeq });
```

Server-side-এর দরকার:

- প্রতি room-এ recent event-এর একটা persistent log (Redis Streams, Postgres, NATS JetStream)।
- একটা subscription handler যা live stream-এ join করার আগে log থেকে "now" পর্যন্ত backfill করে।

SSE-র `Last-Event-ID`-র (চ্যাপ্টার 5) অভিন্ন। একবার বানান, দুটো protocol জুড়ে data store পুনরায় ব্যবহার করুন।

## Page visibility আর tab sleep

একটা browser tab hidden থাকলে, OS timer আর JS execution throttle বা suspend করতে পারে। একটা heartbeat-এর জন্য `setInterval` schedule অনুযায়ী fire নাও করতে পারে। WebSocket নিজে close হয় না — tab paused, gone নয়।

দুটো বাস্তব প্রভাব:

1. **Server ping এখনো পৌঁছায়।** connection জীবিত থাকে; এটা শুধু message queue করে।
2. **Tab focus-এ, client message-এর একটা flood দেখে।** client-side buffer করুন আর একটা sane pace-এ process করুন।

`Page Visibility API` আপনাকে transition সামলাতে দেয়:

```js
document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'visible') {
		// catch up on missed messages, refresh state
	}
});
```

কিছু app-এর জন্য সঠিক পদক্ষেপ হলো server resource মুক্ত করতে **hidden হলে disconnect** করা, visible হলে (resumption সহ) **reconnect** করা। অনেক idle tab সহ অনেক user থাকলে এটা মূল্যবান।

## Mobile — network প্রতিকূল

Mobile network roam করে, cell-এর মধ্যে hand off করে, tunnel-এ signal হারায়। Connection প্রায়ই ড্রপ করে। দুটো প্যাটার্ন সাহায্য করে:

1. **Aggressive heartbeat** (প্রতি 15 সেকেন্ড) drop দ্রুত detect করে। bandwidth খরচের যোগ্য।
2. **Mobile client-এ faster initial reconnect** — 250ms-এ শুরু করুন, jitter 50%। User একটা সংক্ষিপ্ত drop থেকে দ্রুত recovery-তে থাকার সম্ভাবনা বেশি।

pure-mobile app-এর জন্য, `Starscream` (iOS), `OkHttp WebSocket` (Android), বা `flutter_socket_io`-র মতো library ইতিমধ্যে reconnect সামলায়; cadence tune করুন।

## Graceful server shutdown

server যখন restart করছে:

1. **নতুন connection নেওয়া বন্ধ করুন।** `srv.SetKeepAlivesEnabled(false)` plus একটা healthcheck flip।
2. **connected client-দের reconnect করতে বলুন।** `{"type":"reconnect","data":{"after":2000}}` পাঠান তারপর `1001 GoingAway` দিয়ে close করুন।
3. একটা deadline (30s) সহ **in-flight close-এর জন্য অপেক্ষা করুন**।
4. বাকিটা **force-close** করুন।

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

client-side backoff আর jitter-এর সাথে মিলিত, এটা আপনাকে হাজার হাজার client একই মুহূর্তে reconnect না করে deploy করতে দেয়।

## Recap

- Backpressure: bounded buffer, drop-on-full, sustained drop-এর পর disconnect।
- প্রতিটা `conn.Write`-এ write timeout। write hang করলে connection মৃত।
- Ping: library দিয়ে সামলানো protocol-level; latency আর proxy friendliness-এর জন্য application-level।
- Ping interval-এর বেশি একটা read deadline — half-open connection detect করে।
- Server reconnect করে না; client করে, exponential backoff plus jitter সহ, 30s-এ capped।
- close code 1000 আর 1001-এ reconnect করবেন না।
- Resumption: client last sequence track করে, server একটা persistent log থেকে backfill করে।
- Tab visibility: focus-এ catch-up সামলান; high-traffic app-এর জন্য disconnect-when-hidden।
- Mobile: টাইট heartbeat, faster initial reconnect।
- Graceful shutdown: নতুন connection বন্ধ, reconnect hint, drain, deadline-এ force-close।

পরবর্তী: [Production self-host](/notes/websockets/10-production) — nginx, systemd, observability, আর একটা VPS-এ scaling out।

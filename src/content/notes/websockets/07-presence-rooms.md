---
title: 'Presence আর rooms'
subtitle: 'কে online আর তারা কোন channel দেখছে তা জানা একটা one-process demo-তে সহজ দেখায় আর scale-এ সত্যিই কঠিন। data model অর্ধেক কাজ; eviction story বাকি অর্ধেক।'
chapter: 7
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['websockets', 'presence', 'rooms', 'redis', 'sets']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা একটা community centre চালান। সামনের ডেস্কে একটা খাতা রাখা — কেউ ভবনে ঢুকলেই নাম সই করে, বেরোনোর সময় আবার সই করে চলে যায়। তাই খাতা দেখলেই যে কেউ এক নজরে বলে দিতে পারে এই মুহূর্তে ঠিক কারা ভেতরে আছে। কিন্তু ঝামেলা হয় তখনই, যখন কেউ কাউকে কিছু না বলে চুপিসারে পেছনের দরজা দিয়ে বেরিয়ে যায় — খাতায় তার নাম রয়ে যায়, অথচ লোকটা আসলে নেই।

ভবনের ভেতরে আবার আলাদা আলাদা কয়েকটা meeting room — একটা "কবিতার ঘর", একটা "গণিতের ঘর", একটা "বিতর্কের ঘর"। সিনা যখন কবিতার ঘরে দাঁড়িয়ে একটা ঘোষণা দেন, সেটা শুধু সেই ঘরে বসে থাকা লোকজনই শোনে — পাশের গণিতের ঘরে খোয়ারিজমি কিছুই টের পান না। প্রতিটা ঘর নিজের ভেতরের কথা নিজের ভেতরেই রাখে; কেউ আরেক ঘরের ঘোষণা শোনার জন্য উঠে গিয়ে সেই ঘরে ঢোকে।

এই গল্পটাই আসলে **presence** আর **rooms**। সামনের ডেস্কের live sign-in খাতা হলো presence tracking — এখন কারা online তার হিসাব; বেরোনোর সময় সই করা হলো disconnect যা presence থেকে নামটা মুছে দেয় (আর চুপিসারে বেরিয়ে যাওয়াটাই সেই stale "ভূত" যা eviction দিয়ে সামলাতে হয়)। আর প্রতিটা meeting room হলো একটা room বা channel, আর এক ঘরে দেওয়া ঘোষণা শুধু সেই ঘরের লোকই শোনে — এটাই একটা room-এর member-দের কাছে scoped broadcast। বাস্তবে chat app-এ "কে online" dot আর collaborative doc-এ "এই ফাইলটা এখন কারা দেখছে" — সব ঠিক এভাবেই presence আর room দিয়ে কাজ করে।

চ্যাপ্টার 6-এ আমরা multi-process pub/sub wire করেছি। এই চ্যাপ্টার দুটো প্রশ্নের উত্তর দেয় যা প্রতিটা realtime app-কে শেষমেশ মুখোমুখি হতে হয়:

- **Presence:** এখন কে online? কেউ join বা leave করলে room-এর বাকিদের আমরা কীভাবে জানাব?
- **Rooms:** কোন client কোন channel-এ subscribed? client যখন যেকোনোটায় reconnect করতে পারে তখন process জুড়ে সেই map কীভাবে সামঞ্জস্যপূর্ণ রাখব?

দুটোই state-tracking সমস্যা। ফাঁদটা হলো: connection অনেকভাবে মারা যায়, আর একটা stale presence record কোনো record না থাকার চেয়ে খারাপ। eviction ঠিক করুন নাহলে আপনার "কে online" widget ভূত দেখাবে।

<Callout type="info">

**বাস্তব উদাহরণ**

Presence tracking হলো একটা physical room-এর মতো যেখানে আপনি দেখতে পান কে ভেতরে এসেছে আর কে বেরিয়ে গেছে — চ্যালেঞ্জটা হলো কেউ বিদায় না বলে চুপিসারে বেরিয়ে গেলে সেটা জানা।

</Callout>

## Per-process presence — সহজ অংশ

আপনি যদি শুধু একটা process চালান, presence in-memory। চ্যাপ্টার 6-এ ইতিমধ্যে `rooms map[string]map[*Client]struct{}` ছিল। প্রতিটা room-এর জন্য আপনি client iterate করে presence event emit করতে পারেন:

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

client connect করলে, তাদের বর্তমান member list পাঠান। অন্যরা join বা leave করলে, একটা `presence.joined` / `presence.left` event broadcast করুন। এটাই পুরো প্যাটার্ন, আর এটা একটা process-এর ভেতরে নিখুঁতভাবে কাজ করে।

আপনি একাধিক process-এ scale করার (চ্যাপ্টার 6) মুহূর্তে, `listMembers` শুধু local process-এ connected client দেখে। আপনার একটা shared store দরকার।

## Multi-process presence — Redis set

স্বাভাবিক shape হলো প্রতি room-এ একটা Redis **set**: `presence:room:general` বর্তমানে `general`-এ থাকা প্রতিটা user ID ধারণ করে। একটা member যোগ, remove, list, আর count করা O(1) বা O(N) op:

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

প্রতিটা পরিবর্তনের পর, একটা `presence.changed` event publish করুন যাতে অন্য process (আর তাদের client) এটা সম্পর্কে শোনে।

একটা process cleanup না করে crash না করা পর্যন্ত এটা কাজ করে। তারপর set-এ চিরকাল stale member থাকে, আর আপনার "কে online" widget এমন লোক দেখায় যারা নেই।

## ভূত আর কীভাবে তাদের evict করবেন

stale presence-এর তিনটা উৎস:

1. **Process crashed.** এটা কখনো leave handler চালায়নি।
2. **Network died.** Process জীবিত কিন্তু client চলে গেছে; disconnect detection মিনিট নিয়েছে।
3. **একই user, দুটো device।** তাদের দুটো connection আছে; একটা বন্ধ করলে তারা offline হয় না।

Fix: presence entry **expire** হয় যদি না renew করা হয়। প্রতিটা connected client-কে একটা renewable lease ধারণকারী হিসেবে ভাবুন।

প্যাটার্ন: presence-কে **per-member timestamp সহ একটা Redis hash** হিসেবে store করুন, plus expiry দিয়ে indexed একটা আলাদা sorted set, plus একটা periodic sweeper।

সহজতর সংস্করণ যা 90% ক্ষেত্র সামলায়: **একটা TTL সহ per-connection key, heartbeat দিয়ে refreshed**।

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

expiry-as-score সহ sorted set হলো standard প্যাটার্ন। একটা read হয় expired entry ছাঁটে নয়তো উপেক্ষা করে; একটা write তার expiry এগিয়ে দিতে entry-কে re-score করে।

**score** হলো expiry timestamp। একটা periodic sweeper (বা প্রতিটা reader) যে member-দের score অতীতে তাদের ফেলে দেয়। একটা process মারা গেলেও, তার member এক heartbeat interval-এর মধ্যে age out হয়।

<Callout type="warn">

**presence-কে নিখুঁতভাবে accurate করার চেষ্টা করবেন না।** একটা 30-সেকেন্ড window যেখানে একটা crashed process-এর member ঝুলে থাকে সেটা ঠিক আছে। এটাকে instant করার চেষ্টা distributed coordination দাবি করে যা সামান্য বাস্তব সুবিধার জন্য জটিলতা যোগ করে। একটা heartbeat interval (15–60 সেকেন্ড) বাছুন, staleness bounded তা মেনে নিন, document করুন, এগিয়ে যান।

</Callout>

## heartbeat নিজেই

WebSocket জগতে, আপনার ইতিমধ্যে control-frame ping আছে (চ্যাপ্টার 2)। presence-এর জন্য _application-level_ heartbeat ব্যবহার করুন:

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

Refresh এই connection-এর জন্য sorted set entry update করে, expiry 60 সেকেন্ড এগিয়ে ঠেলে দেয়। process মারা গেলে, entry age out হয়; client gracefully disconnect করলে, আপনি সাথে সাথে তাদের `ZREM` করেন।

refresh-টা writer goroutine-এর existing context-এর উপর চড়া উচিত — writer মারা গেলে (যে কারণেই হোক), আপনি refresh বন্ধ করেন, আর Redis evict করে।

## Multi-device user

একজন single user-এর দুটো laptop খোলা। দুটোই connect করে; দুটোই presence-এ যোগ হয়। "user online কিনা"-র জন্য তারা একবার গোনা হয় কিন্তু "তাদের এই message পাঠাও"-র জন্য আপনার দুটো connection-ই দরকার।

model:

- **Connection-level identity:** `connID` (প্রতি connection-এ random UUID)।
- **User-level identity:** `userID` (logged-in user)।

দুটোই track করুন। Presence sorted set member হলো `connID`; আপনি `presence:user:42 → set of connIDs`-ও maintain করেন। User online iff `presence:user:42` non-empty।

একটা user-এর সব connection ড্রপ (বা expire) করলে, তারা offline হয়; একটা `presence.user.left` event emit করুন। প্রথম connection আসলে, `presence.user.joined`।

বেশিরভাগ app-এর দুটো granularity-ই দরকার। "user-এ পাঠাও"-র জন্য conn ID-র একটা list দরকার (সবগুলোতে broadcast); "user online কিনা"-র জন্য user-level rollup দরকার।

## room-এ join আর leave করা

room subscription-এর তিনটা প্যাটার্ন, জটিলতার ক্রমে:

**1. Permanent room.** Slack channel-এর মতো। আপনি হয় member (server-side persisted) নয়তো নন। Join একটা row লেখে; leave এটা remove করে। Reconnect আপনার সব room-এ re-subscribe করে।

**2. Ephemeral room.** একটা live document-এর মতো। Join একটা room তৈরি করে যদি না থাকে; leave সম্ভবত এটা মুছে দেয় (last member হলে)। Server disconnect জুড়ে membership persist করে না।

**3. Reactive room.** একটা "viewers" indicator-এর মতো। Join implicit (user page খোলে); leave implicit (user এটা বন্ধ করে)। Membership নিছক live presence set।

implementation প্যাটার্ন একই — একটা per-room presence set — কিন্তু **persistence story** ভিন্ন। Permanent room-এর একটা `room_members` table দরকার; ephemeral room-এর শুধু Redis দরকার; reactive room-এর শুধু presence sweeper দরকার।

## bus জুড়ে room-এ subscribe করা

একটা process-এর যখন `room:general`-এ client থাকে, এটার Redis channel `room:general`-এ subscribed থাকা উচিত। client নড়াচড়া করার সাথে সাথে (join/leave), subscription বদলায়।

দুটো approach।

**A. সবকিছুতে pattern-subscribe।**

```go
sub := rdb.PSubscribe(ctx, "room:*")
```

process প্রতিটা room-এর event receive করে; এটা local client-এর সাথে match করে filter করে। সহজ। Scale-এ অপচয়ী (প্রতিটা process প্রতিটা room-এর প্রতিটা event পায়)।

**B. প্রথম local client join করার সাথে সাথে per-room subscribe।**

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

room-এ locally শেষ client leave করলে, unsubscribe। প্রতিটা process শুধু সেই room-এ শোনে যেখানে তার client আছে। হাজার হাজার room-এ scale করে।

কয়েকশো room-এর জন্য approach A বাছুন, হাজার বা তার বেশির জন্য B। বেশিরভাগ chat-style app A করে আর কখনো খরচ টের পায় না।

## একটা feature spec হিসেবে presence

একটা বাস্তব presence feature-এর সাধারণত "online/offline"-এর চেয়ে বেশি requirement থাকে:

- **Idle vs active.** User 5 মিনিট idle ছিল; তাদের away দেখান। client আপনাকে বলে (mouse নড়ল? keypress?)। Presence set hash হয়ে যায় status বহন করে।
- **Custom status.** "in a meeting", "🍌 lunch"। প্রতি user-এ একটা field হিসেবে stored।
- **Typing indicator.** একটা bursty, ephemeral presence — typing করলে appear, 5 সেকেন্ড পর disappear। হয় short-TTL Redis key নয়তো একটা pure pub/sub broadcast।
- **Last-seen.** offline থাকলেও, "last seen 2 hours ago"। disconnect-এ Postgres-এ `last_seen_at` persist করুন।

প্রতিটা একটা ছোট extension। সাধারণ প্যাটার্ন: `presence:user:42` হলো একটা hash যা `status`, `device`, `since` ইত্যাদি বহন করে। Heartbeat TTL refresh করে। অন্য client পরিবর্তনের জন্য একটা Redis channel subscribe করে।

## Reconnect আর presence

একটা flaky client প্রতি মিনিটে reconnect করে। Presence ping-pong করে: leave/join/leave/join।

এটা মসৃণ করতে, offline event **debounce** করুন। একটা connection মারা গেলে, সাথে সাথে `presence.user.left` fire করবেন না। কিছু grace period (15–30 সেকেন্ড) অপেক্ষা করুন। User এর মধ্যে reconnect করলে, event suppress করুন।

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

এটা ছাড়া, একটা 1-সেকেন্ড network blip প্রতিটা অন্য client-কে user-কে disappear আর reappear করতে দেখায়। Chat-এর জন্য বিরক্তিকর, collaborative editing-এর জন্য মারাত্মক।

## SSE সহ presence

একই প্যাটার্ন SSE-তে কাজ করে। পার্থক্য:

- server presence event push করে; client SSE-র উপর "আমি একটা room-এ join করেছি" বলতে পারে না — এটা একটা সাধারণ `POST /rooms/:id/join`-এর মাধ্যমে করে।
- Subscription এখনো per-server-connection (প্রতি browser-এ একটা SSE stream)।
- Heartbeat হতে পারে SSE comment line (চ্যাপ্টার 5) — একই liveness check।

যেখানে WebSockets chat-এর জন্য (পাল্টা typing) স্বাভাবিক লাগে, SSE plus REST হলো "আমাকে presence দেখাও + আমি REST-এর মাধ্যমে পরিবর্তন commit করি"-র জন্য সঠিক shape — collaborative document প্রায়ই এভাবে কাজ করে।

## Storage আর limit

Redis-based presence-এর জন্য কয়েকটা sizing note:

- 10,000 member সহ একটা sorted set ছোট (কয়েকশো KB)। Redis সহজে লক্ষ লক্ষ সামলায়।
- 30s interval-এ heartbeat traffic × 10K connected user = 333 op/sec। তুচ্ছ।
- প্রতি 60s-এ চলা আর প্রতিটা room থেকে expired member ফেলা sweeper সব read জুড়ে amortised (যেকোনো reader প্রথমে `ZREMRANGEBYSCORE` চালাতে পারে)।
- খুব বড় fan-out-এর (এক room-এ 100K+ user) জন্য, sampling বা pagination বিবেচনা করুন — একশো member সহ একটা "who's here" event পাঠানো দশ হাজারের চেয়ে বেশি কাজের।

## Recap

- Presence হলো eviction সহ state-tracking। eviction-ই কঠিন অংশ।
- Single process: in-memory map। Multi-process: expiry-as-score সহ Redis sorted set।
- Heartbeat entry refresh করে। একটা process মারা গেলে, member এক heartbeat window-এর মধ্যে age out হয়।
- দুই level-এ track করুন: per-connection (routing-এর জন্য) আর per-user ("online কিনা"-র জন্য)।
- Room তিন ধরনের আসে: permanent, ephemeral, reactive। একই data shape, আলাদা persistence।
- হাজার হাজার room-এর জন্য per-room subscribe (B); কয়েকশোর জন্য pattern-subscribe (A)।
- Flicker এড়াতে একটা grace period দিয়ে disconnect event debounce করুন।
- একটা feature হিসেবে presence: idle/active, custom status, typing indicator, last-seen — সব ছোট extension।
- একই প্যাটার্ন SSE-তে কাজ করে — read channel (SSE) write channel (REST) থেকে আলাদা করুন।

পরবর্তী: [Auth, origin, আর rate limits](/notes/websockets/08-auth-origin) — production-safe handshake যা খোলা internet-এ টিকে থাকে।

---
title: 'handshake আর frame protocol'
subtitle: 'একটা server ship করার জন্য যে অংশগুলো গুরুত্বপূর্ণ সেই অংশে RFC 6455। Upgrade header, frame layout, masking, opcodes, close code, আর library যে নিয়মগুলো মেনে চলে যাতে আপনাকে না চলতে হয়।'
chapter: 2
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['websockets', 'rfc6455', 'frames', 'handshake']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

বাগদাদের বাণিজ্যিক এলাকায় আল-খোয়ারিজমির অফিস আর ইবনে সিনার অফিস — দুই ঘর দিনভর একে অপরকে লম্বা আনুষ্ঠানিক চিঠি পাঠায়। প্রতিটা চিঠির শুরুতে পুরো ঠিকানা, সম্বোধন, ভূমিকা — তারপর আসল কথা। এতে সময় যায়, কাগজ যায়, আর ছোট একটা খবর জানাতেও গোটা একটা খাম লাগে। একদিন কাজের চাপ বাড়ল, আর দুই অফিসের মাঝে দ্রুত আদান-প্রদান দরকার হয়ে পড়ল।

তখন আল-খোয়ারিজমি একটাই আনুষ্ঠানিক অনুরোধ-চিঠি পাঠাল ইবনে সিনাকে: "আসুন, আমরা দুই ঘরের মাঝে খোলা টেলিগ্রাফ তার চালু করি।" ইবনে সিনা সেই একই চিঠিতে সম্মতি সই করে ফেরত পাঠাল — এই এক দফা অনুরোধ-ও-সম্মতিই যথেষ্ট। ঠিক সেই মুহূর্ত থেকে দুই ঘর চিঠি লেখা বন্ধ করে দিল। এখন তারা ওই একই তারের ওপর দিয়ে ছোট ছোট প্রমিত টেলিগ্রাম স্লিপ ছুঁড়ে দেয় — কোনো ঠিকানা নেই, ভূমিকা নেই, শুধু দরকারি লাইনটুকু। খবর যায় সেকেন্ডে।

এই গল্পটাই আসলে **WebSocket**। শুরুর ওই আনুষ্ঠানিক অনুরোধ-ও-সম্মতি চিঠিটাই হলো **HTTP Upgrade handshake** — একটা সাধারণ HTTP request যেখানে `Upgrade` header দিয়ে বলা হয় "চলো protocol বদলাই।" যে মুহূর্তে দুই পক্ষ সম্মত হয় (server-এর `101 Switching Protocols`), সেটাই connection upgrade হওয়ার মুহূর্ত। আর তারপর ওই একই তার — মানে একই connection — এর ওপর দিয়ে বয়ে যাওয়া ছোট প্রমিত টেলিগ্রাম স্লিপগুলোই হলো **WebSocket frame**: হালকা, header-এ কম খরচ, দুই দিকেই ছুটতে পারে। বাস্তবে ব্রাউজার আর chat বা live-dashboard server ঠিক এভাবেই একবার handshake করে, তারপর একই connection-এ frame-এর পর frame বিনিময় করে যায় — নতুন করে HTTP request খোলার ঝামেলা ছাড়াই।

আপনি প্রায় কখনোই হাতে একটা WebSocket parser লিখবেন না — প্রতিটা ভাষায় একটা battle-tested library আছে। কিন্তু আপনি tcpdump পড়বেন, আটকে থাকা connection debug করবেন, আর compression ব্যবহার করবেন কিনা তা ঠিক করবেন। wire-এ কী আছে তা জানলে সেই মুহূর্তগুলো ছোট থাকে।

এই চ্যাপ্টার আপনার যে অংশগুলো দরকার সেই অংশে RFC 6455। যে অংশগুলো দরকার নেই সেগুলো বাদ দিই।

<Callout type="info">

**বাস্তব উদাহরণ**

WebSocket handshake হলো একটা গোপন handshake-এর মতো যা একটা আনুষ্ঠানিক মিটিংকে একটা private channel-এ upgrade করে — একবার আচারটা সম্পন্ন হলে, সাধারণ কথোপকথনের নিয়ম আর খাটে না।

</Callout>

## handshake

একটা client server-এ একটা সাধারণ TCP connection (বা `wss://`-এর জন্য TLS) খোলে, তারপর কয়েকটা special header সহ একটা HTTP/1.1 GET request পাঠায়:

```
GET /ws HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Origin: https://example.com
```

তিনটা জিনিস খেয়াল করুন।

**1. `Upgrade: websocket` আর `Connection: Upgrade`।** দুটোই দরকার। এগুলো HTTP middlebox-দের বলে "এটা protocol switch করতে যাচ্ছে, দয়া করে buffer বা close করবেন না।"

**2. `Sec-WebSocket-Key` হলো একটা 16-byte random base64 value।** server প্রমাণ করে যে সে protocol বুঝেছে, `Sec-WebSocket-Accept = base64(sha1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))` compute করে। magic GUID-টা spec দিয়ে নির্ধারিত।

**3. `Origin` গুরুত্বপূর্ণ।** Browser স্বয়ংক্রিয়ভাবে তাদের origin পাঠায়। server-এর এটা check করা উচিত। origin check ছাড়া, একজন logged-in user যে _যেকোনো_ website visit করে সেটা তাদের cookie ব্যবহার করে আপনার server-এ একটা WebSocket খুলতে পারে। চ্যাপ্টার 8-এ পুরো প্যাটার্ন আছে; আপাতত, জানুন header-টা একটা কারণে আছে।

server accept করলে তার response:

```
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

Status `101 Switching Protocols`। এখান থেকে, connection-এর byte-গুলো HTTP নয় — এগুলো WebSocket frame।

server যদি না বলে (খারাপ origin, missing auth, busy), সে একটা সাধারণ HTTP error return করে আর connection বন্ধ হয়। কোনো অদ্ভুত কিছু নয়।

## Subprotocol

handshake একটা **subprotocol** negotiate করতে পারে — দুই পক্ষ যে application-layer protocol ব্যবহার করবে তার একটা নাম। যখন একটা server কয়েকটা বলে তখন কাজে লাগে:

```
Sec-WebSocket-Protocol: chat.v2, chat.v1
```

server একটা বাছে আর সেটা ফেরত echo করে:

```
Sec-WebSocket-Protocol: chat.v2
```

এখন দুই পক্ষ একমত যে তারা `chat.v2` বলছে। framework এটা পড়ে — আপনার handshake handler এর উপর branch করতে পারে। বেশিরভাগ app subprotocol উপেক্ষা করে আর message envelope-এর ভেতরে version করে। চ্যাপ্টার 4 দুটো পছন্দই cover করে।

## Extension — `permessage-deflate`

একটা extension আপনি বাস্তবে দেখবেন: **per-message deflate** compression। handshake-এর সময় দুই পক্ষই support advertise করে:

```
Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits
```

server রাজি হলে, দুই পক্ষই deflate দিয়ে message payload compress করে। Text-heavy traffic-এর (JSON) জন্য, এটা bandwidth অর্ধেক করে। আগে থেকেই compressed binary-র (image, video) জন্য, এটা একটা CPU tax।

Library default ভিন্ন হয়। `coder/websocket` এটা enable করে; `gorilla/websocket`-এ opt-in করতে হয়। আপনার traffic যদি ছোট JSON message হয়, এটা on রাখুন; বড় binary হলে, off করুন।

## Frame layout

handshake-এর পর, wire হলো frame-এর একটা sequence। একটা frame সর্বনিম্ন 2 byte; header-এর জন্য 14 byte পর্যন্ত plus payload।

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-------+-+-------------+-------------------------------+
|F|R|R|R| opcode|M| Payload len |    Extended payload length    |
|I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
|N|V|V|V|       |S|             |   (if payload len==126/127)   |
| |1|2|3|       |K|             |                               |
+-+-+-+-+-------+-+-------------+-------------------------------+
|     Extended payload length continued, if payload len == 127  |
+-------------------------------+-------------------------------+
|                               |Masking-key, if MASK set to 1  |
+-------------------------------+-------------------------------+
|     Masking-key (continued)   |          Payload Data         |
+-------------------------------+-------------------------------+
:                     Payload Data continued ...                :
+---------------------------------------------------------------+
```

যে অংশগুলো গুরুত্বপূর্ণ সেগুলো পড়ুন:

- **FIN (1 bit)** — শেষ fragment? `1` মানে এটাই পুরো message (বা একটা fragmented message-এর শেষ টুকরো)।
- **RSV1/2/3** — reserved; `permessage-deflate` compressed payload flag করতে RSV1 ব্যবহার করে।
- **opcode (4 bits)** — এটা কী ধরনের frame।
- **MASK (1 bit)** — এই frame-এ কি একটা masking key আছে? Client-to-server frame অবশ্যই masked হতে হবে; server-to-client frame অবশ্যই নয়। Spec-এর নিয়ম, optional নয়।
- **Payload len (7 bits)** — 0–125 inline, 126 মানে "পরের 16 bit-ই আসল length", 127 মানে "পরের 64 bit-ই আসল length"।
- **Masking-key (4 bytes)** — শুধু MASK 1 হলে present।
- **Payload Data** — আসল byte। masked হলে, key দিয়ে XOR করা (4-byte cycle)।

একটা client থেকে 5-byte text payload wire-এ 11 byte-এর মতো দেখায় (header + key + masked payload)। একটা server থেকে 5-byte text payload 7 byte-এর মতো দেখায় (header + payload)। protocol খুব ছোট message-এর জন্য একটা ছোট per-message tax দেয় — chat-জাতীয় traffic-এর জন্য অপ্রাসঙ্গিক, high-frequency tiny update-এর জন্য কষ্টকর (সেক্ষেত্রে এমন একটা binary message format ব্যবহার করুন যা batch করে)।

## Opcode

```
0x0  continuation     (more data for an in-progress fragmented message)
0x1  text             (UTF-8 string)
0x2  binary           (raw bytes)
0x3-0x7  reserved
0x8  close            (closing the connection)
0x9  ping             (heartbeat)
0xA  pong             (heartbeat reply)
0xB-0xF  reserved
```

তিনটা ক্যাটাগরি।

**Data frame** (`text`, `binary`, `continuation`) আপনার payload বহন করে। opcode `text` (`0x1`) আর `binary` (`0x2`) একটা message শুরু করে; `continuation` (`0x0`) একটা fragmented message চালিয়ে নেয়। FIN=1 শেষ frame mark করে।

**Control frame** (`close`, `ping`, `pong`) হলো connection management-এর জন্য ব্যবহৃত ছোট message। সর্বোচ্চ payload: 125 byte। Fragment করা যায় না। Data frame-এর উপর precedence পায়।

**Reserved** opcode ভবিষ্যৎ ব্যবহারের জন্য আর wire-এ থাকা উচিত নয়।

## Masking — আর এটা কেন আছে

প্রতিটা client-to-server frame একটা random 4-byte key দিয়ে XOR-masked হয়। server পড়ার আগে unmask করে। এত ঝামেলা কেন?

কারণটা ঐতিহাসিক আর security-flavored। masking ছাড়া, একই network-এ থাকা একজন attacker একটা browser-কে এমন data পাঠাতে ফাঁকি দিতে পারত যা, একটা HTTP proxy পড়লে, একটা জাল HTTP request-এর মতো দেখাত — proxy-কে "cache poisoning" আক্রমণে বিভ্রান্ত করত। masking byte-গুলোকে একটা non-WebSocket-aware proxy-র কাছে random দেখায়, ওই ধরনের আক্রমণ আটকায়।

একটা পরিণতি: প্রতিটা WebSocket library স্বয়ংক্রিয়ভাবে client-side mask আর server-side unmask করে। আপনি কখনো masking code লেখেন না। tcpdump-এর দিকে তাকালে একবার দেখবেন।

## Fragmentation

একটা message একাধিক frame জুড়ে ভাগ করা যায়:

```
[FIN=0, opcode=text]    "Hello, "
[FIN=0, opcode=cont]    "Web"
[FIN=1, opcode=cont]    "Sockets!"
```

receiver তিনটাই buffer করে আর একটা logical message উপস্থাপন করে: `"Hello, WebSockets!"`। বড় payload পাঠানোর সময় কাজে লাগে যেখানে sender আগে থেকে পুরো length জানে না।

বাস্তবে, library fragmentation লুকায়। বেশিরভাগ app single frame-এ পুরো message পাঠায় আর receive করে। fragmentation যে আছে তা আপনার জানা দরকার যখন:

- একটা client fragment-এর _মাঝে_ একটা control frame মেশায় — সেটা ঠিক আছে, control frame interleave করতে পারে।
- আপনি একটা debug log-এ partial UTF-8 দেখেন — library হয়তো একটা fragment দেখিয়েছে।

## Close frame

Close করা একটা ছোট handshake। দুই পক্ষের যেকোনোটা একটা close frame পাঠায়; অন্যটা একটা দিয়ে reply করে; দুই পক্ষ TCP connection বন্ধ করে।

```
Sender:    [opcode=close] [code=1000][reason=normal]
Receiver:  [opcode=close] [code=1000][reason=normal]
Both close TCP.
```

close frame-এর payload হলো একটা 2-byte status code plus optional UTF-8 reason। সাধারণ code:

| Code      | অর্থ                                                            |
| --------- | --------------------------------------------------------------- |
| 1000      | Normal closure                                                  |
| 1001      | Going away (server shutdown, client navigation)                 |
| 1002      | Protocol error                                                  |
| 1003      | data type accept করা যায় না (যেমন binary supported নয়)        |
| 1006      | Abnormal closure (কোনো close frame দেখা যায়নি — TCP মারা গেছে) |
| 1008      | Policy violation (auth ব্যর্থ, খারাপ input)                     |
| 1009      | Message too big                                                 |
| 1011      | Internal server error                                           |
| 4000–4999 | Application-defined                                             |

`1006` হলো সেটা যা production-এ সবচেয়ে বেশি দেখেন: connection একটা close handshake ছাড়াই ড্রপ করেছে, library সেটা report করে। Network glitch, NAT timeout, force-quit client — সব 1006 হয়ে যায়।

application-level "user ব্যান হয়েছে" বা "auth expire হয়েছে"-এর জন্য, 4xxx code ব্যবহার করুন। এগুলো app ব্যবহারের জন্য reserved; একটা scheme বেছে নিন আর document করুন।

## Ping আর pong

Heartbeat। দুই পক্ষের যেকোনোটা যেকোনো সময় একটা `ping` frame পাঠায়; অন্যটাকে অবশ্যই একই payload বহন করা `pong` দিয়ে reply করতে হবে। ব্যবহার করা হয়:

- middlebox-দের idle connection ড্রপ করা থেকে বিরত রাখতে।
- TCP keepalive-এর চেয়ে আগে dead peer detect করতে।

বেশিরভাগ server প্রতি 30 সেকেন্ডে একটা ping পাঠায় আর 10 সেকেন্ডের মধ্যে কোনো pong না এলে disconnect করে। Library configurable। default `coder/websocket` setting ভালো।

একটা সাধারণ production bug: nginx (বা অন্য কোনো proxy) 60 সেকেন্ড idle traffic-এর পর connection ড্রপ করে। Ping সেটা আটকায়। চ্যাপ্টার 10 nginx config cover করে; চ্যাপ্টার 9 heartbeat প্যাটার্ন বিস্তারিত cover করে।

<Callout type="warn">

**একটা ping frame একটা control frame, আপনার application heartbeat নয়।** অনেক WebSocket app protocol-level frame ব্যবহার না করে message layer-এ নিজেদের heartbeat বানায় ("ping" / "pong" JSON envelope)। দুটোই কাজ করে। Protocol-level ping আরও efficient আর application code দরকার নেই; library default সাধারণত এগুলো সামলায়। App-level ping debug করা সহজ আর আপনাকে custom payload (timestamp, sequence number) বহন করতে দেয়।

</Callout>

## TLS — `wss://`

Browser-এর জন্য, যেকোনো non-toy environment-এ TLS বাধ্যতামূলক। `wss://` ঠিক `ws://`-ই, সামনে TLS সহ, port 443-এ।

handshake:

1. port 443-এ TCP connect।
2. TLS handshake (**TLS & Certificates** ট্র্যাকের চ্যাপ্টার থেকে)।
3. TLS tunnel-এর ভেতরে HTTP Upgrade request পাঠান।
4. server একই tunnel-এর ভেতরে 101 দিয়ে respond করে।
5. frame encrypted হয়ে বইতে থাকে।

ALPN `http/1.1` negotiate করে (WebSockets HTTP/2-তে ঠিক একইভাবে চলে না; কিছু library HTTP/2 WebSocket-এর জন্য `RFC 8441` support করে কিন্তু adoption আংশিক)। ভবিষ্যতের জন্য, WebSockets মানে HTTP/1.1।

## যা আপনি নিজে implement করবেন না

একটা full WebSocket server-কে করতে হয়:

- handshake parse করা, `Sec-WebSocket-Key` validate করা, `Sec-WebSocket-Accept` compute করা।
- frame পড়া, masking সামলানো, fragment reassemble করা।
- control-frame size limit enforce করা।
- ping পাঠানো, ping-এর জবাবে pong দেওয়া।
- unsolicited close সহ close handshake সামলানো।
- ঐচ্ছিকভাবে `permessage-deflate` দিয়ে compress করা।

library এই সব করে। আপনার কাজ হলো উপরে **application protocol** implement করা — JSON shape, auth, room, rate limit। পরের চ্যাপ্টার সেখানে শুরু হয়।

## Recap

- Handshake = `Upgrade: websocket` সহ HTTP/1.1 GET, server 101 দিয়ে respond করে।
- `Sec-WebSocket-Key`/`Accept` প্রমাণ করে দুই পক্ষ protocol বোঝে।
- `Origin` আর `Sec-WebSocket-Protocol` এমন tool যা আপনার ব্যবহার করা উচিত।
- Frame-এ FIN, opcode, mask flag, length, optional masking key, payload থাকে।
- Opcode: text, binary, continuation; close, ping, pong।
- Client→server frame অবশ্যই masked; server→client অবশ্যই নয়।
- Fragmentation বড় message-কে frame জুড়ে ছড়াতে দেয়; library এটা লুকায়।
- Close frame একটা status code বহন করে; 1006 হলো "TCP মারা গেছে।" 4xxx app-defined।
- Ping middlebox-দের খুশি রাখে। Library default অনুযায়ী সামলায়।
- `wss://`-এর মাধ্যমে TLS, port 443-এ। বাস্তবে শুধু HTTP/1.1।

পরবর্তী: [আপনার প্রথম server](/notes/websockets/03-first-server) — Go, end-to-end, ৮০ লাইনে। Browser client সহ।

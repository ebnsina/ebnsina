---
title: 'The handshake and frame protocol'
subtitle: 'RFC 6455 in the parts that matter for shipping a server. Upgrade headers, frame layout, masking, opcodes, close codes, and the rules a library follows so you do not have to.'
chapter: 2
level: 'beginner'
readingTime: '12 min'
topics: ['websockets', 'rfc6455', 'frames', 'handshake']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

You will almost never write a WebSocket parser by hand — every language has a battle-tested library. But you will read tcpdump, debug stuck connections, and decide whether to use compression. Knowing what is on the wire keeps those moments short.

This chapter is RFC 6455 in the parts you need. We skip the parts you do not.

<Callout type="info">

**Real-World Analogy**

The WebSocket handshake is like a secret handshake that upgrades a formal meeting into a private channel — once the ritual is complete, the rules of ordinary conversation no longer apply.

</Callout>

## The handshake

A client opens a normal TCP connection (or TLS, for `wss://`) to the server, then sends an HTTP/1.1 GET request with a few special headers:

```
GET /ws HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Origin: https://example.com
```

Three things to notice.

**1. `Upgrade: websocket` and `Connection: Upgrade`.** Both are required. They tell HTTP middleboxes "this is going to switch protocols, please do not buffer or close it."

**2. `Sec-WebSocket-Key` is a 16-byte random base64 value.** The server proves it understood the protocol by computing `Sec-WebSocket-Accept = base64(sha1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))`. The magic GUID is fixed by the spec.

**3. `Origin` matters.** Browsers send their origin automatically. Servers should check it. Without an origin check, _any_ website a logged-in user visits can open a WebSocket to your server using their cookies. Chapter 8 has the full pattern; for now, know the header is there for a reason.

The server response if it accepts:

```
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

Status `101 Switching Protocols`. From here on, the bytes on the connection are not HTTP — they are WebSocket frames.

If the server says no (bad origin, missing auth, busy), it returns a normal HTTP error and the connection closes. Nothing exotic.

## Subprotocols

The handshake can negotiate a **subprotocol** — a name for the application-layer protocol the two sides will use. Useful when one server speaks several:

```
Sec-WebSocket-Protocol: chat.v2, chat.v1
```

Server picks one and echoes it back:

```
Sec-WebSocket-Protocol: chat.v2
```

Now both sides agree they are speaking `chat.v2`. The framework reads this — your handshake handler can branch on it. Most apps ignore subprotocols and version inside the message envelope instead. Chapter 4 covers both choices.

## Extensions — `permessage-deflate`

There is one extension you will see in practice: **per-message deflate** compression. Both sides advertise support during the handshake:

```
Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits
```

If the server agrees, both sides compress message payloads with deflate. For text-heavy traffic (JSON), this halves bandwidth. For already-compressed binary (images, video), it is a CPU tax.

Library defaults vary. `coder/websocket` enables it; `gorilla/websocket` requires opting in. If your traffic is small JSON messages, leave it on; if it is large binary, turn it off.

## Frame layout

After the handshake, the wire is a sequence of frames. A frame is at minimum 2 bytes; up to 14 bytes of header plus the payload.

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

Read the parts that matter:

- **FIN (1 bit)** — last fragment? `1` means this is the whole message (or the last piece of a fragmented one).
- **RSV1/2/3** — reserved; `permessage-deflate` uses RSV1 to flag compressed payloads.
- **opcode (4 bits)** — what kind of frame this is.
- **MASK (1 bit)** — does this frame have a masking key? Client-to-server frames must be masked; server-to-client frames must not. Spec rule, not optional.
- **Payload len (7 bits)** — 0–125 inline, 126 means "next 16 bits are the real length", 127 means "next 64 bits are the real length".
- **Masking-key (4 bytes)** — only present if MASK is 1.
- **Payload Data** — the actual bytes. If masked, XORed with the key (4-byte cycle).

A 5-byte text payload from a client looks like 11 bytes on the wire (header + key + masked payload). A 5-byte text payload from a server looks like 7 bytes (header + payload). The protocol pays a small per-message tax for very small messages — irrelevant for chat-like traffic, painful for high-frequency tiny updates (use a binary message format that batches in that case).

## Opcodes

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

Three categories.

**Data frames** (`text`, `binary`, `continuation`) carry your payload. Opcodes `text` (`0x1`) and `binary` (`0x2`) start a message; `continuation` (`0x0`) continues a fragmented one. FIN=1 marks the last frame.

**Control frames** (`close`, `ping`, `pong`) are short messages used for connection management. Max payload: 125 bytes. Cannot be fragmented. Take precedence over data frames.

**Reserved** opcodes are for future use and must not appear on the wire.

## Masking — and why it exists

Every client-to-server frame is XOR-masked with a random 4-byte key. The server unmasks before reading. Why bother?

The reason is historical and security-flavored. Without masking, an attacker on the same network could trick a browser into sending data that, when read by an HTTP proxy, looked like a forged HTTP request — confused the proxy into "cache poisoning" attacks. Masking makes the bytes look random to a non-WebSocket-aware proxy, blocking that class of attack.

A consequence: every WebSocket library masks client-side automatically and unmasks server-side automatically. You never write masking code. You will see it once if you ever stare at tcpdump.

## Fragmentation

A message can be split across multiple frames:

```
[FIN=0, opcode=text]    "Hello, "
[FIN=0, opcode=cont]    "Web"
[FIN=1, opcode=cont]    "Sockets!"
```

The receiver buffers all three and presents one logical message: `"Hello, WebSockets!"`. Useful when sending big payloads where the sender doesn't know the full length up front.

In practice, libraries hide fragmentation. Most apps send and receive whole messages in single frames. You need to know fragmentation exists when:

- A client mixes a control frame _between_ fragments — that is fine, control frames can interleave.
- You see partial UTF-8 in a debug log — the library may have shown one fragment.

## Close frames

Closing is a short handshake. Either side sends a close frame; the other replies with one; both sides close the TCP connection.

```
Sender:    [opcode=close] [code=1000][reason=normal]
Receiver:  [opcode=close] [code=1000][reason=normal]
Both close TCP.
```

The close frame's payload is a 2-byte status code plus optional UTF-8 reason. Common codes:

| Code      | Meaning                                                 |
| --------- | ------------------------------------------------------- |
| 1000      | Normal closure                                          |
| 1001      | Going away (server shutdown, client navigation)         |
| 1002      | Protocol error                                          |
| 1003      | Cannot accept the data type (e.g. binary not supported) |
| 1006      | Abnormal closure (no close frame seen — TCP died)       |
| 1008      | Policy violation (auth failed, bad input)               |
| 1009      | Message too big                                         |
| 1011      | Internal server error                                   |
| 4000–4999 | Application-defined                                     |

`1006` is the one you see most often in production: the connection dropped without a close handshake, library reports it. Network glitch, NAT timeout, force-quit client — all become 1006.

For application-level "the user got banned" or "auth expired", use 4xxx codes. They are reserved for app use; pick a scheme and document it.

## Ping and pong

Heartbeats. Either side sends a `ping` frame at any time; the other must reply with `pong` carrying the same payload. Used to:

- Keep middleboxes from dropping idle connections.
- Detect dead peers earlier than TCP keepalive.

Most servers send a ping every 30 seconds and disconnect if no pong arrives within 10 seconds. Library configurable. The default `coder/websocket` setting is good.

A common production bug: nginx (or some other proxy) drops the connection after 60 seconds of idle traffic. Pings prevent that. Chapter 10 covers nginx config; chapter 9 covers the heartbeat patterns in detail.

<Callout type="warn">

**A ping frame is a control frame, not your application heartbeat.** Many WebSocket apps build their own heartbeat at the message layer ("ping" / "pong" JSON envelopes) without using the protocol-level frames. Both work. Protocol-level pings are more efficient and don't need application code; library defaults usually handle them. App-level pings are easier to debug and let you carry custom payloads (timestamps, sequence numbers).

</Callout>

## TLS — `wss://`

For browsers, TLS is mandatory in any non-toy environment. `wss://` is exactly `ws://` with TLS in front, on port 443.

The handshake:

1. TCP connect to port 443.
2. TLS handshake (chapter from the **TLS & Certificates** track).
3. Send the HTTP Upgrade request inside the TLS tunnel.
4. Server responds 101 inside the same tunnel.
5. Frames flow encrypted.

ALPN negotiates `http/1.1` (WebSockets do not run on HTTP/2 the same way; some libraries support `RFC 8441` for HTTP/2 WebSockets but adoption is partial). For the foreseeable future, WebSockets means HTTP/1.1.

## What you will not implement yourself

A full WebSocket server has to:

- Parse the handshake, validate `Sec-WebSocket-Key`, compute `Sec-WebSocket-Accept`.
- Read frames, handle masking, reassemble fragments.
- Enforce control-frame size limits.
- Send pings, reply to pings with pongs.
- Handle close handshake, including unsolicited closes.
- Optionally compress with `permessage-deflate`.

The library does all of this. Your job is to implement the **application protocol** on top — the JSON shapes, the auth, the rooms, the rate limits. The next chapter starts there.

## Recap

- Handshake = HTTP/1.1 GET with `Upgrade: websocket`, server responds 101.
- `Sec-WebSocket-Key`/`Accept` proves both sides understand the protocol.
- `Origin` and `Sec-WebSocket-Protocol` are tools you should use.
- Frames have FIN, opcode, mask flag, length, optional masking key, payload.
- Opcodes: text, binary, continuation; close, ping, pong.
- Client→server frames must be masked; server→client must not be.
- Fragmentation lets large messages span frames; libraries hide it.
- Close frames carry a status code; 1006 is "TCP died." 4xxx is app-defined.
- Pings keep middleboxes happy. Library handles them by default.
- TLS via `wss://` on port 443. HTTP/1.1 only in practice.

Next: [Your first server](/notes/websockets/03-first-server) — Go, end-to-end, in 80 lines. Browser client included.

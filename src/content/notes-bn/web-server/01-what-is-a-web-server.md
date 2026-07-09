---
title: 'What is a Web Server'
subtitle: 'socket থেকে response পর্যন্ত একটি HTTP request-এর গঠন। প্রতিটি web server যে চারটি স্টেজ দিয়ে যায়, আর অংশগুলোর নাম।'
chapter: 1
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['http', 'web server', 'tcp', 'request lifecycle']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## একটি web server হলো একটি TCP listener যা HTTP বলে

framework, documentation, marketing — এসব সরিয়ে ফেলুন। একটি web server হলো:

1. একটি process যা একটি TCP port দখল করে থাকে (সাধারণত 80 বা 443)।
2. যখন একটা connection আসে, এটি socket থেকে bytes পড়ে।
3. সেই bytes-কে এটি HTTP হিসেবে ব্যাখ্যা করে — request line, headers, body।
4. এটি একটি HTTP response তৈরি করে (status line, headers, body) এবং সেটা ফেরত লিখে দেয়।
5. এটি connection বন্ধ করে দেয়, অথবা আরেকটি request-এর জন্য খোলা রাখে।

এটুকুই। nginx এটাই। Apache এটাই। আপনার Express app এটাই। এই অধ্যায়ের শেষের 200-লাইনের Go প্রোগ্রামও এটাই। একবার এই loop-টা মনের ভেতরে গেঁথে গেলে, আপনি জীবনে যত web server দেখবেন সবই এই একই পাঁচ ধাপের ভিন্ন ভিন্ন পালিশ মাত্র।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটি web server অনেকটা লাইব্রেরিয়ানের মতো, যে আপনার বইয়ের অনুরোধ নেয়, তাকে থেকে সেটা খুঁজে বের করে, আর আপনার হাতে তুলে দেয় — protocol হলো আপনি কীভাবে চান তা জানানোর পদ্ধতি, আর server হলো সেই লোক যে জিনিসটা এনে দেয়।

</Callout>

## একটি request-এর চারটি স্টেজ

প্রতিটি HTTP request, ভাষা বা framework যা-ই হোক না কেন, চারটি স্টেজ দিয়ে যায়:

```text
            [ ACCEPT ] → [ PARSE ] → [ ROUTE/HANDLE ] → [ RESPOND ]
```

**1. ACCEPT.** kernel server-কে একটি নতুন socket দেয় — একটি TCP connection যা মাত্রই একটি client-এর সাথে তার three-way handshake সম্পন্ন করেছে। server-এর কাজ: সেটাকে listen queue থেকে তুলে নিয়ে পড়া শুরু করা।

**2. PARSE.** server socket থেকে bytes পড়ে এবং তা ব্যাখ্যা করে। এটি HTTP আশা করে — একটি method line (`GET /index.html HTTP/1.1`), হেডারের একটি ব্লক (`Host: example.com`, `Accept: text/html`, ...), একটি খালি লাইন, এবং ঐচ্ছিকভাবে একটি body। যদি কিছু malformed হয়, তাহলে একটা `400 Bad Request` ফেরত পাঠিয়ে এগিয়ে যান।

**3. ROUTE/HANDLE.** server method আর path দেখে সিদ্ধান্ত নেয় কী করবে: একটি static file serve করবে, application code চালাবে, অন্য একটি server-এ proxy করবে, redirect করবে, নাকি cached content ফেরত দেবে। এখানেই "আপনার কোড" রান হয়।

**4. RESPOND.** server response ফেরত লিখে দেয় — একটি status line (`HTTP/1.1 200 OK`), headers (`Content-Type: text/html`, `Content-Length: 1234`), একটি খালি লাইন, এবং body। হয় connection বন্ধ করে দেয় (`Connection: close`), নয়তো একই socket-এ পরের request-এর জন্য খোলা রাখে।

তারপর এটি আবার ACCEPT-এ ফিরে যায়।

## তারে (wire-এ) HTTP আসলে দেখতে কেমন

দুটো terminal খুলুন। প্রথমটায় port 8080-এ listen করুন:

```bash
nc -l -p 8080
```

দ্বিতীয়টায় এর সাথে connect করুন:

```bash
curl http://localhost:8080/test
```

প্রথম terminal-এ আপনি দেখবেন:

```text
GET /test HTTP/1.1
Host: localhost:8080
User-Agent: curl/8.4.0
Accept: */*

```

এটাই পুরো request। plain text, `\r\n` দিয়ে লাইন-টার্মিনেটেড। তিনটি অংশ:

- **Request line** — `GET /test HTTP/1.1`। Method, path, version।
- **Headers** — `Host`, `User-Agent`, `Accept`। প্রতিটি `Name: Value`, মাঝে `\r\n`।
- **Empty line** — একা `\r\n`, headers শেষ হওয়ার সংকেত। সবসময় থাকে।
- **Body** — খালি লাইনের পরে আসত, `POST` আর `PUT`-এর জন্য। এখানে নেই।

এবার listener-এ একটা response টাইপ করে Ctrl+D চাপুন:

```text
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 13

hello, world
```

`curl` `hello, world` প্রিন্ট করে বেরিয়ে যায়। অভিনন্দন — আপনি এইমাত্র হাতে-কলমে, `nc` দিয়ে, নিজেই একটা web server _হয়ে গেলেন_।

<Callout type="info">

**`\r\n`, `\n` নয়।**

HTTP/1.x-এর line ending সবসময় carriage-return + line-feed (`\r\n`)। বেশিরভাগ আধুনিক parser শুধু `\n` সহ্য করে নেয়, কিন্তু spec-এ স্পষ্ট করে বলা আছে। যখন server লিখবেন, `\r\n` emit করুন। যখন `nc` দিয়ে debug করবেন, আপনার terminal সেটা সামলে নেয়।

</Callout>

## request line — methods আর paths

```text
GET /index.html HTTP/1.1
```

তিনটি ফিল্ড, single space দিয়ে আলাদা:

**Method** — কী করতে হবে।

| Method    | Idempotent? | Body আছে? | সাধারণ ব্যবহার                                             |
| --------- | ----------- | --------- | ---------------------------------------------------------- |
| `GET`     | হ্যাঁ       | না        | একটি resource পড়া।                                        |
| `POST`    | না          | হ্যাঁ     | কিছু তৈরি করা।                                             |
| `PUT`     | হ্যাঁ       | হ্যাঁ     | একটি resource প্রতিস্থাপন করা।                             |
| `PATCH`   | না          | হ্যাঁ     | একটি resource পরিবর্তন করা।                                |
| `DELETE`  | হ্যাঁ       | না        | একটি resource সরিয়ে ফেলা।                                 |
| `HEAD`    | হ্যাঁ       | না        | `GET`-এর মতো কিন্তু response-এ body নেই — metadata-র জন্য। |
| `OPTIONS` | হ্যাঁ       | না        | কোন কোন method সাপোর্ট করে? CORS preflight।                |

Idempotent মানে "দুবার করলেও যা হয়, একবার করলেও তাই।" retry-র জন্য গুরুত্বপূর্ণ — `GET` আর `PUT` নিরাপদে retry করা যায়; `POST` হয়তো যায় না।

**Path** — `/index.html`, `/api/users/42`, `/?q=hello`। সবসময় `/` দিয়ে শুরু হয়। `?`-এর পরে একটি query string থাকতে পারে। non-ASCII-এর জন্য URL-encoded।

**Version** — `HTTP/1.0`, `HTTP/1.1`, `HTTP/2`, `HTTP/3`। কার্যত আপনি যত server লিখবেন প্রায় সবই HTTP/1.1 বলে; HTTP/2 আর HTTP/3 সাধারণত একটি reverse proxy সামলায়, যা আপনার application-এর জন্য সেটাকে আবার 1.1-এ নামিয়ে দেয়।

## Headers

```text
Host: example.com
User-Agent: curl/8.4.0
Accept: text/html
Content-Type: application/json
Content-Length: 42
Cookie: session=abc123
```

Headers হলো `Name: Value` জোড়া। Name case-insensitive (`Host` আর `host` একই header)। ক্রম সাধারণত গুরুত্বপূর্ণ নয়, শুধু `Set-Cookie` (server) আর `Cookie` (client) ছাড়া, যেখানে একাধিক value থাকে।

মুখস্থ রাখার মতো ছয়টি header:

- **Host** — এই server-এর _কোন_ virtual host। HTTP/1.1-এ আবশ্যক। একই IP `Host` header-এর মাধ্যমে অনেক domain serve করতে পারে।
- **Content-Type** — body-র MIME type (`text/html`, `application/json`, `image/png`, ...)।
- **Content-Length** — body-র দৈর্ঘ্য bytes-এ। non-chunked body-র জন্য আবশ্যক।
- **Transfer-Encoding: chunked** — Content-Length-এর বিকল্প, streaming-এর জন্য।
- **Connection** — `keep-alive` (পরের request-এর জন্য এই socket পুনরায় ব্যবহার) অথবা `close`।
- **Authorization** — credentials। `Bearer <token>` অথবা `Basic <base64>`।

## Status codes — তিন অঙ্কে response

একটি response সবসময় একটি status line দিয়ে শুরু হয়:

```text
HTTP/1.1 200 OK
HTTP/1.1 404 Not Found
HTTP/1.1 503 Service Unavailable
```

প্রথম অঙ্ক অনুযায়ী পাঁচটি ভাগ:

| Range   | মানে          | সাধারণ codes                                                                                     |
| ------- | ------------- | ------------------------------------------------------------------------------------------------ |
| **1xx** | Informational | `100 Continue`                                                                                   |
| **2xx** | Success       | `200 OK`, `201 Created`, `204 No Content`                                                        |
| **3xx** | Redirect      | `301 Moved Permanently`, `302 Found`, `304 Not Modified`                                         |
| **4xx** | Client error  | `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `429 Too Many Requests` |
| **5xx** | Server error  | `500 Internal Server Error`, `502 Bad Gateway`, `503 Service Unavailable`, `504 Gateway Timeout` |

`4xx` মানে _client কিছু ভুল করেছে_। `5xx` মানে _server কিছু ভুল করেছে_। কোন পক্ষ ভাঙল সেটা জানা যেকোনো debugging session-এর প্রথম প্রশ্ন।

## Connection lifecycle — keep-alive

HTTP/1.0-তে প্রতিটি request একটি নতুন TCP connection খুলত: connect, request, response, close। ধীর।

HTTP/1.1 নিয়ে এলো **persistent connections**: ডিফল্টভাবে server response-এর পরও socket খোলা রাখে, আরেকটি request-এর জন্য প্রস্তুত। client "আমি শেষ" সংকেত দেয় `Connection: close` দিয়ে অথবা request পাঠানো বন্ধ করে। বিশাল speedup — TCP handshake আর TLS handshake মিলিয়ে প্রতি RTT-তে শত শত millisecond খরচ হয়।

```text
[client → server]    GET /a HTTP/1.1
                     Host: x.com
[server → client]    HTTP/1.1 200 OK ...
[client → server]    GET /b HTTP/1.1     ← একই socket, নতুন handshake নেই
                     Host: x.com
[server → client]    HTTP/1.1 200 OK ...
```

server একটি idle keep-alive socket কতক্ষণ ধরে রাখবে তার একটা সীমা রাখে (`keepalive_timeout`, nginx-এ সাধারণত 60–75 সেকেন্ড) যাতে file descriptor ফুরিয়ে না যায়।

## Pipelining আর HTTP/2

keep-alive থাকা সত্ত্বেও, HTTP/1.1 প্রতিটি connection-এ _serial_ — request B পাঠানোর আগে আপনাকে response A পড়া শেষ করতে হবে। **Pipelining** A-এর response আসার আগেই B পাঠানোর সুযোগ দিত, কিন্তু এটি ভালোভাবে সাপোর্টেড ছিল না আর head-of-line blocking একে ভঙ্গুর করে তুলত। বেশিরভাগ client কখনো এটা ব্যবহার করেনি।

HTTP/2 এটা ঠিক করল **multiplexing** দিয়ে — একটি TCP connection-এর ওপর একাধিক logical stream, frame ধরে ধরে interleave করা। আপনার application-এর সামনে nginx (বা এমন একটি proxy) বসানোর অন্যতম প্রধান কারণ এটাই: আপনি বিনামূল্যে HTTP/2 termination পান, আর আপনার backend সাধারণ HTTP/1.1 বলে।

HTTP/3 এটাকে আরও এগিয়ে নেয় TCP-র বদলে QUIC (UDP-ভিত্তিক) ব্যবহার করে, যাতে _transport_ layer-এ head-of-line blocking দূর হয়। একই multiplexed-streams মডেল।

## "port 80-এ চলা" আসলে কী মানে

server process কল করে:

```python
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(("0.0.0.0", 80))
s.listen(128)
while True:
    conn, addr = s.accept()
    handle(conn)
```

কয়েকটা জিনিস ঘটছে:

- `0.0.0.0` মানে "যেকোনো interface"। `127.0.0.1` হলে শুধু loopback হতো।
- 1024-এর নিচের port-এর জন্য root বা `CAP_NET_BIND_SERVICE` দরকার (Linux & VPS-এর chapter 8)।
- `listen(128)` _backlog_ সেট করে — কতগুলো সম্পূর্ণ handshake হওয়া connection `accept()`-এর অপেক্ষায় queue-তে জমতে পারে। খুব কম হলে burst-এ kernel-এই connection drop হয়ে যায়।
- প্রতিটি `accept()` সেই একটি connection-এর জন্য একটি নতুন socket ফেরত দেয়। মূল listening socket নতুন connection accept করতেই থাকে।

server তারপর `conn`-কে একই thread-এ সামলাবে, worker pool-এ দেবে, নাকি event loop-এ register করবে — এটা একটা design সিদ্ধান্ত; chapter 4-এ আছে।

## Static বনাম dynamic, framework বনাম raw

একটি web server দুই ধরনের content serve করতে পারে:

- **Static** — disk-এ থাকা file (`/var/www/html/index.html`)। server file-টা পড়ে socket-এ লিখে দেয়। nginx এতে দুর্দান্ত।
- **Dynamic** — request-এর সময় কোড দিয়ে তৈরি করা content। server আপনার function চালায়, যা হয়তো একটি database query করে, অন্য service কল করে, একটি template render করে, আর response তৈরি করে।

dynamic content-এর জন্য, "server" প্রায়ই দুটি process:

1. একটি _reverse proxy_ (nginx) যা raw HTTP নেয়, TLS সামলায়, rate limit প্রয়োগ করে, static asset সরাসরি serve করে।
2. একটি _application server_ (আপনার Go binary, Node process, Python WSGI/ASGI app) যা dynamic route সামলায়, proxy-র পেছনে বসে।

বেশিরভাগ production setup এমনই দেখতে। Chapter 6 আর 7 proxy অংশটা কভার করে।

## রিক্যাপ

- একটি web server TCP connection accept করে, HTTP parse করে, request route করে, একটি response লেখে।
- HTTP/1.x plain text। Request line, headers, খালি লাইন, body। `\r\n` line ending।
- Method বহন করে উদ্দেশ্য (read, create, replace)। Status code বহন করে ফলাফল। 4xx হলো client; 5xx হলো server।
- Keep-alive TCP/TLS handshake-এর খরচ এড়াতে connection পুনরায় ব্যবহার করে।
- HTTP/2 একটি connection-এর ওপর stream multiplex করে। nginx আপনার জন্য সেটা terminate করে।
- Static content আসে disk থেকে। Dynamic content আসে আপনার application server থেকে, সাধারণত একটি reverse proxy-র পেছনে।

পরের অধ্যায়: `nc` আর কয়েকশো লাইন Go দিয়ে নিজেই HTTP বলুন।

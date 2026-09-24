---
title: 'Building a Real HTTP/1.1 Parser'
subtitle: 'Request body, Content-Length, chunked transfer encoding, আর ডজনখানেক edge case যা একটি খেলনা parser-কে এমন একটিতে পরিণত করে যাকে আপনি production-এ ভরসা করবেন।'
chapter: 3
level: 'beginner'
readingTime: '13 মিনিট'
topics: ['http', 'parser', 'chunked encoding', 'go', 'request body']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটি চিঠি পড়া কিন্তু খামের পরই থেমে যাওয়া — ঠিকানা বলে দেয় এটা কার জন্য, কিন্তু ভেতরের লেখাটাই আসল কথা। যে parser body উপেক্ষা করে সে খামটা পড়ে চিঠিটা ফেলে দিয়েছে।

</Callout>

## গল্পে বুঝি

বাগদাদের এক পুরনো দপ্তরে ফাতিমা বসেন হিসাবরক্ষণের জানালার ওপাশে। সারাদিন লোকজন এসে হাতে-লেখা আবেদনপত্র জমা দেয় — কেউ চায় নতুন রেকর্ড খুলতে, কেউ পুরনো নথি দেখতে। ফাতিমা প্রতিটা ফর্ম হাতে নিয়ে উপর থেকে নিচে এক লাইন এক লাইন করে পড়েন। প্রথম লাইনটাই সবচেয়ে জরুরি: সেখানে লেখা থাকে কী করতে চায় (দেখা, না নতুন লেখা, না মুছে ফেলা) আর কোন রেকর্ড নিয়ে কাজ। এরপর কাগজের কিনারায় ছোট ছোট মার্জিন-নোট — "জরুরি", "অমুক তারিখের মধ্যে", "কত পৃষ্ঠা সংযুক্ত"। আর সবশেষে খামের ভেতরে মূল সংযুক্ত পাতাটা, যেটাতে আসল বিষয়বস্তু।

কিন্তু সব ফর্ম তো পরিপাটি আসে না। কোনোটার কালি লেপ্টে আছে, কোনোটা তাড়াহুড়োয় অর্ধেক লিখে জমা পড়েছে, কোনোটায় মার্জিনে "৫ পৃষ্ঠা সংযুক্ত" লেখা অথচ খামে কেবল দুই পাতা। ফাতিমা এসবে ঘাবড়ান না — যে ফর্মে সংযুক্ত পাতার সংখ্যা লেখা, তিনি ঠিক ততগুলোই গোনেন, বেশিও না কমও না; আর যেটা এলোমেলো বা অসম্পূর্ণ, সেটা তিনি ফিরিয়ে দিয়ে বলেন "এটা আবার ঠিক করে আনো", পুরো লাইন ভজঘট পাকিয়ে ফেলেন না।

এই গল্পটাই আসলে একটা **HTTP parser**। ফাতিমার এক লাইন এক লাইন করে ফর্ম পড়াটাই parser-এর কাঁচা request text পড়া; ফর্মকে চারটে অংশে ভাগ করাটাই **method** (কী করতে চায়), **path** (কোন রেকর্ড), **header** (মার্জিন-নোট) আর **body** (সংযুক্ত পাতা) আলাদা করা। মার্জিনে লেখা পৃষ্ঠাসংখ্যা মিলিয়ে ঠিক ততগুলো গোনাটাই `content-length` অনুযায়ী body পড়া; আর অর্ধেক-আসা বা লেপ্টে-যাওয়া ফর্ম ফিরিয়ে দেওয়াটাই parser-এর partial read আর malformed input সামলে `400` ফেরত দেওয়া। বাস্তবে Nginx বা Go-র `net/http` ঠিক এভাবেই প্রতিটা incoming request পড়ে টুকরো করে — একটা byte বেশি পড়লেই পরের request নষ্ট, তাই সীমানায় নিখুঁতভাবে থামাটা এখানে সবচেয়ে জরুরি।

## আমাদের খেলনা server যা পারে না

chapter-2-এর server শুধু `GET` সামলায়। যদি একটি client একটি JSON body সহ `POST /api HTTP/1.1` পাঠায়, আমরা request line আর headers পড়ি, তারপর body উপেক্ষা করি। body kernel-এর receive buffer-এ বসে থাকে; এই socket-এ পরের read সেটাকে আবর্জনা হিসেবে ফেরত দেয়; server ভেঙে পড়ে।

body সঠিকভাবে সামলাতে হলে parser-কে অবশ্যই:

1. চিনতে হবে যে একটি body _আছে_ — `Content-Length` অথবা `Transfer-Encoding: chunked` দিয়ে।
2. ঠিক সঠিক সংখ্যক bytes পড়তে হবে (বেশিও না, কমও না)।
3. সীমানায় থামতে হবে যাতে একটি keep-alive connection-এ পরের request পরিষ্কারভাবে শুরু হয়।

সত্যিকারের HTTP/1.1 parser তাদের বেশিরভাগ লাইন এই কাজেই ব্যয় করে।

## একটি body তিনভাবে শেষ হয়

HTTP/1.1-এ "body শেষ" বোঝানোর ঠিক তিনটি বৈধ সংকেত আছে:

**1. Content-Length: N** — খালি লাইনের পর ঠিক N bytes পড়ুন।

```text
POST /api HTTP/1.1
Host: example.com
Content-Length: 18

{"name":"Fatima"}
```

খালি লাইনের পর, 18 bytes পড়ুন। থামুন। শেষ।

**2. Transfer-Encoding: chunked** — একটি zero-length chunk না আসা পর্যন্ত chunk পড়ুন।

```text
POST /upload HTTP/1.1
Host: example.com
Transfer-Encoding: chunked

7
Mozilla
9
Developer
7
Network
0

```

প্রতিটি chunk হলো `<size in hex>\r\n<data>\r\n`। একটি `0\r\n\r\n` body-কে terminate করে।

**3. Connection: close** — body EOF পর্যন্ত চলে। server socket বন্ধ করে দেয়, client পড়তে থাকে যতক্ষণ না read 0 bytes ফেরত দেয়। HTTP/1.0 আর অজানা length-এর response-এ ব্যবহৃত হয়।

একটি সঠিক parser তিনটিই সামলায়। এর বাইরে কিছু (একটি `POST` যাতে `Content-Length`-ও নেই chunked-ও নেই) malformed — `400 Bad Request` ফেরত দিন।

## আমাদের Go server-এ body যোগ করা

chapter 2-এর server বাড়ানো হচ্ছে। headers parse হয়ে গেলে নতুন function body পড়ে:

```go
func readBody(reader *bufio.Reader, headers map[string]string) ([]byte, error) {
    if cl, ok := headers["content-length"]; ok {
        n, err := strconv.Atoi(cl)
        if err != nil || n < 0 {
            return nil, errors.New("invalid Content-Length")
        }
        if n > maxBodySize {
            return nil, errors.New("body too large")
        }
        body := make([]byte, n)
        _, err = io.ReadFull(reader, body)
        return body, err
    }
    if te, ok := headers["transfer-encoding"]; ok && te == "chunked" {
        return readChunked(reader)
    }
    return nil, nil // no body
}
```

`io.ReadFull` পড়তে থাকে যতক্ষণ না ঠিক `n` bytes পাওয়া যায়, নয়তো একটি error ফেরত দেয়। খেয়াল করুন আমরা `maxBodySize` (ধরুন 10MB) দিয়ে সীমা বাঁধি যাতে একটি ক্ষতিকর client `Content-Length: 999999999999` পাঠাতে না পারে।

## chunked decoding বাস্তবায়ন

```go
const maxChunkSize = 1 << 20 // 1MB per chunk

func readChunked(reader *bufio.Reader) ([]byte, error) {
    var body bytes.Buffer
    for {
        // Read the chunk size line
        line, err := reader.ReadString('\n')
        if err != nil {
            return nil, err
        }
        line = strings.TrimRight(line, "\r\n")
        // Hex chunk size; ignore any chunk extensions after `;`
        if idx := strings.IndexByte(line, ';'); idx >= 0 {
            line = line[:idx]
        }
        size, err := strconv.ParseInt(line, 16, 64)
        if err != nil || size < 0 {
            return nil, errors.New("invalid chunk size")
        }
        if size == 0 {
            // Read trailing CRLF after the zero-length chunk
            reader.ReadString('\n')
            return body.Bytes(), nil
        }
        if size > maxChunkSize {
            return nil, errors.New("chunk too large")
        }
        if int64(body.Len())+size > maxBodySize {
            return nil, errors.New("body too large")
        }
        chunk := make([]byte, size)
        if _, err := io.ReadFull(reader, chunk); err != nil {
            return nil, err
        }
        body.Write(chunk)
        // Consume the CRLF after the chunk data
        if _, err := reader.ReadString('\n'); err != nil {
            return nil, err
        }
    }
}
```

লক্ষণীয়:

- Chunk size wire format-এ **hexadecimal** (`7` হলো 7 bytes, `1F` হলো 31 bytes)। সহজেই ভুলে যাওয়া যায় — অনেক homemade parser 10–15 size-এর chunk-এ নীরবে fail করে।
- প্রতিটি chunk-এর একটি _trailing_ `\r\n` থাকে যা আপনাকে consume করতে হবে।
- Terminator হলো 0 size-এর একটি chunk, ঐচ্ছিকভাবে তার পর trailers (আরও headers), তারপর একটি চূড়ান্ত `\r\n`। বেশিরভাগ client trailers বাদ দেয়; আপনার parser-কে তবু বাড়তি `\r\n`-টা গিলে ফেলতে হবে।
- Chunk extension (`;`-এর পর) spec-এ আছে কিন্তু কার্যত কখনোই ব্যবহৃত হয় না। এগুলো এড়িয়ে যান।

## সত্যিকারের parser যে ডজনখানেক edge case সামলায়

একটি homemade parser সাধারণত "happy path" test সাথে সাথে পাস করে, তারপর adversarial input-এ মরে যায়। নিচের তালিকাটাই একটা weekend project আর `net/http`-এর মধ্যে পার্থক্য।

**1. Header line folding.** পুরনো HTTP-তে headers একাধিক লাইন জুড়ে wrap করা যেত। `Host: \r\n example.com` আর `Host: example.com` একই। আধুনিক HTTP/1.1 এটা deprecated করেছে; reject করুন।

**2. Duplicate headers.** `Set-Cookie: a=1\r\nSet-Cookie: b=2` হলো দুটো cookie, একটা আরেকটাকে overwrite করছে না। parser-কে list-টা store করতে হবে। বেশিরভাগ অন্য header (`Content-Length`, `Host`) দুবার এলে সেটা `400` হওয়া উচিত।

**3. Header injection.** `User-Agent: evil\r\nX-Admin: true` — একটি client একটি value-তে `\r\n` embed করে একটি বাড়তি header পাচার করার চেষ্টা করতে পারে। CR বা LF আছে এমন যেকোনো header value reject করুন।

**4. Case-insensitive header names.** `Content-Length`, `content-length`, `CONTENT-LENGTH` সবই একই header। lookup-এর আগে সবসময় lowercase-এ normalize করুন।

**5. Whitespace tolerance.** `Content-Length: 18` আর `Content-Length:18` দুটোই বৈধ; `Content-Length : 18` নয় (colon-এর আগে space)। value-র চারপাশে trim করুন, name-এর চারপাশে নয়।

**6. Request smuggling.** `Content-Length` আর `Transfer-Encoding: chunked` দুটোই আছে এমন একটি request বিপজ্জনক — পথের বিভিন্ন proxy প্রতিটাকে ভিন্নভাবে ব্যাখ্যা করতে পারে, যা একজন attacker-কে প্রথমটির ভেতরে একটি লুকানো দ্বিতীয় request "পাচার" করতে দেয়। নিরাপদ আচরণ: দুটোই থাকলে `400` দিয়ে reject করুন। **সবসময়।**

**7. Massive headers.** মোট header section-এর size সীমাবদ্ধ করুন (সাধারণত 8KB বা 16KB)। নাহলে একজন attacker একটি 1GB header line পাঠিয়ে আপনাকে OOM করতে পারে।

**8. Truncated input.** client পাঠানোর মাঝপথে socket বন্ধ করে দেয়। read error-কে crash না করে পরিষ্কারভাবে connection বন্ধ করতে হবে।

**9. Slow clients (Slowloris).** একটি client প্রতি 30 সেকেন্ডে একটি byte পাঠায়। connection খোলা কিন্তু অনুৎপাদনশীল। সবসময় একটি `ReadHeaderTimeout` (যেমন, 5–10 সেকেন্ড) সেট করুন যাতে parser অনন্তকাল ঝুলে না থাকে।

**10. Pipelined requests.** একটি client হয়তো এই request-এর body-র পরেই পরের request পাঠিয়ে ফেলেছে। response-এর পর, parser-কে buffered bytes না হারিয়ে _আরেকটি_ request-এর জন্য প্রস্তুত থাকতে হবে। `bufio.Reader` এটা স্বাভাবিকভাবেই করে — আপনার `for` loop শুধু চলতে থাকে।

**11. CRLF vs LF.** Spec বলে CRLF; অনেক client LF পাঠায়। input-এ উদার হন, output-এ কঠোর (RFC 9110 আসলে input-এও এখনও CRLF দাবি করে, কিন্তু সত্যিকারের parser ক্ষমাশীল)।

**12. Encoding.** Headers অবশ্যই ASCII (বা 7-bit) হতে হবে। header-এ non-ASCII অক্ষর percent-encode করতে হবে অথবা reject করতে হবে। body যেকোনো কিছু হতে পারে; সেটা application-এর সমস্যা।

<Callout type="warn">

**Header injection (#3) আর request smuggling (#6) হলো শ্রেণীবদ্ধ vulnerability** যা আপনার শোনা কোম্পানিগুলোতে সত্যিকারের breach ঘটিয়েছে। আপনি যদি একটি homemade parser ship করেন, দুটোর বিরুদ্ধেই আপনাকে রক্ষা করতে হবে।

</Callout>

## একটি সম্পূর্ণ parser, limit সহ

এই যে chapter-2-এর server, body parsing আর সবচেয়ে গুরুত্বপূর্ণ limit সহ বাড়ানো:

```go
// main.go (excerpt)
const (
    maxRequestLine = 8 * 1024
    maxHeaderSize  = 16 * 1024
    maxBodySize    = 10 * 1024 * 1024
)

func parseRequest(reader *bufio.Reader) (method, path string, headers map[string]string, body []byte, err error) {
    // 1. Request line
    line, err := readLine(reader, maxRequestLine)
    if err != nil {
        return "", "", nil, nil, err
    }
    parts := strings.SplitN(line, " ", 3)
    if len(parts) != 3 {
        return "", "", nil, nil, errors.New("malformed request line")
    }
    method, path = parts[0], parts[1]
    if parts[2] != "HTTP/1.1" && parts[2] != "HTTP/1.0" {
        return "", "", nil, nil, errors.New("unsupported HTTP version")
    }

    // 2. Headers
    headers = map[string]string{}
    headerBytes := 0
    for {
        h, err := readLine(reader, maxHeaderSize)
        if err != nil {
            return "", "", nil, nil, err
        }
        if h == "" {
            break
        }
        headerBytes += len(h)
        if headerBytes > maxHeaderSize {
            return "", "", nil, nil, errors.New("headers too large")
        }
        i := strings.IndexByte(h, ':')
        if i < 0 {
            return "", "", nil, nil, errors.New("malformed header")
        }
        name := strings.ToLower(strings.TrimSpace(h[:i]))
        val := strings.TrimSpace(h[i+1:])
        if strings.ContainsAny(val, "\r\n") {
            return "", "", nil, nil, errors.New("header injection")
        }
        // Reject duplicate Content-Length / Transfer-Encoding combos
        if (name == "content-length" || name == "transfer-encoding") && headers[name] != "" {
            return "", "", nil, nil, errors.New("duplicate length headers")
        }
        headers[name] = val
    }
    if _, hasCL := headers["content-length"]; hasCL {
        if _, hasTE := headers["transfer-encoding"]; hasTE {
            return "", "", nil, nil, errors.New("conflicting length headers")
        }
    }

    // 3. Body
    body, err = readBody(reader, headers)
    return method, path, headers, body, err
}

func readLine(reader *bufio.Reader, max int) (string, error) {
    line, err := reader.ReadString('\n')
    if err != nil {
        return "", err
    }
    if len(line) > max {
        return "", errors.New("line too long")
    }
    return strings.TrimRight(line, "\r\n"), nil
}
```

এটা এখন একটি সম্মানজনক HTTP/1.1 parser। chapter 2-এর accept loop-এর সাথে জুড়ে দিন আর আপনার কাছে এমন কিছু হবে যা আপনি একটি ছোট app-এর সামনে বসাতে পারেন।

## আপনার parser stress-test করা

parser হয়ে গেলে, তার দিকে খারাপ input ছুঁড়ে মারুন। একটি সরল script:

```bash
# Truncated request
printf 'GET /' | nc localhost 8080

# Empty body but Content-Length says 100
printf 'POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 100\r\n\r\n' | nc localhost 8080

# Both Content-Length and Transfer-Encoding (smuggling attempt)
printf 'POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n' | nc localhost 8080

# Header injection attempt
printf 'GET / HTTP/1.1\r\nHost: x\r\nX-Test: a\r\nX-Admin: yes\r\n\r\n' | nc localhost 8080

# Massive header
yes 'X-Spam: AAAAAAAAAAAA' | head -10000 | { printf 'GET / HTTP/1.1\r\nHost: x\r\n'; cat; printf '\r\n'; } | nc localhost 8080
```

একটি parser যা এসবের কোনোটাতেই crash করে না, ঝুলে থাকে না, আর সব ক্ষেত্রে সেনসিবল error response ফেরত দেয় — সেটা তার কাজ করছে।

## কখন থেমে একটি সত্যিকারের library ব্যবহার করবেন

মোটামুটি এখনই। নিজের parser লেখার উদ্দেশ্য হলো `net/http` কী করে তা বোঝা। এটাকে সঠিকভাবে production-grade পর্যন্ত লেখা — RFC 9112-এর প্রতিটি edge case সামলানো, প্রতিটি fuzzing input থেকে বেঁচে যাওয়া, গ্রহণযোগ্য throughput-এ পৌঁছানো — কয়েক মাসের কাজ। standard library ব্যবহার করুন।

আপনি যে mental model গড়ে তুলেছেন সেটাই সামনে বয়ে নিয়ে যায়:

- একটি request হলো একটি লাইন, headers, খালি লাইন, body।
- body-র length সংকেত করে `Content-Length` অথবা chunked encoding।
- Limit ঐচ্ছিক নয়; এগুলোই একটি server আর একটি denial-of-service vulnerability-র মধ্যে পার্থক্য।

chapter 4-এ আমরা _concurrency_ model দেখব — এই parser সহ একটি server কীভাবে হাজার হাজার thread spawn না করেই হাজার হাজার concurrent connection-এ scale করে।

## রিক্যাপ

- HTTP/1.1 body শেষ হয় `Content-Length`, chunked encoding, অথবা socket close-এর মাধ্যমে।
- Chunked encoding-এ একটি hex size থাকে, তারপর bytes, তারপর CRLF; একটি zero-size chunk terminate করে।
- সত্যিকারের parser ডজনখানেক edge case সামলায়: header injection, duplicate length headers, slow clients, বড় input, pipelining।
- সবসময় header আর body size-এ সীমা বাঁধুন আর timeout সেট করুন। Default হলো denial-of-service vector।
- একবার হাতে-কলমে parser লিখে ফেললে, সত্যিকারের কাজের জন্য `net/http`-এ (বা আপনার ভাষার সমতুল্যে) চলে যান।

পরের অধ্যায়: এই একই parser কীভাবে অনেক connection-এ scale করে — প্রতিটি web server-এর পেছনের threading আর event-loop-এর পছন্দগুলো।

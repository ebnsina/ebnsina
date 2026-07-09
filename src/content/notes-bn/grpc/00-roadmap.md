---
title: 'gRPC তৈরি — রোডম্যাপ'
subtitle: "দশটি অধ্যায় যা আপনাকে 'protobuf একটা config language' থেকে শুরু করে একটা polyglot, mTLS দিয়ে সুরক্ষিত, observable gRPC service পর্যন্ত নিয়ে যাবে — যা nginx-এর পেছনে চলছে, streaming RPC আর টাইট deadline সহ।"
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap', 'grpc', 'protobuf', 'http2', 'rpc']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## শেষে গিয়ে আপনি যা করতে পারবেন

আপনি `.proto` ফাইল ডিজাইন করতে পারবেন, Go, Node আর Python-এ কোড জেনারেট করতে পারবেন, unary আর streaming RPC সহ একটা gRPC server ship করতে পারবেন, deadline সেট করে সেগুলো propagate করতে পারবেন, auth আর logging-এর জন্য interceptor লিখতে পারবেন, mTLS দিয়ে সুরক্ষিত করতে পারবেন, আর nginx-এর পেছনে একটা self-hosted gRPC service ডিপ্লয় করতে পারবেন। শেষে গিয়ে আপনি ঠিক বুঝতে পারবেন কখন gRPC সঠিক shape — আর কখন REST বা GraphQL বেশি মানানসই।

<Callout type="info">

**Prereqs:** আগে **Linux & VPS basics**, **Networking**, আর **TLS & Certificates** track গুলো শেষ করুন। gRPC চলে HTTP/2 আর TLS-এর ওপর ভর করে — এই track গুলো ছাড়া failure mode গুলো আপনাকে ধাঁধায় ফেলবে। **REST API building** আর **Web Server fundamentals** track গুলোও সাহায্য করবে। Go হলো প্রধান ভাষা; polyglot অধ্যায়ে Node আর Python কভার করা হয়েছে।

</Callout>

## ১০টি অধ্যায়, ক্রম অনুযায়ী

**Foundations**

1. **gRPC কী আর কখন ব্যবহার করবেন** — RPC vs REST vs GraphQL, আসল tradeoff গুলো
2. **Protocol Buffers** — proto3 syntax, wire format, schema evolution
3. **নিচে HTTP/2** — multiplexing, framing, flow control, কেন এটা গুরুত্বপূর্ণ
4. **আপনার প্রথম server আর client** — Go-তে end-to-end, codegen, unary RPC

**Real services**

5. **Polyglot — Node আর Python client** — একই proto, তিনটা ভাষা
6. **Streaming RPC** — server, client, আর bidirectional stream
7. **Error, deadline, metadata** — status code, timeout, header
8. **Interceptor** — auth, logging, retry, recovery-র জন্য middleware

**Production**

9. **TLS আর mTLS** — cert, identity, peer authentication
10. **Production self-host** — load balancing, observability, nginx-এর পেছনে

## এই track কীভাবে ব্যবহার করবেন

ক্রম অনুযায়ী পড়ুন। প্রথম তিনটা অধ্যায় moving part গুলো ব্যাখ্যা করে; অধ্যায় 4 চলমান কোড ship করে। এরপর প্রতিটা অধ্যায় একটা করে আসল production capability যোগ করে। মোট পড়া: ~3 ঘণ্টা। হাতে-কলমে, প্রথমবার পুরোটা বানাতে: একটা লম্বা weekend।

আপনার দরকার Go 1.22+, `protoc` compiler, অধ্যায় 5-এর জন্য Node 20+ আর Python 3.11+, আর অধ্যায় 10-এর জন্য একটা VPS যার দিকে একটা domain pointed করা আছে। বাকি সবকিছু `localhost`-এ চলে।

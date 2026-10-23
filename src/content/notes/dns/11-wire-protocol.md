---
title: 'DNS-এর ওয়্যার প্রোটোকল ও ট্রান্সপোর্ট'
subtitle: 'একটা DNS মেসেজের প্রতিটা byte, নাম কম্প্রেশন, UDP-র সীমা, EDNS, TC বিট ও TCP ফলব্যাক, আর DoT, DoH, DoQ দিয়ে এনক্রিপ্টেড DNS।'
chapter: 11
level: 'advanced'
readingTime: '২৪ মিনিট'
topics: ['dns wire format', 'edns0', 'udp', 'tcp', 'truncation', 'doh', 'dot', 'doq', 'name compression']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

পুরান ঢাকার এক পোস্ট অফিসে কাউন্টারে বসেন কিন্দি। তাঁর কাজ টেলিগ্রাম আর ছোট পার্সেল পাঠানো। টেলিগ্রামের জন্য একটা ছাপানো ফর্ম আছে: ওপরে বারোটা ঘর, প্রতিটার মাপ নির্দিষ্ট। প্রথম ঘরে একটা রসিদ নাম্বার, তারপর কয়েকটা টিক দেওয়ার বাক্স ("জরুরি?", "উত্তর চাই?"), তারপর কয়টা প্রশ্ন আর কয়টা উত্তর আছে তার গুনতি। ঘরগুলো এত বাঁধা যে অন্য শহরের কেরানি ফর্মটা হাতে নিয়েই জানেন কোন ঘরে কী আছে, কিছু পড়ার আগেই। খোয়ারিজমি এসে ফর্মে লেখেন: "কর্ডোবার বায়তুল হিকমার ঠিকানা কী?" রসিদ নাম্বারটা তিনি নিজে বানিয়ে লেখেন, যাতে উত্তর এলে মেলাতে পারেন যে এটা তাঁরই প্রশ্নের জবাব।

উত্তরের ফর্মে একই ঠিকানা বারবার লিখতে হয়: "কর্ডোবা, বায়তুল হিকমা, প্রধান ফটক", "কর্ডোবা, বায়তুল হিকমা, পেছনের ফটক"। কাগজ বাঁচাতে কেরানিরা একটা চালাকি করেন: দ্বিতীয়বার পুরো নাম না লিখে লেখেন "ওপরের তিন নম্বর লাইনের নাম দেখুন"। ফর্ম ছোট থাকে, কিন্তু পড়ার সময় চোখ ওপরে-নিচে লাফাতে হয়।

সমস্যা হয় যখন উত্তর অনেক লম্বা। ডাকবিভাগের পুরনো নিয়ম, এক টেলিগ্রামে ৫১২ অক্ষরের বেশি না। পরে নিয়ম হলো, প্রশ্নকারী চাইলে ফর্মের নিচে একটা চিরকুট জুড়ে দিতে পারেন: "আমি বড় খাম নিতে পারি, ১২৩২ অক্ষর পর্যন্ত।" তার চেয়েও বড় উত্তর হলে কেরানি পুরোটা পাঠান না। যতটুকু ধরে ততটুকু লিখে ওপরে লাল কালিতে লেখেন "অসম্পূর্ণ", মানে "পুরোটা চাইলে রেজিস্টার্ড পার্সেলে আবার জিজ্ঞেস করুন"। রেজিস্টার্ড পার্সেল ধীর, কাউন্টারে সই করতে হয়, কিন্তু যত বড় জিনিসই হোক নিরাপদে পৌঁছায়। আর একটা খাম যদি এত বড় হয় যে রাস্তার কোনো ছোট ডাকঘর সেটাকে দুই টুকরো করে পাঠায়, তাহলে মাঝপথে কেউ দ্বিতীয় টুকরোটা বদলে দিলে প্রাপক টেরই পান না।

শেষে একটা নতুন সমস্যা: টেলিগ্রাম খোলা কাগজে যায়, পথের যেকোনো পিয়ন পড়তে পারে খোয়ারিজমি কার ঠিকানা খুঁজছেন। তাই কেউ কেউ এখন সিলমোহর করা খামে পাঠান, কেউ সাধারণ চিঠির বস্তার ভেতরে লুকিয়ে, যাতে বাইরে থেকে বোঝাই না যায় এটা টেলিগ্রাম।

মিলিয়ে নিই: ছাপানো বারো ঘরের ফর্ম হলো DNS-এর **১২-byte header**, রসিদ নাম্বার হলো **message ID**, টিক বাক্সগুলো **flags** (RD, RA, AA, TC...), গুনতির ঘরগুলো **QDCOUNT/ANCOUNT/NSCOUNT/ARCOUNT**। "ওপরের লাইনের নাম দেখুন" হলো **name compression pointer**। ৫১২ অক্ষরের সীমা হলো **পুরনো UDP সীমা**, বড় খামের চিরকুট হলো **EDNS0-র OPT রেকর্ড** আর তার **UDP payload size**, লাল কালির "অসম্পূর্ণ" হলো **TC বিট**, রেজিস্টার্ড পার্সেল হলো **TCP ফলব্যাক**, আর মাঝপথে টুকরো হওয়া খাম হলো **IP fragmentation** ও তার আক্রমণ। সিলমোহর করা খাম হলো **DoT**, চিঠির বস্তায় লুকানো টেলিগ্রাম হলো **DoH**। বাস্তবে প্রতিটা `dig` কমান্ড ঠিক এই ফর্মটাই পূরণ করে পাঠায়, আর প্রতিটা "বড় রেসপন্স আসছে না" বাগ এই খাম আর পার্সেলের কোনো এক জায়গায় আটকে থাকে।

## কেন byte লেভেলে জানতে হবে

বেশিরভাগ দিন `dig` চালালেই চলে। কিন্তু কয়েকটা সমস্যা আছে যেগুলো byte না বুঝলে ধরা যায় না: ফায়ারওয়াল বড় UDP প্যাকেট ফেলে দিচ্ছে, TCP/53 বন্ধ বলে শুধু DNSSEC-ওয়ালা ডোমেইন ফেইল করছে, কোনো লাইব্রেরি কম্প্রেশন পয়েন্টার ভুল পড়ছে, বা অফিসের নেটওয়ার্ক DoH ব্লক করছে। এই চ্যাপ্টারে আমরা নিজের হাতে একটা DNS query বানাব, পাঠাব, আর উত্তরটা byte ধরে পড়ব।

## মেসেজের গঠন

query আর response, দুটোর ফরম্যাট একই (RFC 1035)। পাঁচটা অংশ:

```text
+---------------------+
|        Header       |  always 12 bytes
+---------------------+
|       Question      |  what is being asked
+---------------------+
|        Answer       |  RRs answering the question
+---------------------+
|      Authority      |  RRs pointing to authoritative servers (NS, SOA)
+---------------------+
|      Additional     |  extra RRs (glue A/AAAA, the EDNS OPT record)
+---------------------+
```

`dig`-এর আউটপুটের `QUESTION SECTION`, `ANSWER SECTION`, `AUTHORITY SECTION`, `ADDITIONAL SECTION` হুবহু এই চারটা অংশ। `OPT PSEUDOSECTION` আসলে additional অংশের ভেতরের একটা বিশেষ রেকর্ড, `dig` সেটাকে আলাদা করে সুন্দর করে দেখায়।

### Header: ১২ byte, ৯৬ বিট

```text
                                1  1  1  1  1  1
  0  1  2  3  4  5  6  7  8  9  0  1  2  3  4  5
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                      ID                       |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|QR|   OPCODE  |AA|TC|RD|RA| Z|AD|CD|   RCODE   |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                    QDCOUNT                    |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                    ANCOUNT                    |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                    NSCOUNT                    |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                    ARCOUNT                    |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
```

| ফিল্ড   | বিট | মানে                                                                                       |
| ------- | --- | ------------------------------------------------------------------------------------------ |
| ID      | 16  | ক্লায়েন্টের বানানো র‍্যান্ডম নাম্বার; উত্তরে হুবহু ফেরত আসে, না মিললে উত্তর ফেলে দিতে হয় |
| QR      | 1   | 0 = query, 1 = response                                                                    |
| OPCODE  | 4   | 0 = সাধারণ query; 4 = NOTIFY, 5 = UPDATE                                                   |
| AA      | 1   | Authoritative Answer: উত্তরটা zone-এর মালিক সার্ভার নিজে দিচ্ছে, ক্যাশ থেকে নয়           |
| TC      | 1   | TrunCation: উত্তর কেটে ছোট করা হয়েছে, TCP-তে আবার চাও                                     |
| RD      | 1   | Recursion Desired: "আমার হয়ে পুরো খোঁজটা করে দাও"                                        |
| RA      | 1   | Recursion Available: সার্ভারটা recursion করে                                               |
| Z       | 1   | রিজার্ভড, সবসময় 0                                                                         |
| AD      | 1   | Authentic Data: resolver DNSSEC দিয়ে যাচাই করেছে (চ্যাপ্টার ১২)                          |
| CD      | 1   | Checking Disabled: "DNSSEC যাচাই করো না, যা পাও দাও"                                       |
| RCODE   | 4   | 0 NOERROR, 1 FORMERR, 2 SERVFAIL, 3 NXDOMAIN, 4 NOTIMP, 5 REFUSED                          |
| QDCOUNT | 16  | question কয়টা (বাস্তবে সবসময় 1)                                                          |
| ANCOUNT | 16  | answer রেকর্ড কয়টা                                                                       |
| NSCOUNT | 16  | authority রেকর্ড কয়টা                                                                    |
| ARCOUNT | 16  | additional রেকর্ড কয়টা (OPT সহ)                                                          |

`dig`-এ `;; flags: qr rd ra ad;` লাইনটা এই বিটগুলোরই ছোট হাতের তালিকা: যে বিট 1, তার নাম ছাপা হয়।

<Callout type="tip">

RCODE মাত্র ৪ বিট, তাই সর্বোচ্চ ১৫টা কোড ধরে। EDNS এসে OPT রেকর্ডে আরও ৮ বিট যোগ করেছে (extended RCODE), যেমন `BADVERS`। আর আলাদা করে **Extended DNS Errors** (RFC 8914) OPT-এর ভেতরে একটা লেখা জুড়ে দেয়, যেমন "DNSSEC Bogus" বা "Network Error"। নতুন `dig` (৯.১৬+) এটা `; EDE: 6 (DNSSEC Bogus)` হিসেবে দেখায়, SERVFAIL-এর আসল কারণ বোঝার সবচেয়ে সহজ রাস্তা এটাই।

</Callout>

### নাম কীভাবে লেখা হয়: label

`www.example.com` তারে যায় ডট ছাড়া, প্রতিটা অংশের আগে তার দৈর্ঘ্য লিখে, শেষে একটা শূন্য byte (root):

```text
03 77 77 77  07 65 78 61 6d 70 6c 65  03 63 6f 6d  00
 3  w  w  w   7  e  x  a  m  p  l  e   3  c  o  m  root
```

এখান থেকেই দুটো সীমা আসে: একটা label সর্বোচ্চ ৬৩ byte (দৈর্ঘ্যের byte-এর ওপরের দুই বিট অন্য কাজে লাগে), পুরো নাম সর্বোচ্চ ২৫৫ byte।

### Question অংশ

নাম, তারপর ২ byte QTYPE (A = 1, NS = 2, CNAME = 5, SOA = 6, MX = 15, TXT = 16, AAAA = 28, OPT = 41, HTTPS = 65), তারপর ২ byte QCLASS (IN = 1, CH = 3)।

### Resource Record (RR) এর গঠন

answer, authority, additional, তিন অংশের প্রতিটা রেকর্ড একই ছাঁচে:

```text
NAME      variable  owner name (often a compression pointer)
TYPE      2 bytes   A, AAAA, CNAME, ...
CLASS     2 bytes   IN
TTL       4 bytes   seconds this record may be cached
RDLENGTH  2 bytes   length of RDATA
RDATA     RDLENGTH  the actual data: 4 bytes for A, 16 for AAAA, a name for CNAME
```

### নাম কম্প্রেশন

একই রেসপন্সে `example.com` পাঁচবার থাকলে পাঁচবার পুরো লেখা অপচয়। তাই একটা label-এর দৈর্ঘ্যের byte-এর ওপরের দুই বিট `11` হলে সেটা আর দৈর্ঘ্য না, একটা **pointer**: বাকি ১৪ বিট হলো মেসেজের শুরু থেকে offset, যেখানে নামের বাকিটা লেখা আছে।

```text
c0 0c   ->  11000000 00001100  ->  pointer to offset 12
```

offset ১২ মানে header-এর ঠিক পরের byte, অর্থাৎ question-এর নাম। এজন্যই প্রায় প্রতিটা DNS রেসপন্সে `c0 0c` দেখবেন: answer-এর owner name হলো "question-এ যে নাম ছিল, সেটাই"।

<Callout type="warning">

pointer আরেকটা pointer-এর দিকে যেতে পারে। খারাপভাবে লেখা parser একটা লুপে পড়ে যায় (pointer A → B → A), বা মেসেজের বাইরে পড়ে ফেলে। DNS parser-এর অনেক CVE ঠিক এখান থেকে এসেছে। নিজে parser লিখলে লাফের সংখ্যা সীমিত রাখুন আর প্রতিটা offset মেসেজের দৈর্ঘ্যের সাথে মিলিয়ে দেখুন, নিচের কোডে যেমন করা হয়েছে।

</Callout>

## নিজের হাতে একটা query

নিচের Go প্রোগ্রামটা শুধু stdlib দিয়ে একটা A query বানায়, hexdump দেখায়, UDP-তে পাঠায়, আর উত্তর byte ধরে পার্স করে। কোনো DNS লাইব্রেরি নেই, যাতে প্রতিটা byte চোখে পড়ে।

```go
// rawdns sends one A query over UDP and parses the answer by hand.
package main

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"os"
	"strings"
	"time"
)

const (
	typeA   = 1
	typeOPT = 41
	classIN = 1
)

func buildQuery(id uint16, name string) []byte {
	msg := make([]byte, 12, 64)
	binary.BigEndian.PutUint16(msg[0:], id)
	binary.BigEndian.PutUint16(msg[2:], 0x0100) // RD=1
	binary.BigEndian.PutUint16(msg[4:], 1)      // QDCOUNT
	binary.BigEndian.PutUint16(msg[10:], 1)     // ARCOUNT: the OPT record

	for _, label := range strings.Split(strings.TrimSuffix(name, "."), ".") {
		msg = append(msg, byte(len(label)))
		msg = append(msg, label...)
	}
	msg = append(msg, 0)
	msg = binary.BigEndian.AppendUint16(msg, typeA)
	msg = binary.BigEndian.AppendUint16(msg, classIN)

	// EDNS0 OPT pseudo-record: root name, TYPE=41, CLASS=UDP payload size.
	msg = append(msg, 0)
	msg = binary.BigEndian.AppendUint16(msg, typeOPT)
	msg = binary.BigEndian.AppendUint16(msg, 1232)
	msg = append(msg, 0, 0, 0, 0) // extended RCODE, version, flags
	msg = binary.BigEndian.AppendUint16(msg, 0)
	return msg
}

// readName follows compression pointers; it returns the name and the offset
// just past the name at its original position.
func readName(msg []byte, off int) (string, int, error) {
	var labels []string
	end, jumps := -1, 0
	for {
		if off >= len(msg) {
			return "", 0, errors.New("name runs past message")
		}
		n := int(msg[off])
		switch {
		case n == 0:
			if end < 0 {
				end = off + 1
			}
			return strings.Join(labels, ".") + ".", end, nil
		case n&0xC0 == 0xC0:
			if off+1 >= len(msg) || jumps > 10 {
				return "", 0, errors.New("bad compression pointer")
			}
			if end < 0 {
				end = off + 2
			}
			off = int(binary.BigEndian.Uint16(msg[off:]) & 0x3FFF)
			jumps++
		default:
			if off+1+n > len(msg) {
				return "", 0, errors.New("label runs past message")
			}
			labels = append(labels, string(msg[off+1:off+1+n]))
			off += 1 + n
		}
	}
}

func parse(msg []byte, wantID uint16) error {
	if len(msg) < 12 {
		return errors.New("short header")
	}
	if id := binary.BigEndian.Uint16(msg[0:]); id != wantID {
		return fmt.Errorf("id mismatch: got %d want %d", id, wantID)
	}
	flags := binary.BigEndian.Uint16(msg[2:])
	qd := binary.BigEndian.Uint16(msg[4:])
	an := binary.BigEndian.Uint16(msg[6:])
	fmt.Printf("QR=%d OPCODE=%d AA=%d TC=%d RD=%d RA=%d AD=%d CD=%d RCODE=%d\n",
		flags>>15&1, flags>>11&0xF, flags>>10&1, flags>>9&1, flags>>8&1,
		flags>>7&1, flags>>5&1, flags>>4&1, flags&0xF)
	if flags>>9&1 == 1 {
		return errors.New("truncated: retry over TCP")
	}

	off := 12
	for range qd {
		_, next, err := readName(msg, off)
		if err != nil {
			return err
		}
		off = next + 4 // QTYPE + QCLASS
	}
	for range an {
		name, next, err := readName(msg, off)
		if err != nil {
			return err
		}
		off = next
		if off+10 > len(msg) {
			return errors.New("short record")
		}
		typ := binary.BigEndian.Uint16(msg[off:])
		ttl := binary.BigEndian.Uint32(msg[off+4:])
		rdlen := int(binary.BigEndian.Uint16(msg[off+8:]))
		off += 10
		if off+rdlen > len(msg) {
			return errors.New("short rdata")
		}
		if typ == typeA && rdlen == 4 {
			fmt.Printf("%s\t%d\tA\t%s\n", name, ttl, net.IP(msg[off:off+4]))
		} else {
			fmt.Printf("%s\t%d\ttype%d\t(%d bytes)\n", name, ttl, typ, rdlen)
		}
		off += rdlen
	}
	return nil
}

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: rawdns <name> <server-ip>")
		os.Exit(2)
	}
	var b [2]byte
	if _, err := rand.Read(b[:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	id := binary.BigEndian.Uint16(b[:])
	query := buildQuery(id, os.Args[1])
	fmt.Print(hex.Dump(query))

	conn, err := net.Dial("udp", net.JoinHostPort(os.Args[2], "53"))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(3 * time.Second))
	if _, err := conn.Write(query); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	buf := make([]byte, 1232)
	n, err := conn.Read(buf)
	if err != nil {
		fmt.Fprintln(os.Stderr, "no answer:", err)
		os.Exit(1)
	}
	if err := parse(buf[:n], id); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
```

চালালে (আউটপুট উদাহরণ; ID প্রতিবার র‍্যান্ডম, IP আর TTL আপনার সময়ে অন্য হবে):

```text
$ go run . example.com 1.1.1.1
00000000  56 51 01 00 00 01 00 00  00 00 00 01 07 65 78 61  |VQ...........exa|
00000010  6d 70 6c 65 03 63 6f 6d  00 00 01 00 01 00 00 29  |mple.com.......)|
00000020  04 d0 00 00 00 00 00 00                           |........|
QR=1 OPCODE=0 AA=0 TC=0 RD=1 RA=1 AD=0 CD=0 RCODE=0
example.com.	140	A	104.20.23.154
example.com.	140	A	172.66.147.243
```

hexdump-টা byte ধরে পড়ি:

```text
56 51            ID = 0x5651 (random)
01 00            flags: only RD set
00 01            QDCOUNT = 1
00 00 00 00      ANCOUNT = 0, NSCOUNT = 0
00 01            ARCOUNT = 1 (our OPT record)
07 "example"     label of length 7
03 "com"         label of length 3
00               root
00 01            QTYPE  = A
00 01            QCLASS = IN
00               OPT owner name: root
00 29            TYPE = 41 (OPT)
04 d0            CLASS field reused as UDP payload size = 1232
00 00 00 00      extended RCODE, EDNS version 0, flags (DO bit would live here)
00 00            RDLENGTH = 0, no options
```

পুরো query মাত্র ৪০ byte। একই প্রোগ্রাম দিয়ে `www.github.com` চাইলে মজার একটা জিনিস দেখা যায়:

```text
www.github.com.	1504	type5	(2 bytes)
github.com.	29	A	20.205.243.166
```

type5 মানে CNAME, আর তার RDATA মাত্র ২ byte! কারণ লক্ষ্য নাম `github.com` ইতিমধ্যে question-এর ভেতরে আছে (`www.` এর পরের অংশ), তাই সার্ভার পুরো নাম না লিখে একটা compression pointer দিয়েছে। এটাই কম্প্রেশনের আসল চেহারা।

<Callout type="info">

আরও গভীরে দেখতে চাইলে `tcpdump -i any -n -X port 53` চালিয়ে পাশের টার্মিনালে `dig example.com` দিন। নিজের চোখে ঠিক এই byte-গুলো তারের ওপর দেখবেন। Wireshark একই প্যাকেট ফিল্ড ধরে ধরে ভেঙে দেখায়।

</Callout>

## UDP, ৫১২ byte, আর EDNS0

DNS মূলত UDP পোর্ট ৫৩-তে চলে। UDP-তে কানেকশন সেটআপ নেই: একটা প্যাকেট যায়, একটা প্যাকেট আসে, একটা round trip। এজন্যই DNS এত দ্রুত।

মূল RFC 1035 বলেছিল UDP-তে DNS মেসেজ ৫১২ byte-এর বেশি হবে না। ১৯৮৭ সালে সেটা যথেষ্ট ছিল। আজ একটা DNSSEC-সাইন করা রেসপন্স, অনেকগুলো TXT রেকর্ড, বা IPv6 glue-সহ NS তালিকা সহজেই ৫১২ পেরিয়ে যায়।

সমাধান **EDNS0** (RFC 6891): ক্লায়েন্ট additional অংশে একটা নকল রেকর্ড, **OPT**, জুড়ে দেয়। এর CLASS ফিল্ডে লেখা থাকে "আমি UDP-তে এত byte পর্যন্ত নিতে পারি"। TTL ফিল্ডের ৩২ বিটে থাকে extended RCODE, EDNS ভার্সন, আর **DO** (DNSSEC OK) বিট। RDATA-তে থাকে অপশন: ECS (চ্যাপ্টার ১০), cookie, padding, EDE।

```text
$ dig +dnssec example.com A @1.1.1.1

;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags: do; udp: 1232
```

এখানে `udp: 1232` সার্ভারের ঘোষণা যে সে কত বড় UDP রেসপন্স পাঠাতে রাজি, আর `flags: do` মানে query-তে DO বিট ছিল বলে RRSIG ফেরত এসেছে।

### ১২৩২ কেন

একসময় resolver-গুলো ৪০৯৬ byte বিজ্ঞাপন দিত। সমস্যা হলো ইথারনেটে একটা প্যাকেট মোটামুটি ১৫০০ byte পর্যন্ত যায়। তার চেয়ে বড় UDP রেসপন্স IP লেভেলে টুকরো (fragment) হয়, আর অনেক ফায়ারওয়াল আর NAT টুকরো প্যাকেট ফেলে দেয়। ফল: query যায়, উত্তর কখনো আসে না, ক্লায়েন্ট টাইমআউট পর্যন্ত বসে থাকে।

২০২০ সালের **DNS Flag Day** তাই ডিফল্ট ১২৩২ byte সুপারিশ করে: IPv6-এর ন্যূনতম MTU ১২৮০ থেকে ৪০ byte IPv6 header আর ৮ byte UDP header বাদ দিলে ১২৩২। এই মাপে প্রায় কোনো নেটওয়ার্কেই fragmentation হয় না। BIND, Unbound, Knot, PowerDNS সবাই এখন এটা ডিফল্ট হিসেবে ব্যবহার করে, আর বড় পাবলিক resolver-রাও (উপরের আউটপুটে Cloudflare `udp: 1232` বলছে)।

### TC বিট আর TCP ফলব্যাক

উত্তর যদি ক্লায়েন্টের বিজ্ঞাপিত সাইজে না ধরে, সার্ভার যতটুকু ধরে ততটুকু পাঠায় (বা শুধু header) আর **TC=1** সেট করে। ক্লায়েন্ট তখন একই প্রশ্ন TCP পোর্ট ৫৩-তে আবার করে। TCP-তে প্রতিটা মেসেজের আগে ২ byte দৈর্ঘ্য থাকে, তাই সর্বোচ্চ ৬৫,৫৩৫ byte পর্যন্ত যায়।

<Mermaid
title="Truncation and TCP fallback"
code={`sequenceDiagram
  participant C as "Client"
  participant S as "Server"
  C->>S: "UDP query, EDNS udp=1232"
  S-->>C: "UDP reply, TC=1 (answer does not fit)"
  C->>S: "TCP SYN to port 53"
  S-->>C: "SYN-ACK"
  C->>S: "2-byte length + same query"
  S-->>C: "2-byte length + full answer"`}
/>

এটা হাতে দেখা যায়:

```text
$ dig +bufsize=512 +ignore +dnssec DNSKEY org. @a0.org.afilias-nst.info.
;; flags: qr aa tc; QUERY: 1, ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 1

$ dig +tcp +dnssec DNSKEY org. @a0.org.afilias-nst.info.
;; flags: qr aa; QUERY: 1, ANSWER: 6, AUTHORITY: 0, ADDITIONAL: 1
;; MSG SIZE  rcvd: 1319
```

(আউটপুট উদাহরণস্বরূপ।) `+ignore` মানে "TC এলে TCP-তে যেও না, যা পেলে তাই দেখাও"। প্রথম কমান্ডে `tc` ফ্ল্যাগ আর শূন্য answer, দ্বিতীয়টায় TCP-তে পুরো ১৩১৯ byte।

<Callout type="danger">

**TCP/53 বন্ধ রাখা চলবে না।** অনেক পুরনো ফায়ারওয়াল গাইড বলত "DNS মানে UDP/53, TCP শুধু zone transfer-এর জন্য, বন্ধ করে দাও।" ভুল। RFC 7766 থেকে TCP সাপোর্ট বাধ্যতামূলক, আর DNS Flag Day ২০২০ স্পষ্ট বলে: DNS **অবশ্যই** TCP-তে কাজ করবে। TCP/53 বন্ধ থাকলে ছোট রেসপন্স ঠিকঠাক আসবে, শুধু বড়গুলো (DNSSEC, অনেক TXT, বড় NS সেট) চুপচাপ ফেইল করবে। এটা সবচেয়ে বিভ্রান্তিকর DNS বাগগুলোর একটা।

</Callout>

### Fragmentation আক্রমণ

UDP-তে স্পুফিং ঠেকানোর মূল ভরসা হলো ১৬ বিটের র‍্যান্ডম ID আর র‍্যান্ডম সোর্স পোর্ট (চ্যাপ্টার ১৩)। কিন্তু এগুলো থাকে প্রথম fragment-এ। আক্রমণকারী যদি সার্ভারকে দিয়ে বড় রেসপন্স পাঠাতে বাধ্য করে, তাহলে দ্বিতীয় fragment-এ ID বা পোর্ট নেই, শুধু IP-র fragment ID আছে, যেটা অনেক সময় অনুমান করা যায়। নকল দ্বিতীয় fragment ঢুকিয়ে সে উত্তরের শেষাংশ (যেমন additional অংশের glue IP) বদলে দিতে পারে। ১২৩২ byte-এর সীমার পেছনে এটাও একটা কারণ: fragment না হলে এই আক্রমণের জায়গাই থাকে না।

## ছোট ছোট প্রতিরক্ষা: 0x20 আর cookie

**0x20 এনকোডিং:** DNS নাম case-insensitive, কিন্তু সার্ভার question-টা হুবহু ফেরত দেয়। তাই resolver query-তে নামের অক্ষর র‍্যান্ডমভাবে বড়-ছোট করে পাঠায়, যেমন `eXaMpLe.CoM`, আর উত্তরে ঠিক একই ধরন আছে কিনা মেলায়। নামের প্রতিটা অক্ষর এক বিট বাড়তি র‍্যান্ডমনেস যোগ করে, যেটা আক্রমণকারীকে অনুমান করতে হবে। (নাম এসেছে ASCII-তে বড় আর ছোট হাতের অক্ষরের পার্থক্য 0x20 বিট থেকে।)

**DNS Cookies** (RFC 7873): ক্লায়েন্ট আর সার্ভার একে অপরকে ছোট একটা টোকেন দেয়, পরের query-তে সেটা ফেরত দিতে হয়। নকল সোর্স IP দিয়ে query পাঠানো আক্রমণকারী সেই টোকেন জানে না।

## ANY query আর RFC 8482

`dig example.com ANY` একসময় একটা নামের সব রেকর্ড এক রেসপন্সে ফেরত দিত। সমস্যা দুটো: এটা amplification আক্রমণের প্রিয় অস্ত্র (ছোট query, বিশাল উত্তর), আর resolver-এর ক্যাশে যা আছে শুধু তাই দিত, ফলে "সব রেকর্ড" কথাটা কখনোই সত্য ছিল না। RFC 8482 অনুযায়ী এখন সার্ভার ANY-র জবাবে ইচ্ছা করে ছোট উত্তর দিতে পারে: একটা মাত্র RRset, বা একটা synthetic HINFO রেকর্ড যার লেখা `"RFC8482"`। resolver-কে জিজ্ঞেস করলে আবার ক্যাশে যা আছে সেটুকুই আসে:

```text
$ dig example.com ANY @1.1.1.1 +noall +answer
example.com.		3521	IN	DS	2371 13 2 C988EC423E38...
example.com.		270	IN	A	104.20.23.154
example.com.		270	IN	A	172.66.147.243
```

(আউটপুট উদাহরণস্বরূপ, RRSIG লাইনগুলো বাদ দেওয়া।) এখানে NS, MX, TXT, AAAA কিছুই নেই, যদিও ডোমেইনটার এগুলো থাকতে পারে। শুধু এই মুহূর্তে resolver-এর ক্যাশে যা ছিল, তাই এসেছে।

শিক্ষা: কোনো ডোমেইনের সব রেকর্ড দেখতে ANY ব্যবহার করবেন না। দরকারি টাইপগুলো আলাদা করে চান (A, AAAA, MX, TXT, NS, CAA, HTTPS)।

## এনক্রিপ্টেড DNS

সাধারণ DNS খোলা কাগজের টেলিগ্রাম: পথের যেকোনো রাউটার, ISP, বা ক্যাফের Wi-Fi দেখতে পারে আপনি কোন নাম খুঁজছেন, আর চাইলে উত্তর বদলেও দিতে পারে। তিনটা প্রধান সমাধান আছে।

| প্রোটোকল | স্ট্যান্ডার্ড | পোর্ট     | কীভাবে চলে                                       | নেটওয়ার্ক থেকে দেখতে কেমন   |
| -------- | ------------- | --------- | ------------------------------------------------ | ---------------------------- |
| DoT      | RFC 7858      | TCP 853   | TLS টানেলের ভেতরে সাধারণ DNS (২ byte দৈর্ঘ্য সহ) | স্পষ্ট বোঝা যায়, ব্লক করা সহজ |
| DoH      | RFC 8484      | TCP 443   | HTTPS রিকোয়েস্টের বডিতে DNS মেসেজ                | সাধারণ HTTPS ট্রাফিকের মতো    |
| DoQ      | RFC 9250      | UDP 853   | QUIC স্ট্রিমে DNS মেসেজ                           | স্পষ্ট বোঝা যায়              |

মনে রাখুন, এগুলো সব একই ১২-byte header-ওয়ালা DNS মেসেজ বহন করে। শুধু খামটা বদলায়।

### DoH হাতে-কলমে

DoH-এ মেসেজ যায় `application/dns-message` কন্টেন্ট টাইপে। POST-এ বডিতে কাঁচা byte, আর GET-এ `dns` প্যারামিটারে base64url (padding ছাড়া) এনকোড করা byte:

```text
$ curl -s -H 'accept: application/dns-message' \
  'https://cloudflare-dns.com/dns-query?dns=AAABAAABAAAAAAAAB2V4YW1wbGUDY29tAAABAAE' \
  | xxd | head -3
00000000: 0000 8180 0001 0002 0000 0000 0765 7861  .............exa
00000010: 6d70 6c65 0363 6f6d 0000 0100 01c0 0c00  mple.com........
00000020: 0100 0100 0001 1600 04ac 4293 f3c0 0c00  ..........B.....
```

(আউটপুট উদাহরণস্বরূপ।) লক্ষ্য করুন: DoH-এ ID সাধারণত `0000` রাখা হয়, কারণ HTTP নিজেই রিকোয়েস্ট আর রেসপন্স মেলায়, আর শূন্য ID থাকলে HTTP ক্যাশ ভালো কাজ করে। উত্তরে আবার সেই পরিচিত `c0 0c` pointer।

`kdig` (Knot-এর টুল) বা নতুন `dig` (৯.১৮+) সরাসরি DoT/DoH বলতে পারে:

```text
$ kdig +tls @1.1.1.1 example.com A
$ dig +https @1.1.1.1 example.com A
$ dig +tls @9.9.9.9 example.com A
```

### ODoH: resolver-এর কাছেও লুকানো

DoH আপনার ISP থেকে প্রশ্ন লুকায়, কিন্তু resolver (যেমন Cloudflare বা Google) জানে কোন IP কী খুঁজছে। **Oblivious DoH** (RFC 9230, Experimental) মাঝখানে একটা proxy বসায়: proxy আপনার IP জানে কিন্তু প্রশ্ন পড়তে পারে না (resolver-এর key দিয়ে এনক্রিপ্ট করা), resolver প্রশ্ন পড়ে কিন্তু আপনার IP জানে না। দুই পক্ষ জোট না বাঁধলে কেউই পুরো ছবি পায় না।

### প্রাইভেসির হিসাব আর অফিসের নেটওয়ার্ক

এনক্রিপ্টেড DNS নিজে থেকে "প্রাইভেট" না, শুধু বিশ্বাসটা এক জায়গা থেকে আরেক জায়গায় সরায়। আগে আপনার প্রশ্ন দেখত ISP, এখন দেখে আপনার বেছে নেওয়া DoH প্রোভাইডার। আর TLS-এর SNI বা যে IP-তে কানেক্ট করছেন, সেখান থেকেও পথের লোক অনেক কিছু বুঝতে পারে।

কোম্পানির নেটওয়ার্কে আরেকটা দিক আছে: অনেক প্রতিষ্ঠান DNS দিয়েই ম্যালওয়্যার ডোমেইন ব্লক করে, অভ্যন্তরীণ নাম (যেমন `intranet.cordoba.example`) resolve করে, আর লগ রাখে। ব্রাউজার যদি নিজে থেকে বাইরের DoH-এ চলে যায়, এই সব পাশ কাটিয়ে যায়। তাই:

- Firefox একটা "canary domain" চেক করে: নেটওয়ার্কের resolver `use-application-dns.net`-এর জন্য NXDOMAIN দিলে Firefox নিজে থেকে DoH চালু করে না।
- Chrome ডিফল্টে "same provider" নীতিতে চলে: আপনার সিস্টেমের resolver যদি এমন কোনো প্রোভাইডার হয় যার DoH আছে, শুধু তখনই একই প্রোভাইডারের DoH-এ আপগ্রেড করে।
- এন্টারপ্রাইজ পলিসি (MDM/GPO) দিয়ে দুটো ব্রাউজারেই DoH বন্ধ করা বা নির্দিষ্ট resolver বেঁধে দেওয়া যায়।

<Callout type="warning">

ব্রাউজারগুলোর DoH আচরণ আর পলিসির নাম সময়ের সাথে বদলায়। উপরের বর্ণনা ২০২৬ সালের অক্টোবর অনুযায়ী মূল মেকানিজম; নির্দিষ্ট সেটিং বা পলিসি কী লাগাবেন, সেটা সংশ্লিষ্ট ব্রাউজারের এন্টারপ্রাইজ ডকুমেন্টেশনে মিলিয়ে নিন।

</Callout>

### ISP-র DNS ইন্টারসেপশন

কিছু নেটওয়ার্ক পোর্ট ৫৩-এর সব ট্রাফিক নিজের resolver-এ ঘুরিয়ে দেয়, আপনি `@1.1.1.1` লিখলেও। এটা ধরার উপায় হলো এমন একটা নাম চাওয়া যার উত্তর resolver নিজেই বানায়:

```text
$ dig +short TXT whoami.cloudflare CH @1.1.1.1
"198.51.100.23"

$ dig +short TXT o-o.myaddr.l.google.com @8.8.8.8
"203.0.113.40"
```

প্রথমটা Cloudflare-এর বিশেষ নাম, দ্বিতীয়টা Google-এর: দুটোই "তোমার কাছে কোন IP থেকে query এসেছে" জানায়। এগুলো যদি টাইমআউট হয়, অদ্ভুত উত্তর দেয়, বা দুই প্রোভাইডারকে জিজ্ঞেস করলে একই রহস্যময় IP আসে, ধরে নিন পথে কেউ আপনার পোর্ট ৫৩ ট্রাফিক মাঝপথে ধরছে। তখন DoT/DoH দিয়ে একই প্রশ্ন করে তুলনা করুন।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

**লক্ষণ: ছোট রেকর্ড ঠিক আসে, কিন্তু DNSSEC-ওয়ালা ডোমেইন বা বড় TXT-ওয়ালা ডোমেইন টাইমআউট হয়।**
যাচাই:

```text
$ dig +bufsize=4096 +dnssec DNSKEY example.com @ns1.example.com
;; communications error ... timed out

$ dig +bufsize=1232 +dnssec DNSKEY example.com @ns1.example.com
;; flags: qr aa tc; ...

$ dig +tcp +dnssec DNSKEY example.com @ns1.example.com
;; communications error ... connection refused
```

প্রথমটা টাইমআউট মানে বড় UDP fragment পথে হারাচ্ছে। দ্বিতীয়টায় TC আসছে, কিন্তু তৃতীয়টায় TCP বন্ধ। সমাধান: সার্ভারের EDNS বাফার ১২৩২-এ নামান আর ফায়ারওয়ালে TCP/53 খুলুন। দুটোই করতে হবে।

**লক্ষণ: পুরনো কোনো appliance বা লাইব্রেরি `FORMERR` দেয় বা উত্তরই দেয় না।**
যাচাই: `dig +noedns example.com @server` দিয়ে দেখুন। EDNS ছাড়া চললে আর EDNS দিলে ফেইল করলে সার্ভারটা EDNS ঠিকমতো বোঝে না। DNS Flag Day ২০১৯-এর পর resolver-রা আর এমন সার্ভারের জন্য বিশেষ ছাড় দেয় না। সমাধান: সফটওয়্যার আপগ্রেড, বা সামনে বসানো "DNS-aware" ফায়ারওয়াল ফিচার বন্ধ করা যেটা OPT রেকর্ড ফেলে দেয়।

**লক্ষণ: `dig ANY` দিয়ে সব রেকর্ড দেখতে চাইছেন, কিন্তু শুধু HINFO, একটা রেকর্ড, বা অর্ধেক তালিকা আসছে।**
এটা বাগ না, RFC 8482। টাইপ ধরে আলাদা আলাদা query করুন।

**লক্ষণ: অফিসে অভ্যন্তরীণ নাম কিছু ব্রাউজারে resolve হয় না, কিন্তু `dig` দিয়ে হয়।**
যাচাই: ব্রাউজারের DNS সেটিং (Firefox-এ `about:networking#dns`, Chrome-এ `chrome://net-internals/#dns`) দেখুন। ব্রাউজার DoH-এ বাইরের resolver ব্যবহার করলে অভ্যন্তরীণ zone দেখতে পায় না। সমাধান: canary domain বা এন্টারপ্রাইজ পলিসি দিয়ে DoH নিয়ন্ত্রণ করুন, অথবা অভ্যন্তরীণ resolver-কেই DoH দিন।

**লক্ষণ: `@8.8.8.8` দিলেও উত্তর মনে হয় ISP-র resolver থেকে আসছে।**
যাচাই: উপরের `whoami.cloudflare` আর `o-o.myaddr.l.google.com` টেস্ট, তারপর `dig +tls` বা `dig +https` দিয়ে একই প্রশ্ন। এনক্রিপ্টেড পথে উত্তর আলাদা হলে ইন্টারসেপশন নিশ্চিত।

**লক্ষণ: নিজের লেখা DNS কোড কিছু রেসপন্সে crash করে বা ভুল নাম পড়ে।**
প্রায় নিশ্চিতভাবে compression pointer। pointer-এর পর আসল অবস্থান থেকে ২ byte এগোতে হয় (pointer যেখানে নিয়ে যায় সেখান থেকে না), লাফের সংখ্যা সীমিত রাখতে হয়, আর প্রতিটা offset বাউন্ড চেক করতে হয়। প্রোডাকশনে নিজে parser না লিখে পরিণত লাইব্রেরি ব্যবহার করুন; এই চ্যাপ্টারের কোডটা বোঝার জন্য।

## মূল শিক্ষা

1. **প্রতিটা DNS মেসেজের শুরু ১২-byte header দিয়ে**: ID, flags (QR, AA, TC, RD, RA, AD, CD), RCODE আর চারটা গুনতি। `dig`-এর `flags:` লাইন এই বিটগুলোরই তালিকা।
2. **নাম তারে যায় দৈর্ঘ্য-সহ label হিসেবে**, আর বারবার আসা নাম `c0 0c`-এর মতো ২ byte pointer দিয়ে ছোট করা হয়।
3. **UDP-র পুরনো সীমা ৫১২ byte; EDNS0-র OPT রেকর্ড** বড় সাইজ, DO বিট, আর ECS, cookie, EDE-র মতো অপশন বহন করে।
4. **১২৩২ byte হলো নিরাপদ ডিফল্ট**, কারণ এর বেশি হলে fragmentation, আর fragment পথে হারায় বা আক্রমণের সুযোগ দেয়।
5. **TC=1 এলে TCP-তে আবার জিজ্ঞেস করতে হয়, তাই TCP/53 বাধ্যতামূলক।** বন্ধ থাকলে শুধু বড় রেসপন্স চুপচাপ ফেইল করে।
6. **ANY query দিয়ে "সব রেকর্ড" পাওয়া যায় না** (RFC 8482); টাইপ ধরে চান।
7. **DoT, DoH, DoQ একই DNS মেসেজকে এনক্রিপ্ট করা খামে পাঠায়।** এরা বিশ্বাস সরায়, মুছে ফেলে না, আর অফিস নেটওয়ার্কে DNS-ভিত্তিক নিয়ন্ত্রণ পাশ কাটাতে পারে।

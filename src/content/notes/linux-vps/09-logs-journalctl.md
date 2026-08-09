---
title: 'Logs & journalctl'
subtitle: 'আধুনিক একটা Linux বক্সে আউটপুটের প্রতিটা লাইন কোথায় যায়, কীভাবে সেটা query করবেন, কীভাবে ডিস্ক ভরে যাওয়া ঠেকাবেন, আর কখন লগ হোস্টের বাইরে পাঠাবেন।'
chapter: 9
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['logs', 'journalctl', 'journald', 'logrotate', 'syslog', 'linux']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

সিস্টেম লগ অনেকটা জাহাজের লগবুকের মতো — প্রতিটা ঘটনা ক্রম অনুযায়ী রেকর্ড হয়, তাই অনেক পরেও আপনি ঠিক ঠিক পুনর্গঠন করতে পারেন কী ঘটেছিল আর কখন।

</Callout>

## গল্পে বুঝি

ফাতিমা আল-ফিহরির একটা বিশাল বহুতল ভবন — লিফট, জেনারেটর, নিরাপত্তা, পানি সরবরাহ, প্রতিটা বিভাগ আলাদা। আগে প্রতিটা বিভাগ নিজের নিজের খাতায় ঘটনা টুকে রাখত, তাই কোনো গণ্ডগোল হলে আল-খোয়ারিজমিকে ছুটে ছুটে ডজনখানেক আলাদা খাতা ঘেঁটে দেখতে হতো — কোনটা আগে ঘটল, কোনটা পরে, বোঝাই যেত না। তাই ফাতিমা নিয়ম করে দিলেন: এখন থেকে প্রতিটা বিভাগ যা-ই ঘটুক, সব একটাই কেন্দ্রীয় সময়-ক্রম-সাজানো ইভেন্ট রেজিস্টারে লিখবে — সময়সহ, বিভাগের নামসহ, ঘটনার গুরুত্বসহ।

আর সেই রেজিস্টারের দায়িত্বে বসল একজন রেকর্ড-ক্লার্ক, ইবনে সিনা। তার কাজ হলো যেকোনো নির্দিষ্ট প্রশ্নের তাৎক্ষণিক উত্তর দেওয়া। কেউ বলল, "শুধু লিফট বিভাগের এন্ট্রিগুলো দেখাও" — সে গোটা রেজিস্টার থেকে ঠিক সেই লাইনগুলোই তুলে দেয়। কেউ বলল, "আজ দুপুর দুটোর পর যা যা হয়েছে" — সে সময় ধরে কেটে দেখায়। কেউ বলল, "নতুন এন্ট্রি আসতে থাকুক, তুমি লাইভ পড়ে শোনাও" — সে খোলা রেজিস্টারের পাশে বসে যায়। আর ব্যস্ত দিনে কেউ বলল, "সব বাদ, শুধু গুরুতর দুর্ঘটনাগুলো বলো" — সে ছোটখাটো এন্ট্রি এড়িয়ে শুধু বড় ঘটনাগুলো পড়ে দেয়।

এই গল্পটাই আসলে journald আর journalctl। ঐ একটাই কেন্দ্রীয় সময়-ক্রম-সাজানো ইভেন্ট রেজিস্টার হলো systemd-এর **journal** — সব service-এর log এক জায়গায়, কেন্দ্রীভূত। আর ক্লার্ক ইবনে সিনা হলো `journalctl`, যে নির্দিষ্ট query-র উত্তর দেয়: "শুধু লিফট বিভাগ" হলো `-u service` দিয়ে filter, "দুপুর দুটোর পর" হলো `--since` দিয়ে সময় filter, "লাইভ পড়ে শোনাও" হলো `-f` দিয়ে follow, আর "শুধু গুরুতর" হলো priority filter। বাস্তবে ঠিক এই কারণেই কোনো সার্ভার সমস্যায় পড়লে আপনি scattered খাতা ঘাঁটার বদলে এক জায়গা থেকে দ্রুত কারণ খুঁজে বের করতে পারেন — এটাই কেন্দ্রীভূত, structured logging-এর আসল লাভ।

## দুটো লগের জগৎ, একটাই সিস্টেম

আধুনিক Linux-এ লগের দুটো সমান্তরাল গন্তব্য আছে:

1. **journald** — systemd-এর বাইনারি, স্ট্রাকচার্ড, query-যোগ্য journal। systemd-এর সুপারভাইজ করা প্রতিটা সার্ভিস স্বয়ংক্রিয়ভাবে এখানে লেখে।
2. **`/var/log/`-এ প্লেইন টেক্সট ফাইল** — প্রথাগত পদ্ধতি। Apache লেখে `/var/log/apache2/access.log`-এ। Postgres লেখে `/var/log/postgresql/postgresql-15-main.log`-এ। কাস্টম অ্যাপ যেখানে বলবেন সেখানে লগ করে।

একটা সুবিন্যস্ত সার্ভার দুটোই ব্যবহার করে: যেসব সার্ভিস `stdout`/`stderr`-কে সম্মান করে সেগুলো journald-তে প্রবাহিত হয় (শূন্য কনফিগ), আর যেসব সার্ভিস লগ ফাইলে জোর দেয় সেগুলো `/var/log/<servicename>/`-তে লেখে। দুটোই একই মানসিক মডেল দিয়ে query করা যায়।

## journald — এটা আসলে কী করে

একটা systemd সার্ভিস যখন stdout বা stderr-এ লেখে, journald সেটা ধরে ফেলে, metadata যোগ করে (PID, UID, unit name, hostname, timestamp, priority), আর সেটাকে `/var/log/journal/`-এর নিচে একটা বাইনারি ফাইলে জমা রাখে। পরে সেটা query করলে _ঠিক একই ফিল্ডগুলো ফেরত_ আসে, metadata সহ।

এটা টেক্সট লগের চেয়ে সত্যিকার অর্থে ভালো কারণ:

- আপনি শুধু regex দিয়ে নয়, স্ট্রাকচার্ড ফিল্ড দিয়ে ফিল্টার করতে পারেন।
- আপনি অনেক ফরম্যাটে render করতে পারেন (plain, JSON, JSON pretty, exporter-বান্ধব)।
- systemd যা স্পর্শ করে তার সবকিছুর জন্য একটাই টুল, একটাই query language।
- এটা auto-rotate করে। journal একটা size cap-এ পৌঁছালে পুরনো লগ মুছে ফেলা হয়।

আপনি journal চিরকাল রাখতে পারেন বা শুধু volatile রাখতে পারেন। ডিফল্ট distro-ভেদে আলাদা।

## journalctl — একমাত্র কমান্ড যেটা আপনার দরকার

```bash
journalctl                            # everything, oldest first
journalctl -e                         # everything, jump to end
journalctl -f                         # follow new entries (tail -f)
journalctl -n 100                     # last 100 lines
journalctl -r                         # reverse order, newest first
journalctl --since "1 hour ago"
journalctl --since "2026-05-04 09:00" --until "2026-05-04 10:00"
journalctl --since today --until "10 minutes ago"
```

**সার্ভিস** অনুযায়ী:

```bash
journalctl -u myapp                   # one service, all time
journalctl -u myapp -f                # follow it
journalctl -u myapp -p err            # only error and worse
journalctl -u myapp -u nginx          # multiple services, merged
journalctl -u myapp --since today
```

**প্রসেস বা executable** অনুযায়ী:

```bash
journalctl _PID=1234
journalctl _COMM=nginx                # all processes named nginx
journalctl /usr/sbin/nginx            # by binary path
```

**priority** অনুযায়ী:

```bash
journalctl -p err                     # err and above
journalctl -p warning..err            # warning, err, only
```

সবচেয়ে কম থেকে সবচেয়ে গুরুতর priority মান:

```text
debug, info, notice, warning, err, crit, alert, emerg
```

**boot** অনুযায়ী:

```bash
journalctl -b                         # current boot
journalctl -b -1                      # previous boot
journalctl --list-boots               # all known boots
```

## আউটপুট ফরম্যাট

```bash
journalctl -u myapp -o short           # default
journalctl -u myapp -o short-iso       # ISO timestamps (better for grepping)
journalctl -u myapp -o json            # one JSON object per line
journalctl -u myapp -o json-pretty     # multi-line JSON
journalctl -u myapp -o cat             # message field only, no metadata
```

লগ অন্যত্র পাঠানোর জন্য `-o json` হলো চিট কোড — সেটা আপনার পছন্দের যেকোনো প্রসেসরে pipe করুন:

```bash
journalctl -u myapp -o json --since today | jq '. | select(.PRIORITY <= "3")'
```

## সার্চ করা

```bash
journalctl -u myapp -g "connection refused"
journalctl -u myapp -g "ERROR" --case-sensitive
```

`-g` (grep) বিল্ট-ইন। স্ট্রাকচার্ড ফিল্ডের জন্য, সমতার ফর্মটা দ্রুততর:

```bash
journalctl PRIORITY=3                 # all error-priority messages from any service
journalctl _SYSTEMD_UNIT=myapp.service _COMM=worker
```

## কী কী metadata পাওয়া যায়

```bash
journalctl -u myapp -o verbose -n 1
```

আউটপুট:

```text
Mon 2026-05-04 10:42:11.123456 UTC [s=abc...]
    PRIORITY=6
    SYSLOG_FACILITY=3
    _UID=998
    _GID=998
    _PID=1234
    _COMM=myapp
    _EXE=/opt/myapp/bin/myapp
    _CMDLINE=/opt/myapp/bin/myapp --config /etc/myapp/config.yaml
    _SYSTEMD_UNIT=myapp.service
    _BOOT_ID=...
    _MACHINE_ID=...
    _HOSTNAME=web-01
    _TRANSPORT=stdout
    MESSAGE=starting on :8080
```

আন্ডারস্কোর দিয়ে শুরু হওয়া এই প্রতিটা ফিল্ড ফিল্টারযোগ্য। এটাই স্ট্রাকচার্ড-লগিংয়ের লাভ।

## ডিস্ক ব্যবহার আর retention

```bash
journalctl --disk-usage
# Archived and active journals take up 264.5M in the file system.
```

`/etc/systemd/journald.conf`-এ retention কনফিগার করুন:

```ini
[Journal]
SystemMaxUse=1G
SystemKeepFree=2G
MaxRetentionSec=2week
ForwardToSyslog=no
```

এডিট করার পরে:

```bash
sudo systemctl restart systemd-journald
```

হাতে-হাতে purge করা:

```bash
sudo journalctl --vacuum-size=500M    # keep the last 500MB
sudo journalctl --vacuum-time=7d      # keep the last 7 days
sudo journalctl --vacuum-files=10     # keep the last 10 archived files
```

আপনি যদি কখনও লগ দিয়ে `/var` ভরিয়ে বক্স ক্র্যাশ করিয়ে থাকেন, তাহলে এটাই সেই অধ্যায় যেটা আপনি বাদ দিয়েছিলেন।

## প্লেইন-টেক্সট লগ — `/var/log`

কিছু সার্ভিস এখনও টেক্সট ফাইলে লেখে কারণ সেগুলো journald-এর আগের যুগের, বা তাদের লেখকরা সেটাই পছন্দ করেন। সাধারণ কিছু:

```bash
ls /var/log
# auth.log, syslog, kern.log, daemon.log, dpkg.log, apt/, nginx/, postgresql/, ...
```

যেকোনো টেক্সট ফাইলের মতোই পড়ুন:

```bash
sudo less /var/log/auth.log
sudo tail -f /var/log/nginx/access.log
sudo grep -E "FAIL|ERROR" /var/log/syslog
```

extended regex-এর জন্য `grep -E`; প্লেইন স্ট্রিংয়ের জন্য `grep -F` (দ্রুততর); ম্যাচ গোনার জন্য `grep -c`; context লাইনের জন্য `grep -A 3 -B 3`।

## logrotate — টেক্সট লগ ঘোরানো

একটা 50GB nginx access.log আপনার ডিস্ক খেয়ে ফেলবে। `logrotate` প্রতিদিন চলে (cron বা একটা systemd timer-এর মাধ্যমে) আর ফাইল rotate করে:

```text
/var/log/nginx/access.log
/var/log/nginx/access.log.1
/var/log/nginx/access.log.2.gz
/var/log/nginx/access.log.3.gz
...
```

কনফিগ থাকে `/etc/logrotate.d/`-তে। nginx-এরটা দেখতে এমন:

```text
/var/log/nginx/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 nginx adm
    sharedscripts
    prerotate
        if [ -d /etc/logrotate.d/httpd-prerotate ]; then \
            run-parts /etc/logrotate.d/httpd-prerotate; \
        fi \
    endscript
    postrotate
        invoke-rc.d nginx rotate >/dev/null 2>&1
    endscript
}
```

মানে দাঁড়ায়: প্রতিদিন rotate করো, 14 দিন রাখো, সবচেয়ে সাম্প্রতিক rotation ছাড়া বাকি সব gzip করো, শুধু non-empty লগ rotate করো, আর rotation-এর পরে nginx-কে তার file descriptor আবার খুলতে বলো (যেন সে rename হয়ে যাওয়া ফাইলে লিখতে না থাকে)।

অপেক্ষা না করেই একটা rotation টেস্ট করা:

```bash
sudo logrotate -fv /etc/logrotate.d/nginx
```

## syslog আর rsyslog

তৃতীয় একটা পথ: syslog। পুরনো daemon-গুলো syslog প্রোটোকলের মাধ্যমে একটা লোকাল syslog daemon-এ (Debian/Ubuntu-তে rsyslog) মেসেজ পাঠায়, যেটা সেগুলো `/var/log/syslog`, `/var/log/auth.log`, `/var/log/kern.log` ইত্যাদিতে লেখে।

আধুনিক সিস্টেমে journald আর rsyslog দুটোই চলে, journald rsyslog-এ ফরোয়ার্ড করে, আর rsyslog টেক্সট ফাইলে লেখে। আপনি যদি শুধু journald চান, তাহলে rsyslog disable করতে পারেন:

```bash
sudo systemctl disable --now rsyslog
sudo apt remove rsyslog
```

ছোট fleet-এর জন্য journal-only ঠিক আছে। লগ হোস্টের বাইরে পাঠাতে চাইলে rsyslog-এর forwarding রুল ব্যবহার করে রেখে দিন।

## লগ অন্যত্র পাঠানো

একটা VPS তার নিজের সব লগ ধরে রাখা ঠিক আছে, যতক্ষণ না VPS-টা মরে গিয়ে লগগুলোও নিয়ে যায়। সত্যিকারের সিস্টেমের জন্য:

- **হালকা:** `journalctl -u myapp -o json | <some forwarder>` একটা systemd timer বা sidecar হিসেবে চালানো।
- **স্ট্যান্ডার্ড:** Vector, Fluent Bit, Promtail, বা rsyslog TCP/TLS-এর মাধ্যমে একটা কেন্দ্রীয় লগ সার্ভারে ফরোয়ার্ড করা।
- **আরও বড়:** স্ট্রাকচার্ড সার্চের জন্য Loki; গুরুতর ভলিউমের জন্য ClickHouse + একটা parser।

এই অধ্যায়ের জন্য নিয়মটা হলো: লোকাল journal ঠান্ডা মাথায় query করা শিখে ফেলুন। একবার সেটা পারলে, সেটা export করা পাঁচ লাইনের কনফিগ মাত্র।

## অ্যাপ্লিকেশন লগিং — কী লিখবেন

_আপনার অ্যাপ_ যে লগ emit করে তার জন্য best practice:

- **stdout/stderr-এ লিখুন।** journald সেটা ধরে ফেলে। নিজের লগ ফাইল বানাবেন না।
- **প্রতি লাইনে একটা ইভেন্ট।** মাল্টি-লাইন stack trace ঠিক আছে; মাল্টি-লাইন "মানবিক" লগ মেসেজ নয়।
- **যেখানে সম্ভব স্ট্রাকচার্ড ফিল্ড।** এমন একটা logger ব্যবহার করুন যা production-এ JSON emit করে: `logger.info("connection accepted", peer=addr, request_id=rid)`।
- **priority ইচ্ছাকৃতভাবে লগ করুন।** `error` শুধু সেসব জিনিসের জন্য রাখুন যেগুলোর মনোযোগ দরকার। সবকিছুই যদি error হয়, তাহলে কিছুই না।
- **একটা request ID রাখুন** যা পুরো রিকোয়েস্টের মধ্য দিয়ে বয়ে যায়। আপনি নিজেই নিজেকে ধন্যবাদ দেবেন।

## যেসব query বারবার ব্যবহার করবেন

```bash
# What did myapp do in the last 5 minutes?
journalctl -u myapp --since "5 min ago"

# Errors from any service today
journalctl -p err --since today

# Authentication attempts (good and bad)
journalctl -u ssh --since today

# Out-of-memory kills
journalctl -k --grep "out of memory"

# Reboots
journalctl --list-boots

# Why did the system go down at 03:14?
journalctl --since "03:10" --until "03:20"
```

## রিক্যাপ

- journald প্রতিটা systemd সার্ভিসের stdout/stderr স্বয়ংক্রিয়ভাবে ধরে ফেলে। `journalctl` হলো সর্বজনীন লগ ভিউয়ার।
- `-u <unit>`, `-p <priority>`, `--since`, `--until` দিয়ে ফিল্টার করুন। follow করতে `-f` ব্যবহার করুন।
- `/var` ভরে যাওয়া ঠেকাতে `journald.conf`-এ retention কনফিগার করুন।
- `/var/log/`-এ প্লেইন-টেক্সট লগ হলো পুরনো পথ; logrotate দিয়ে সেগুলো rotate করুন।
- অ্যাপের উচিত ফাইলে নয়, stdout-এ JSON লগ করা। বাকিটা journald সামলাক।
- একটা VPS-এর ওপর গুরুত্বপূর্ণ কিছু মনে রাখার ভরসা করার আগে লগ হোস্টের বাইরে পাঠান।

পরের অধ্যায়: limits — সেই কার্নেল নব যা ঠিক করে আপনার সার্ভিসগুলো কতটুকু ব্যবহার করার অনুমতি পাবে।

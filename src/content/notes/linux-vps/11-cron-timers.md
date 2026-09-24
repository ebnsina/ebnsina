---
title: 'Cron & systemd Timers'
subtitle: 'কোড একটা schedule ধরে চালানোর দুটো উপায়। কোনটা বেছে নেবেন, প্রতিটা কীভাবে লিখবেন, আর scheduled job মাসের পর মাস নীরবে ফেল হওয়া থেকে কীভাবে বাঁচাবেন।'
chapter: 11
level: 'advanced'
readingTime: '10 মিনিট'
topics: ['cron', 'systemd', 'timers', 'scheduling', 'linux']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

cron job অনেকটা এমন অ্যালার্ম ক্লকের মতো যা আপনাকে জাগানোর বদলে একটা কাজ চালায় — একবার সেট করুন, আর এটা কোনো আরও মনোযোগ ছাড়াই schedule মতো চলতে থাকে।

</Callout>

## গল্পে বুঝি

পুরনো এক মাদ্রাসার তত্ত্বাবধায়ক খোয়ারিজমি। কেউ তাকে বলে দেয় না, তবু তার একটা বাঁধা রুটিন আছে — প্রতি রাত ঠিক দুইটায় সিঁড়ি ঝাঁট দেয়, প্রতি ঘণ্টায় একবার সব বিন খালি করে, আর প্রতি শুক্রবার উঠোন ধুয়ে ঝকঝকে করে রাখে। কোনো তাগাদা লাগে না, কোনো মনে করিয়ে দেওয়া লাগে না। ঘড়ির কাঁটা ধরে কাজগুলো নিজে থেকেই হয়ে যায়, বছরের পর বছর।

কিন্তু খোয়ারিজমি শুধু একটা অ্যালার্মের মতো নয়। প্রতিটা কাজ শেষ করে সে একটা খাতায় টুকে রাখে — কবে কোন কাজ করেছে, কিছু গড়বড় হয়েছে কিনা। আর একবার সে দুইদিন জ্বরে পড়ে অনুপস্থিত ছিল, রাতের ঝাঁট দেওয়াটা বাদ পড়েছিল; ফিরে এসেই সে প্রথমে বাদ পড়া সেই ঝাঁটটা সেরে ফেলল, তারপর স্বাভাবিক রুটিনে ঢুকল। কাজটা শুধু মিস হয়ে হারিয়ে যায়নি — ফিরে এসে সে সেটা পুষিয়ে দিল।

এই খোয়ারিজমিই হলো **cron** আর **systemd timer**। তার বাঁধা রুটিন — রাত দুইটা, প্রতি ঘণ্টা, প্রতি শুক্রবার — এটাই হলো cron expression বা timer-এর **schedule**, নিজে থেকে চলা recurring job। খাতায় টুকে রাখাটা systemd timer-এর journal **logging**, আর জ্বর থেকে ফিরে বাদ পড়া কাজ সেরে ফেলাটা হলো `Persistent=true`-এর **missed-run catch-up**। বাস্তবে ঠিক এভাবেই আপনি প্রতি রাত দুইটায় একটা nightly backup schedule করেন — মেশিন বন্ধ থাকলেও ফিরে এসে সেই backup-টা চলে, আর journal-এ লেখা থাকে সেটা আসলেই চলেছিল কিনা।

## দুটো scheduling সিস্টেম

Linux-এ একটা schedule ধরে কিছু চালানোর দুটো উপায় আছে:

1. **cron** — ক্লাসিক, 1975 সাল থেকে। একটা daemon যা `crontab` ফাইল পড়ে আর scheduled সময়ে task fork করে।
2. **systemd timer** — আধুনিক। `.timer` unit যা `.service` unit-কে trigger করে।

দুটোই কাজ করে। এক-লাইনের job-এর জন্য cron লিখতে সংক্ষিপ্ত আর তাৎক্ষণিক পরিচিত। systemd timer আরও কড়া, journal-এর সাথে ইন্টিগ্রেট করে, reboot-এর পরও persistence সাপোর্ট করে, আর অধ্যায় 5-এর সব service-hardening ডিরেক্টিভ পুনর্ব্যবহার করতে দেয়।

আপনি যদি ইতিমধ্যে systemd-তে থাকেন (আছেন), তাহলে গুরুত্বপূর্ণ যেকোনো কিছুর জন্য timer-কে অগ্রাধিকার দিন। ছোটখাটো ফেলে দেওয়া job আর one-liner-এর জন্য cron ব্যবহার করুন।

## cron — ক্লাসিক

প্রতিটা user-এর একটা crontab থাকে — scheduled job-এর তালিকা করা একটা ফাইল। নিজেরটা এডিট করুন:

```bash
crontab -e
```

প্রতিটা লাইন হলো `minute hour day-of-month month day-of-week command`:

```text
# m h dom mon dow   command
0 4 * * *           /opt/myapp/bin/backup.sh
*/15 * * * *        /opt/myapp/bin/healthcheck.sh
0 0 1 * *           /opt/myapp/bin/monthly-report.sh
30 9 * * 1-5        /opt/myapp/bin/workday-task.sh
```

উপর থেকে নিচে পড়ুন:

- `0 4 * * *` — প্রতিদিন ভোর 4:00-এ।
- `*/15 * * * *` — প্রতি 15 মিনিটে।
- `0 0 1 * *` — প্রতি মাসের 1 তারিখ মধ্যরাতে।
- `30 9 * * 1-5` — সোমবার থেকে শুক্রবার সকাল 9:30-এ।

সিস্টেম-ব্যাপী cron ফাইল থাকে `/etc/crontab`, `/etc/cron.daily/`, `/etc/cron.hourly/`, `/etc/cron.weekly/`, `/etc/cron.monthly/`-তে। `/etc/cron.daily/`-তে একটা স্ক্রিপ্ট রাখুন আর সেটা কোনো crontab লাইন না লিখেই প্রতিদিন চলে।

## cron environment ফাঁদ

cron job একটা _ন্যূনতম_ environment দিয়ে চলে। `$PATH` ছোট, `$HOME` সেট না-ও থাকতে পারে, আপনার shell alias লোড হয় না। আপনার টার্মিনালে যেসব স্ক্রিপ্ট কাজ করে সেগুলো প্রায়ই cron-এ ফেল করে কারণ তারা এমন environment আশা করে যা তাদের আর নেই।

সমাধান:

- binary-এর জন্য absolute path ব্যবহার করুন (`/usr/bin/curl`, `curl` নয়)।
- দরকার হলে crontab-এর উপরে `PATH` সেট করুন।
- আপনার environment ফাইল স্পষ্টভাবে source করুন।

```text
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SHELL=/bin/bash

0 4 * * * cd /opt/myapp && /opt/myapp/bin/backup.sh >>/var/log/myapp/backup.log 2>&1
```

শেষের ওই redirect-টা জরুরি: ডিফল্টভাবে, cron যেকোনো আউটপুট লোকাল mail-এর মাধ্যমে user-কে email করে, যা একটা VPS-এ সম্ভবত কনফিগার করা নেই। একটা লগ ফাইলে redirect করুন, বা পাত্তা না দিলে `/dev/null`-এ।

## cron সমস্যা

- **নীরব ব্যর্থতা।** আপনার স্ক্রিপ্ট যদি 1 দিয়ে exit করে আর আপনি stderr `/dev/null`-এ redirect করে থাকেন, আপনি কখনও জানবেন না। সবসময় লগ করুন।
- **ওভারল্যাপিং রান।** একটা job যদি তার interval-এর চেয়ে বেশি সময় নেয়, cron প্রথমটার পাশাপাশি আরেকটা কপি fire করে। একসাথে রান খারাপ হলে একটা lockfile (`flock`) ব্যবহার করুন।
- **downtime-এর পরে মিস হওয়া রান।** 4am যখন এসেছিল বক্স যদি বন্ধ থাকে, cron job-টা দেরিতে চালায় না। সেটা চলে গেছে।
- **টাইম জোন।** cron সিস্টেমের লোকাল সময় ব্যবহার করে। আপনার VPS যদি UTC-তে থাকে আর আপনার crontab বলে `0 4 * * *`, তাহলে সেটা 4am UTC। এ ব্যাপারে সচেতন থাকুন।

## Locking — ওভারল্যাপ ঠেকানো

```text
*/5 * * * * /usr/bin/flock -n /tmp/sync.lock /opt/myapp/bin/sync.sh
```

`flock -n` (non-blocking) lock নেয় বা সাথে সাথে exit করে। `sync.sh` যদি গত interval থেকে এখনও চলছে, তাহলে নতুন invocation-টা কেবল এই রাউন্ড এড়িয়ে যায়।

## systemd timer — আধুনিক উপায়

একটা timer হলো এক জোড়া unit ফাইল: একটা `.service` যা কাজটা করে আর একটা `.timer` যা বলে কখন চালাতে হবে।

সার্ভিসটা:

```ini
# /etc/systemd/system/backup.service
[Unit]
Description=Daily backup

[Service]
Type=oneshot
User=myapp
ExecStart=/opt/myapp/bin/backup.sh
StandardOutput=journal
StandardError=journal

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/backup
```

খেয়াল করুন: কোনো `[Install]` সেকশন নেই — আপনি একটা oneshot সার্ভিস সরাসরি enable করেন না; আপনি তার timer enable করেন।

timer-টা:

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Run backup daily

[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=15m
Unit=backup.service

[Install]
WantedBy=timers.target
```

timer enable করুন (সার্ভিস নয়):

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer
```

যাচাই করুন:

```bash
$ systemctl list-timers
NEXT                         LEFT          LAST                         PASSED       UNIT
Tue 2026-05-05 00:14:32 UTC  6h 12min      Mon 2026-05-04 00:08:11 UTC  17h 52min    backup.timer
```

চাহিদামতো চালান:

```bash
sudo systemctl start backup.service
```

## OnCalendar — schedule গ্রামার

systemd-এর `OnCalendar` সিনট্যাক্স cron-এর চেয়ে বেশি পঠনযোগ্য আর calendar শর্টকাট সাপোর্ট করে:

```text
OnCalendar=daily                   # 00:00 every day
OnCalendar=hourly                  # at the top of every hour
OnCalendar=weekly                  # Monday 00:00
OnCalendar=monthly                 # 1st of the month, 00:00
OnCalendar=Mon..Fri 09:30          # weekdays at 9:30
OnCalendar=*-*-* 04:00:00          # every day at 4:00 (full form)
OnCalendar=*-*-01 00:00:00         # 1st of each month at midnight
OnCalendar=Mon *-*-* 09:00:00      # every Monday at 9:00
OnCalendar=*:0/15                  # every 15 minutes
OnCalendar=*-*-* *:00,30           # every hour on the hour and half-hour
```

একটা schedule স্ট্রিং validate করুন:

```bash
$ systemd-analyze calendar 'Mon *-*-* 09:00:00'
  Original form: Mon *-*-* 09:00:00
Normalized form: Mon *-*-* 09:00:00
    Next elapse: Mon 2026-05-04 09:00:00 UTC
```

## Persistent — মিস হওয়া schedule চালায়

```ini
[Timer]
OnCalendar=daily
Persistent=true
```

timer-টা যখন fire করার কথা ছিল তখন বক্স বন্ধ থাকলে, `Persistent=true` বক্স ফিরে আসার সাথে সাথেই সেটা চালায়। cron-এর সমতুল্য কিছু নেই। backup, snapshot, certificate নবায়ন — যা কিছু শেষমেশ ঘটতেই হবে তার জন্য — `Persistent=true` হলো সঠিক সেটিং।

## RandomizedDelaySec — fleet-ব্যাপী jitter

একশোটা বক্স যদি সবাই ঠিক মধ্যরাতে একটা backup চালায়, backup target এক মিনিটের জন্য হাতুড়িপেটা খায় আর বাকি সময় বসে থাকে। jitter যোগ করুন:

```ini
RandomizedDelaySec=15m
```

প্রতিটা বক্স scheduled সময়ের পরে 0 থেকে 15 মিনিটের মধ্যে কোনো এলোমেলো সংখ্যক সেকেন্ডে fire করবে। অনায়াস load smoothing।

## OnBootSec — আপেক্ষিক timer

কখনও কখনও "এই সার্ভিস শুরু হওয়ার পর প্রতি X মিনিটে" হলো আপনি যা চান। পর্যায়ক্রমিক health check-এর জন্য:

```ini
[Timer]
OnBootSec=5min
OnUnitActiveSec=10min
```

boot-এর 5 মিনিট পরে একবার চালান। তারপর _শেষ সফল রানের_ 10 মিনিট পর পর চালান। একটা রান যদি 8 মিনিট নেয়, পরেরটা তার 10 মিনিট পরে — কখনও ওভারল্যাপ না করে।

## Timer লগ

cron-এর ওপর বড় সুবিধা: প্রতিটা timer-এর রান journal-এ থাকে।

```bash
journalctl -u backup.service                    # output of every backup
journalctl -u backup.service -f                 # follow live
journalctl -u backup.service --since today
systemctl list-timers                           # next run for everything
systemctl list-timers --all                     # including disabled
```

আপনি এক নজরে দেখতে পারেন: এটা শেষ কবে চলেছিল? ফেল করেছিল কি? কী প্রিন্ট করেছিল?

## Migration: cron থেকে timer

cron লাইন:

```text
0 4 * * * /opt/myapp/bin/backup.sh
```

সমতুল্য service + timer জোড়া:

```ini
# backup.service
[Unit]
Description=Daily backup
[Service]
Type=oneshot
ExecStart=/opt/myapp/bin/backup.sh
```

```ini
# backup.timer
[Unit]
Description=Run backup at 04:00
[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true
[Install]
WantedBy=timers.target
```

বেশি ফাইল, কিন্তু আপনি পান journald লগিং, sandbox ডিরেক্টিভ, reboot-এর পরও persistence, `systemctl status`-এর মাধ্যমে monitoring, আর সার্ভিসটা হাতে চালিয়ে টেস্ট করার সুযোগ।

## এখনও কখন cron ব্যবহার করবেন

- একবারের, অ-গুরুত্বপূর্ণ task যেখানে দুটো unit ফাইল বাড়াবাড়ি মনে হয়।
- এমন একটা সার্ভার যা systemd চালায় না (আজকাল বিরল — বেশিরভাগই চালায়)।
- ব্লগ পোস্ট থেকে হুবহু কপি করা স্ক্রিপ্ট যা আপনি শুধু কাজ করাতে চান।

যা কিছু এক মাস ধরে চলেনি জানলে আপনার মন খারাপ হবে, তার জন্য একটা timer লিখুন।

## নির্ণয়: একটা job যা "চলছে না"

```bash
# Cron
sudo grep CRON /var/log/syslog          # cron's own activity
sudo less /var/log/myapp/backup.log     # your job's output (if you redirected)

# systemd timer
systemctl list-timers --all
systemctl status backup.timer
systemctl status backup.service
journalctl -u backup.service -n 100
```

"scheduled job চলছে না"-এর সবচেয়ে সাধারণ কারণ:

- cron — আপনি schedule টাইপ করতে ভুল করেছেন বা আপনার স্ক্রিপ্টের $PATH ভুল।
- timer — আপনি timer-এর বদলে সার্ভিসটা `enable` করেছেন।

## রিক্যাপ

- তুচ্ছ recurring job-এর জন্য cron ঠিক আছে। সবসময় আউটপুট redirect করুন। নীরব ব্যর্থতা, মিস হওয়া রান, আর environment চমক থেকে সাবধান।
- গুরুত্বপূর্ণ যেকোনো কিছুর জন্য systemd timer cron-কে প্রতিস্থাপন করে। একটার বদলে দুটো ফাইল, কিন্তু আপনি পান journald, persistence, hardening, আর লাইভ status।
- `OnCalendar` cron সিনট্যাক্সের চেয়ে বেশি পঠনযোগ্য। `Persistent=true` মিস হওয়া schedule চালায়। `RandomizedDelaySec` fleet-ব্যাপী burst মসৃণ করে।
- `systemctl list-timers` হলো বক্সের প্রতিটা scheduled job-এর ড্যাশবোর্ড।

পরের অধ্যায়: production checklist। এই ট্র্যাকের সবকিছু, প্রতিটা তাজা VPS-এর জন্য একটা runbook-এ।

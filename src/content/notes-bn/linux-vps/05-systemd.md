---
title: 'systemd'
subtitle: 'একটা unit ফাইল লিখুন। ক্র্যাশে রিস্টার্ট করুন। রিবুট পার করে টিকে থাকুন। journal পড়ুন। যে সুপারভাইজার একটা আধুনিক Linux বক্সে সবকিছু চালায়।'
chapter: 5
level: 'beginner'
readingTime: '14 মিনিট'
topics: ['systemd', 'services', 'journald', 'init', 'linux']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

systemd অনেকটা একজন শিফট সুপারভাইজারের মতো যে বুটের সময় কর্মীদের শুরু করায়, তারা ক্র্যাশ করলে স্বয়ংক্রিয়ভাবে রিস্টার্ট করে, আর শিফটের সময় যা যা ঘটেছে তার একটা বিস্তারিত লগ রাখে।

</Callout>

## systemd কেন

systemd-এর আগে, প্রতিটা ডিস্ট্রিবিউশনের একটা আলাদা init সিস্টেম ছিল, প্রতিটা daemon-এর শুরু হওয়ার একটা আলাদা উপায় ছিল, আর "nginx কি চলছে?" এর তিনটা উত্তর ছিল, কোন ভার্সনের কোন init স্ক্রিপ্ট দেখছেন তার উপর নির্ভর করে। systemd এই সবকিছু একীভূত করেছে। আজ প্রতিটা মেইনস্ট্রিম Linux ডিস্ট্রিবিউশনে, একই কমান্ড একইভাবে কাজ করে:

```bash
systemctl start nginx
systemctl enable nginx
systemctl status nginx
systemctl restart nginx
journalctl -u nginx -f
```

আপনি systemd অপছন্দ করতে পারেন। আপনি হয়তো শুনেছেন ইন্টারনেটের মানুষজন একে আরও বেশি অপছন্দ করে। এর কোনোটাতেই কিছু যায় আসে না — এটাই স্ট্যান্ডার্ড, প্রতিটা টিউটোরিয়াল এটাই ধরে নেয়, আর এটা কাজ করে।

## systemd আসলে কী করে

তিনটা কাজ:

1. **সিস্টেম বুট করা।** PID 1 হিসেবে, এটা ডিস্ক, নেটওয়ার্ক, সার্ভিস dependency অনুসারে চালু করে।
2. **সার্ভিস সুপারভাইজ করা।** এটা আপনার প্রসেস শুরু করে, ক্র্যাশ করলে রিস্টার্ট করে, তাদের stdout/stderr ধরে রাখে, সঠিক ইউজার হিসেবে চালায়, shutdown-এ ভদ্রভাবে kill করে।
3. **journal ম্যানেজ করা।** সুপারভাইজড সার্ভিসের সব আউটপুট `journald`-তে যায়, একটা স্ট্রাকচার্ড বাইনারি লগ যা আপনি `journalctl` দিয়ে কোয়েরি করেন।

বাকি সবকিছু (timer, socket, mount, scope, slice) এই তিনটার একটা এক্সটেনশন।

## Unit — বিল্ডিং ব্লক

একটা **unit** হলো systemd যা ম্যানেজ করে এমন যেকোনো কিছু। প্রতিটার একটা নাম আর একটা টাইপ আছে, একটা ডট দিয়ে আলাদা করা:

| Type       | যা প্রতিনিধিত্ব করে                                                                         |
| ---------- | ------------------------------------------------------------------------------------------- |
| `.service` | একটা দীর্ঘ-চলা প্রসেস। সবচেয়ে সাধারণ ধরন।                                                  |
| `.timer`   | একটা শিডিউল করা ট্রিগার (cron রিপ্লেসমেন্ট)।                                                |
| `.socket`  | systemd-এর ম্যানেজ করা একটা listening পোর্ট, একটা কানেকশন এলে একটা সার্ভিসে হ্যান্ড অফ করে। |
| `.target`  | unit-এর একটা গ্রুপিং। `multi-user.target` হলো "সিস্টেম up আর ready।"                        |
| `.mount`   | একটা ফাইলসিস্টেম মাউন্ট পয়েন্ট।                                                            |
| `.path`    | একটা ট্রিগার যা একটা ফাইল বদলালে ফায়ার করে।                                                |
| `.timer`   | একটা শিডিউল।                                                                                |

Unit তিনটা ডিরেক্টরিতে থাকে, precedence অনুসারে:

- `/etc/systemd/system/` — **আপনি যা লেখেন।** সর্বোচ্চ প্রাধান্য। এখানে এডিট করুন।
- `/run/systemd/system/` — রানটাইম, জেনারেট করা। ছোঁবেন না।
- `/usr/lib/systemd/system/` — প্যাকেজ যা ইনস্টল করে। এডিট করবেন না; `/etc/`-এ কপি করে সেখানে এডিট করুন।

## আপনার প্রথম service unit

ধরুন আপনার কাছে `/opt/myapp/bin/myapp`-এ একটা Go বাইনারি আছে যা পোর্ট 8080-এ listen করে আর `/opt/myapp/config.yaml` থেকে এর config পড়ে। এই যে সম্পূর্ণ unit:

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My example app
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/bin/myapp --config /opt/myapp/config.yaml
Restart=on-failure
RestartSec=5

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/myapp /var/log/myapp
PrivateTmp=true

# Resource limits
LimitNOFILE=65536
MemoryMax=512M

[Install]
WantedBy=multi-user.target
```

ব্যস। এটা সেভ করুন, তারপর:

```bash
sudo systemctl daemon-reload          # systemd picks up the new file
sudo systemctl start myapp            # start it now
sudo systemctl enable myapp           # start it at every boot
sudo systemctl status myapp           # is it running?
```

বক্স রিবুট করুন। আপনার অ্যাপ স্বয়ংক্রিয়ভাবে আবার up হয়। ক্র্যাশ করান। systemd পাঁচ সেকেন্ড অপেক্ষা করে রিস্টার্ট করে।

## একটা unit ফাইল, লাইন ধরে ধরে পড়া

**[Unit]** — মেটাডেটা আর dependency।

- `Description` — `systemctl status`-এ দেখায়।
- `After=network-online.target` — নেটওয়ার্ক পুরোপুরি up না হওয়া পর্যন্ত আমাকে শুরু করো না।
- `Wants=network-online.target` — সেই target আগে থেকে না থাকলে শুরু করো, কিন্তু না পারলেও fail কোরো না।
- `Requires=` (এখানে ব্যবহৃত হয়নি) — এই dependency fail করলে, আমাকেও fail করাও। `Wants`-এর চেয়ে কড়া।

**[Service]** — প্রসেসটা কীভাবে চালাতে হবে।

- `Type=simple` — সবচেয়ে সাধারণ। প্রসেস fork করার মুহূর্তেই systemd ধরে নেয় এটা up।
  - `Type=forking` — যেসব daemon ব্যাকগ্রাউন্ডে fork করে তাদের জন্য। আধুনিক অ্যাপে বিরল।
  - `Type=notify` — প্রসেস সত্যিকারভাবে ready হলে একটা socket-এর উপর `READY=1` পাঠায় (ধীর startup-এর জন্য ভালো)।
  - `Type=oneshot` — একবার চলে আর বের হয়, setup টাস্কের জন্য ব্যবহৃত।
- `User`, `Group` — একান্ত বাধ্য না হলে কখনো root হিসেবে চালাবেন না।
- `WorkingDirectory` — exec-এর আগে এখানে `cd` করো।
- `ExecStart` — কমান্ড। অবশ্যই একটা absolute পাথ হতে হবে।
- `Restart=on-failure` — শুধু non-zero exit-এ রিস্টার্ট করো। অন্য অপশন: `always`, `on-abort`, `no`।
- `RestartSec=5` — রিস্টার্ট করার আগে এতক্ষণ অপেক্ষা করো।

**Hardening ডিরেক্টিভ** — এদের প্রতিটা আপনার সার্ভিসকে নিরাপদ করে:

- `NoNewPrivileges=true` — প্রসেস setuid বাইনারির মাধ্যমে privilege পেতে পারবে না।
- `ProtectSystem=strict` — `/usr`, `/boot`, `/efi` read-only। `=full` দিয়ে `/etc`-ও read-only।
- `ProtectHome=true` — `/home`, `/root`, `/run/user` নাগালের বাইরে।
- `ReadWritePaths=` — উপরের নিয়ম সত্ত্বেও যেসব ডিরেক্টরিতে সার্ভিসকে লিখতে _দেওয়া_ হয়।
- `PrivateTmp=true` — আপনার `/tmp` একটা sandbox, শেয়ার্ড `/tmp` নয়।

**Resource limit**:

- `LimitNOFILE=65536` — সর্বোচ্চ খোলা ফাইল ডেসক্রিপ্টর। 1024-এর ডিফল্ট যেকোনো আসল নেটওয়ার্ক সার্ভিসের জন্য অনেক কম।
- `MemoryMax=512M` — সার্ভিস 512MB ছাড়িয়ে গেলে kill করো।
- `CPUQuota=50%` — CPU ব্যবহারের একটা soft cap।

**[Install]** — `systemctl enable` কীভাবে সার্ভিসটা wire করবে।

- `WantedBy=multi-user.target` — সিস্টেম "multi-user মোডে" (ডিফল্ট) বুট করলে, আমাকে শুরু করো।

## একটা সার্ভিস পরিদর্শন করা

```bash
systemctl status myapp
```

আউটপুট:

```text
● myapp.service - My example app
     Loaded: loaded (/etc/systemd/system/myapp.service; enabled; preset: enabled)
     Active: active (running) since Mon 2026-05-04 10:42:11 UTC; 12min ago
   Main PID: 1234 (myapp)
      Tasks: 7 (limit: 4647)
     Memory: 18.4M
        CPU: 1.234s
     CGroup: /system.slice/myapp.service
             └─1234 /opt/myapp/bin/myapp --config /opt/myapp/config.yaml

May 04 10:42:11 web-01 systemd[1]: Started myapp.service - My example app.
May 04 10:42:11 web-01 myapp[1234]: starting on :8080
```

উপকারী কোয়েরি:

```bash
systemctl is-active myapp              # active / inactive / failed
systemctl is-enabled myapp             # enabled / disabled
systemctl list-units --type=service    # everything currently running
systemctl list-unit-files              # everything installed
systemctl list-dependencies myapp      # what does this need?
systemctl cat myapp                    # show the unit file
systemctl edit myapp                   # create a drop-in override
systemctl edit --full myapp            # edit the whole file
```

## লগ আর journalctl

আপনার সার্ভিস stdout বা stderr-এ যা লেখে তা journal-এ যায়:

```bash
journalctl -u myapp                    # all logs ever, oldest first
journalctl -u myapp -n 50              # last 50 lines
journalctl -u myapp -f                 # follow (like tail -f)
journalctl -u myapp --since '1 hour ago'
journalctl -u myapp --since today --until '10 minutes ago'
journalctl -u myapp -p err             # priority err and worse
journalctl -u myapp -o json-pretty     # full structured JSON
journalctl -u myapp --grep 'connection refused'
```

Priority, সর্বনিম্ন থেকে সর্বোচ্চ:

```text
debug, info, notice, warning, err, crit, alert, emerg
```

## Reload বনাম restart

```bash
systemctl restart myapp                # stop, then start. Drops connections.
systemctl reload myapp                 # ask the service to re-read its config without exiting
```

`reload` শুধু তখনই কাজ করে যদি সার্ভিস এটা সাপোর্ট করে (unit ফাইল `ExecReload=` ঘোষণা করে)। nginx `SIGHUP`-এ reload করে, postgres `SIGHUP`-এ, আপনার কাস্টম Go বাইনারি — যদি না আপনি একটা handler লিখে থাকেন।

## Drop-in override

`/usr/lib/systemd/system/`-এ unit ফাইল এডিট করা উচিত নয় — প্যাকেজ আপগ্রেড আপনার পরিবর্তন মুছে ফেলবে। **drop-in** ব্যবহার করুন:

```bash
sudo systemctl edit nginx
```

`/etc/systemd/system/nginx.service.d/override.conf`-এ একটা এডিটর খোলে। আপনি সেখানে যা রাখেন তা প্যাকেজের unit ফাইলের সঙ্গে merge হয়:

```ini
[Service]
LimitNOFILE=200000
Restart=always
```

সেভ করুন। systemd স্বয়ংক্রিয়ভাবে reload করে। আপনার override প্যাকেজ আপগ্রেড পার করে টিকে থাকে।

## Timer — আধুনিক cron

একটা `.timer` unit একটা শিডিউলে একটা `.service` unit ট্রিগার করে। দুটো ফাইল:

```ini
# /etc/systemd/system/backup.service
[Unit]
Description=Daily backup

[Service]
Type=oneshot
ExecStart=/opt/myapp/bin/backup.sh
```

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Run backup daily

[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=15min

[Install]
WantedBy=timers.target
```

_timer_ enable করুন, service নয়:

```bash
sudo systemctl enable --now backup.timer
systemctl list-timers
```

`Persistent=true` timer-টা পরের বুটে চালায় যদি এটা যখন ফায়ার করার কথা ছিল তখন বক্স বন্ধ থাকত। `RandomizedDelaySec` শুরুটা jitter করে যাতে একশোটা বক্স মাঝরাতে একসঙ্গে backup সার্ভারে হামলা না চালায়। Cron-এর কোনো সমতুল্য নেই; শুধু এটাই সুইচ করার মূল্য রাখে।

## সাধারণ ভুল

- **`daemon-reload` ভুলে যাওয়া।** একটা unit ফাইল এডিট করার পর, `systemctl`-এর কাছে এখনো পুরনো ভার্সন ক্যাশে থাকে। `sudo systemctl daemon-reload` এটা ঠিক করে।
- **ডিফল্টভাবে root হিসেবে চালানো।** `User=` ছাড়া, সার্ভিস root হিসেবে চলে। ঠিক করুন।
- **`ExecStart`-এ relative পাথ ব্যবহার করা।** systemd-এর কোনো শেল PATH নেই। সবসময় absolute পাথ ব্যবহার করুন।
- **`Restart=` সেট না করা।** ডিফল্ট `no` — আপনি না চাইলে আপনার সার্ভিস ক্র্যাশে রিস্টার্ট করবে _না_।
- **লগ এমন একটা ফাইলে যাওয়া যা unit লিখতে পারে না।** শুধু stdout-এ লিখুন। journald বাকিটা সামলায়।

## রিক্যাপ

- systemd `/etc/systemd/system/`-এ unit ফাইলের মাধ্যমে সার্ভিস ম্যানেজ করে।
- একটা service unit-এর দরকার `[Unit]`, `[Service]`, `[Install]`। পাঁচ লাইনই যথেষ্ট; তিরিশ লাইন হার্ডেন করা।
- `systemctl` হলো ক্রিয়া। `journalctl` হলো লগ ভিউয়ার।
- override-এর জন্য drop-in ব্যবহার করুন। শিডিউলের জন্য timer ব্যবহার করুন। non-root ইউজার হিসেবে চালান। resource limit সেট করুন।
- Reload নতুন unit ফাইল তুলে নেয়; restart সার্ভিসকে kill করে আবার চালু করে।

পরের চ্যাপ্টার: কে কোন পোর্টে listen করছে, আর তা খুঁজে বের করার টুল।

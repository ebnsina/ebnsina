---
title: 'Users, Groups, and Sudo'
subtitle: 'Linux কীভাবে চিনে নেয় কে কী করছে, সার্ভিসগুলো কেন নিজেদের আলাদা user হিসেবে চলে, আর sudo কীভাবে আপনাকে root না বানিয়েই root ক্ষমতা দেয়।'
chapter: 8
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['users', 'groups', 'sudo', 'permissions', 'linux']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

Users আর sudo অনেকটা অফিসের কি-কার্ডের মতো — বেশিরভাগ কর্মচারী মূল দরজায় ঢোকার অনুমতি পায়, কিন্তু শুধু কয়েকজন অনুমোদিত ব্যক্তি সার্ভার রুমে ঢুকতে পারে।

</Callout>

## গল্পে বুঝি

আল-খোয়ারিজমির একটা রিসার্চ অফিস, যেখানে প্রতিটা কর্মচারীর নিজের একটা ID badge আছে। ইবনে সিনার badge দিয়ে সে তার নিজের ডেস্ক আর কমন এরিয়ায় ঢুকতে পারে, কিন্তু সে অন্য কারও ফাইল ক্যাবিনেট খুলতে পারে না — তার badge-এ শুধু ততটুকুই অনুমতি দেওয়া আছে যতটুকু তার কাজের জন্য দরকার। আবার badge-গুলো নানা team-এ ভাগ করা: "লাইব্রেরি team"-এর badge থাকলে আর্কাইভ রুমে ঢোকা যায়, "ল্যাব team"-এর badge থাকলে যন্ত্রপাতির ঘরে। ফাতিমা আল-ফিহরি দুই team-এই আছেন, তাই তার badge দুই রুমেই কাজ করে — team-এ থাকার সুবাদে শেয়ার করা access পাওয়া।

এখন ইবনে সিনার হঠাৎ সার্ভার রুম রিবুট করার মতো একটা restricted কাজ দরকার। সে কিন্তু সারাদিন ম্যানেজারের all-powerful master key পকেটে নিয়ে ঘুরে বেড়ায় না — সেটা হলে একটা ভুলেই সে যেকোনো রুমের যেকোনো জিনিস নষ্ট করে ফেলতে পারত। বদলে সে একটা নির্দিষ্ট procedure মানে: ওই একটা কাজের জন্য master key চায়, নিজের পরিচয় দেয়, রেজিস্টারে "কে, কখন, কোন কাজে" লেখা হয়ে যায়, কাজ শেষ হলেই key ফেরত। ক্ষমতাটা এসেছিল সাময়িকভাবে, ঠিক ওই এক কাজের জন্য।

এটাই আসলে **users, groups আর sudo**। প্রত্যেকের নিজের সীমিত badge হলো নিজস্ব **user** account — যতটুকু দরকার ততটুকুই permission। team badge দিয়ে শেয়ার করা রুম-access হলো **group**, একসাথে অনেক user-কে একই permission দেওয়ার সহজ উপায়। আর এক কাজের জন্য master key চেয়ে নিয়ে, লগ হয়ে, শেষে ফেরত দেওয়াটাই **sudo** — সারাক্ষণ **root** হিসেবে না থেকে শুধু একটা নির্দিষ্ট কমান্ডের জন্য সাময়িকভাবে root **privilege** নেওয়া। বাস্তবে সার্ভারে ঠিক এভাবেই কাজ হয়: আপনি দৈনন্দিন কাজ করেন সীমিত user হিসেবে, group দিয়ে শেয়ার করা access পান, আর privileged কাজের সময় `sudo` দিয়ে সাময়িক root ক্ষমতা নেন — প্রতিটা invocation `journalctl -t sudo`-তে লগ হয়ে থাকে, ঠিক অফিসের ওই রেজিস্টারের মতো।

## একজন user আসলে একটা সংখ্যা

কার্নেলের কাছে আপনি একটা UID — একটা 32-bit ইন্টিজার। `deploy` username-টা শুধু একটা বন্ধুত্বপূর্ণ লেবেল যা `/etc/passwd`-এর মাধ্যমে UID `1000`-এ রিজলভ হয়। কার্নেল কেবল `1000`-ই দেখে। group-এর ক্ষেত্রেও একই: GID হলো আসল পরিচয়; `/etc/group` সেটাকে একটা নামে ম্যাপ করে।

নিজেরটা দেখুন:

```bash
$ id
uid=1000(deploy) gid=1000(deploy) groups=1000(deploy),27(sudo)
```

আপনি UID 1000, primary group GID 1000, এবং group 27 (sudo)-এরও সদস্য। আপনি যতক্ষণ অন্যরকম না বলছেন, আপনার তৈরি প্রতিটা ফাইলের মালিকানা যায় `1000:1000`-এর কাছে।

## /etc/passwd, /etc/shadow, /etc/group

বেশিরভাগ Linux সিস্টেমে এই তিনটা প্লেইনটেক্সট ফাইলই পুরো user ডেটাবেস।

```bash
$ getent passwd deploy
deploy:x:1000:1000:Deploy user,,,:/home/deploy:/bin/bash
```

কোলন দিয়ে আলাদা করা সাতটা ফিল্ড:

1. **Username** — `deploy`
2. **Password placeholder** — সবসময় `x`। আসল hash থাকে `/etc/shadow`-এ, যেটা কেবল root পড়তে পারে।
3. **UID** — `1000`
4. **GID** (primary group) — `1000`
5. **GECOS** (ডিসপ্লে নাম, ফোন ইত্যাদি) — `Deploy user,,,`
6. **Home directory** — `/home/deploy`
7. **Shell** — `/bin/bash`

আপনি SSH দিয়ে ঢুকলে বা `su - deploy` চালালে shell সেট হয়। `/usr/sbin/nologin` (service user-দের ক্ষেত্রে ব্যবহৃত) মানে "এই অ্যাকাউন্ট ইন্টারঅ্যাক্টিভভাবে লগ ইন করতে পারে না।"

```bash
$ getent shadow deploy
deploy:$y$j9T$abc...:19815:0:99999:7:::
```

দ্বিতীয় ফিল্ডটা password hash (`$y$` হলো yescrypt, আধুনিক ডিফল্ট)। যদি এটা `*` বা `!` হয়, তাহলে অ্যাকাউন্টের কোনো password নেই আর login disabled — service user-দের জন্য ঠিক এটাই আপনি চান।

```bash
$ getent group sudo
sudo:x:27:deploy,alice
```

Group 27 হলো `sudo`, দুইজন সদস্য নিয়ে।

## Primary group বনাম supplementary group

প্রতিটা user-এর _একটা_ primary group থাকে (`/etc/passwd`-এর ফিল্ড 4) এবং _শূন্য বা তার বেশি_ supplementary group থাকে (`/etc/group`-এর কমা দিয়ে আলাদা লিস্ট)।

আপনি একটা ফাইল তৈরি করলে সেটা ডিফল্টভাবে আপনার primary group-এর মালিকানায় যায়। `id` দুটোই দেখায়:

```bash
$ id
uid=1000(deploy) gid=1000(deploy) groups=1000(deploy),27(sudo),100(users)
```

নিজেকে একটা group-এ যোগ করুন:

```bash
sudo usermod -aG docker deploy
```

`-a` মানে _append_ (এটা ছাড়া, `usermod -G` আপনার সব group-কে _প্রতিস্থাপন_ করে — একটা ক্লাসিক পায়ে-কুড়াল-মারা ভুল)। পরিবর্তনটা কার্যকর হয় না যতক্ষণ না আপনি লগ আউট করে আবার লগ ইন করেন, কারণ supplementary group-গুলো login-এর সময় লোড হয়।

## System user বনাম login user

একটা নরম প্রথা আছে:

- **UID 0–999** — system user (root, `nginx`, `postgres`-এর মতো daemon user)।
- **UID 1000+** — সত্যিকারের মানুষ user।

`adduser` আর `useradd` এটা মেনে চলে। যখন আপনি একটা সার্ভিস প্রভিশন করেন, তাকে একটা system user দিন:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin myapp
```

এটা system রেঞ্জে একটা UID তৈরি করে (যেমন 998), কোনো home নেই, কোনো shell নেই। এই user-কেই আপনার systemd unit-এর `User=myapp` ডিরেক্টিভ বোঝায়। অ্যাকাউন্টটা কার্নেলের চোখে permission চেকের জন্য _বিদ্যমান_ থাকে, কিন্তু কেউ এটা হিসেবে লগ ইন করতে পারে না।

## বাস্তবে ফাইল মালিকানা

```bash
$ ls -l /opt/myapp/
total 12
-rwxr-xr-x 1 myapp myapp 8192 May  4 10:42 binary
drwx------ 2 myapp myapp 4096 May  4 10:42 data
-rw-r----- 1 myapp myapp  340 May  4 10:42 config.yaml
```

- binary-টা সবাই execute করতে পারে (`r-x` for other), কিন্তু শুধু `myapp` এটা write করতে পারে।
- `data/`-এর মালিক `myapp` আর _কেবল_ `myapp` এতে ঢুকতে পারে (`drwx------`)।
- `config.yaml` হলো শুধু group-এর জন্য `r--` — `myapp` user পড়ে, `myapp` group পড়ে, আর কেউ পারে না।

আপনার systemd unit যখন `User=myapp Group=myapp` ঘোষণা করে, চলমান প্রসেসটা `myapp`-এর UID/GID হয়ে যায় — আর এই permission-গুলো সব মিলে যায়। বক্সের অন্য user-রা config বা data ডিরেক্টরি পড়তে পারে না, এমনকি SSH দিয়ে ঢুকলেও না।

## root অ্যাকাউন্ট

UID 0 বিশেষ। কার্নেল ফাইল permission নির্বিশেষে UID 0-কে প্রতিটা privilege দেয়। root `/etc/shadow` পড়তে পারে, যেকোনো প্রসেস kill করতে পারে, যেকোনো ফাইলসিস্টেম mount করতে পারে, যেকোনো ডিস্কে write করতে পারে।

এই কারণেই আপনি দৈনন্দিন কাজে root হিসেবে চলেন না। একটা টাইপো (`rm -rf $UNDEFINED/`) পুরো বক্স মুছে ফেলে। root হিসেবে চলা একটা কম্প্রোমাইজড প্রসেস সবকিছুর মালিক হয়ে যায়। elevation-এর জন্য `sudo` সহ একজন non-root user হিসেবে কাজ করা আপনাকে প্রতিটা privileged অ্যাকশনের আগে ভাবার একটা _ইচ্ছাকৃত_ মুহূর্ত দেয়।

## sudo — কাগজপত্র সহ root

`sudo` একজন সাধারণ user-কে একটা কমান্ড root হিসেবে চালাতে দেয়, নিজের _নিজের_ password দিয়ে অথেনটিকেট করার পরে (root-এর নয়), আর প্রতিটা invocation লগ করে।

```bash
$ sudo systemctl restart nginx
[sudo] password for deploy:
$
```

তিনটা জিনিস ঘটে:

1. `sudo` `/etc/sudoers` চেক করে দেখে `deploy`-কে ওই কমান্ড চালানোর অনুমতি দেওয়া আছে কিনা।
2. এটা `deploy`-এর password চায় (ডিফল্টভাবে প্রতি 5 মিনিটে প্রথমবার)।
3. এটা কমান্ডটা `journalctl -t sudo`-তে লগ করে।

লগটা দেখুন:

```bash
$ sudo journalctl -t sudo -n 5
May 04 10:42:11 web-01 sudo[2345]: deploy : TTY=pts/0 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/systemctl restart nginx
```

প্রতিটা privileged অ্যাকশন কার দায়িত্ব তা চিহ্নিত করা যায়। সেটাই এই ঝামেলাটুকুর মূল্য পুষিয়ে দেয়।

## /etc/sudoers আর visudo

`/etc/sudoers` হলো sudo পলিসি ফাইল। **কখনও সরাসরি এডিট করবেন না** — `visudo` ব্যবহার করুন, যা সেভ করার আগে ফাইলটা validate করে। একটা ভাঙা sudoers ফাইল মানে কেউ sudo চালাতে পারবে না যতক্ষণ না আপনি rescue media থেকে বুট করেন।

```bash
sudo visudo
```

ডিফল্ট Debian/Ubuntu ফাইলটা এভাবে শেষ হয়:

```text
# Members of the admin group may gain root privileges
%admin ALL=(ALL) ALL

# Allow members of group sudo to execute any command
%sudo   ALL=(ALL:ALL) ALL

# See sudoers(5) for more information on "@include" directives:
@includedir /etc/sudoers.d
```

শতাংশ-চিহ্ন মানে "group"। তাই `sudo`-এর যেকোনো সদস্য যেকোনো কমান্ড যেকোনো user হিসেবে চালাতে পারে।

আরও সূক্ষ্ম পলিসির জন্য, `/etc/sudoers.d/`-তে একটা ফাইল রাখুন:

```bash
sudo visudo -f /etc/sudoers.d/deploy-restart-nginx
```

```text
deploy ALL=(root) NOPASSWD: /bin/systemctl restart nginx
deploy ALL=(root) NOPASSWD: /bin/systemctl reload nginx
```

`deploy` এখন password না দিয়েই nginx restart বা reload করতে পারে — কিন্তু, ধরুন, `/etc/passwd` এডিট করতে পারে না। ঠিক একটা privileged অ্যাকশন দরকার এমন deploy স্ক্রিপ্টের জন্য কাজের।

<Callout type="warn">

**`NOPASSWD` একটা ধারালো হাতিয়ার।**

`deploy` হিসেবে যে-ই শেল পায়, সে অথেনটিকেশন ছাড়াই ওই কমান্ডগুলো চালাতে পারে। কমান্ডটা যদি একটা path আর্গুমেন্ট নেয়, তারা সম্ভাব্যভাবে আপনার উদ্দেশ্যের চেয়ে বেশি কিছু করতে পারে — `systemctl edit` আর অনুরূপ কমান্ড পূর্ণ root ক্ষমতা সহ একটা এডিটর খুলে দেবে। _সঠিক_ কমান্ড লাইনে সীমাবদ্ধ রাখুন, কখনও প্যাটার্নে নয়।

</Callout>

## su বনাম sudo -i বনাম sudo -s

"root হওয়ার" তিনটা উপায়:

```bash
sudo -i        # become root with root's full login environment (recommended)
sudo -s        # root shell, but with your environment
su -           # switch user, become root, requires root's password
sudo su -      # equivalent to sudo -i, but uglier
```

`sudo -i` ব্যবহার করুন যখন আপনার সত্যিই পরপর অনেক কিছু root হিসেবে করার দরকার — সোর্স থেকে বিল্ড করা, অদ্ভুত permission সমস্যা ডিবাগ করা। কাজ শেষ হলে সবসময় নিজের স্বাভাবিক user-এ ফিরে যান।

## Capabilities — সূক্ষ্মভাবে ভাগ করা root ক্ষমতা

Linux root-এর সর্বশক্তিমত্তাকে প্রায় ~40টা **capability**-তে ভাগ করেছে। উদাহরণ:

- `CAP_NET_BIND_SERVICE` — 1024-এর নিচের পোর্টে bind করা।
- `CAP_SYS_TIME` — system clock বদলানো।
- `CAP_SYS_PTRACE` — অন্য প্রসেসে ডিবাগার attach করা।
- `CAP_DAC_OVERRIDE` — ফাইল permission চেক bypass করা।

আপনি একটা নির্দিষ্ট binary-কে একটা capability দিতে পারেন:

```bash
sudo setcap 'cap_net_bind_service=+ep' /opt/myapp/bin/server
```

এখন `/opt/myapp/bin/server` _root না হয়েই_ পোর্ট 80-এ listen করতে পারে। শুধু একটা privileged পোর্টে bind করার জন্য পুরো প্রসেস root হিসেবে চালানোর চেয়ে এটা অনেক নিরাপদ প্যাটার্ন। systemd-এর `AmbientCapabilities=CAP_NET_BIND_SERVICE` আপনার জন্য একই কাজ করে।

## সাধারণ ভুল

- **সার্ভিস root হিসেবে চালানো।** root-এ একটা web server bug মানে কার্নেল-লেভেল কম্প্রোমাইজ। সার্ভিসগুলো তাদের নিজস্ব user হিসেবে চালান।
- **`usermod -G docker deploy`** `-a` ছাড়া। আপনি এইমাত্র `deploy`-কে `sudo` আর বাকি সব group থেকে সরিয়ে দিলেন।
- **`/etc/sudoers` সরাসরি এডিট করা।** `visudo` ব্যবহার করুন। সবসময়।
- **`deploy` user একাধিক মানুষের মধ্যে শেয়ার করা।** প্রতিটা মানুষ নিজের আলাদা login পায়। `deploy` একটা deploy অটোমেশন user, কোনো ব্যক্তি নয়।

## রিক্যাপ

- User আর group হলো সংখ্যা; নাম হলো `/etc/passwd` আর `/etc/group`-এর লেবেল।
- সার্ভিসের জন্য system user (UID &lt; 1000)। মানুষের জন্য login user। Service user-দের `nologin` shell থাকে।
- সার্ভিসগুলো তাদের নিজস্ব user হিসেবে চালান। ফাইল ওই user-এ সীমাবদ্ধ করুন।
- root হিসেবে কাজ না করে `sudo` ব্যবহার করুন। `journalctl -t sudo`-এর মাধ্যমে audit log।
- পলিসি এডিট করতে `visudo` ব্যবহার করুন। per-task override-এর জন্য `sudoers.d` ব্যবহার করুন। privileged পোর্টের জন্য root-এর বদলে `setcap` ব্যবহার করুন।

পরের অধ্যায়: এসব সার্ভিস লগ কোথায় যায়, আর সেগুলোর মানে কীভাবে বোঝা যায়।

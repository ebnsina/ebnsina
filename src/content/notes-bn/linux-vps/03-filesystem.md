---
title: 'Linux ফাইলসিস্টেম'
subtitle: 'সবকিছু কোথায় থাকে, কেন সেখানে থাকে, আর যে পারমিশন মডেল ঠিক করে আপনার প্রসেস কী ছুঁতে পারবে।'
chapter: 3
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['filesystem', 'permissions', 'fhs', 'linux']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

Linux ফাইলসিস্টেম অনেকটা লেবেল লাগানো ড্রয়ারওয়ালা একটা ফাইলিং ক্যাবিনেটের মতো — সবকিছুর একটা নির্ধারিত জায়গা আছে, আর লেআউটটা জানাই হলো যেকোনো কিছু দ্রুত খুঁজে পাওয়ার একমাত্র উপায়।

</Callout>

## সবকিছুই একটা ফাইল

এটাই স্লোগান, আর এটা বেশিরভাগ ক্ষেত্রেই সত্যি। খোলা ফাইলগুলো ফাইল। ডিরেক্টরিগুলো ফাইল। `/dev/null` আর `/dev/sda`-এর মতো ডিভাইসগুলো ফাইল। এমনকি চলমান প্রসেসগুলোও `/proc`-এর নিচে ফাইল হিসেবে দেখা যায়। সকেট, পাইপ, মেমরির উপর কার্নেলের দৃষ্টি — সবই পাথের মাধ্যমে অ্যাড্রেসযোগ্য।

এটা গুরুত্বপূর্ণ কারণ একই টুল (`cat`, `ls`, `cp`, `>`, `<`) সব জায়গায় কাজ করে। একবার আপনি পাথ আর পারমিশন বুঝলে, "Linux-এ কীভাবে X করব" এর নব্বই শতাংশ উত্তর নিজেই বেরিয়ে আসে।

## Filesystem Hierarchy Standard (FHS)

প্রতিটা মেইনস্ট্রিম ডিস্ট্রিবিউশন জিনিসপত্র একইভাবে সাজায়। এই ম্যাপটা মুখস্থ করুন — এটা চিরকাল সুদ দেয়।

| Path                    | সেখানে যা থাকে                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `/`                     | সবকিছুর মূল। রুট ফাইলসিস্টেমের মাউন্ট পয়েন্ট।                                                    |
| `/bin`, `/sbin`         | অত্যাবশ্যক কমান্ড। `ls`, `cp`, `mount`, `ip`. (আধুনিক ডিস্ট্রোতে এগুলো `/usr/bin`-এ symlink করা।) |
| `/usr/bin`, `/usr/sbin` | প্যাকেজ ম্যানেজার দিয়ে ইনস্টল করা বেশিরভাগ কমান্ড।                                               |
| `/usr/local/bin`        | _আপনি_ প্যাকেজ ম্যানেজারের বাইরে হাতে ইনস্টল করা জিনিস।                                           |
| `/etc`                  | সব সিস্টেম কনফিগারেশন। এডিটযোগ্য টেক্সট ফাইল।                                                     |
| `/var`                  | ভ্যারিয়েবল ডেটা: লগ (`/var/log`), spool, mail, প্যাকেজ ক্যাশ।                                    |
| `/var/log`              | লগ ফাইল যেখানে যায়। `journald` এখানে নিজের বাইনারি লগ রাখে।                                      |
| `/home`                 | ইউজার হোম ডিরেক্টরি। `/home/deploy` আপনার।                                                        |
| `/root`                 | Root-এর হোম। হ্যাঁ, `/home` থেকে আলাদা।                                                           |
| `/tmp`                  | প্রতিটা রিবুটে মুছে যায়। শুধু স্ক্র্যাচের জন্য ব্যবহার করুন।                                     |
| `/opt`                  | ভেন্ডর-ইনস্টল করা সফটওয়্যার, প্রায়ই স্বয়ংসম্পূর্ণ।                                             |
| `/srv`                  | সিস্টেম যে ডেটা সার্ভ করে (web root, samba share)।                                                |
| `/dev`                  | ডিভাইস ফাইল। ডিস্ক, টার্মিনাল, র‍্যান্ডম সোর্স।                                                   |
| `/proc`                 | লাইভ কার্নেল স্টেট। প্রতিটা প্রসেসের একটা ডিরেক্টরি `/proc/<pid>` আছে।                            |
| `/sys`                  | `/proc`-এর মতোই কিন্তু হার্ডওয়্যার আর কার্নেল অবজেক্টের জন্য।                                    |
| `/run`                  | বুট থেকে রানটাইম স্টেট। সকেট, PID ফাইল। রিবুটে মুছে যায়।                                         |
| `/boot`                 | কার্নেল আর বুটলোডার। খুব সাবধানে ছুঁবেন।                                                          |
| `/mnt`, `/media`        | ম্যানুয়াল মাউন্ট পয়েন্ট আর রিমুভেবল মিডিয়া।                                                    |
| `/lib`, `/lib64`        | শেয়ার্ড লাইব্রেরি। আধুনিক সিস্টেমে `/usr/lib`-এ symlink করা।                                     |

আপনি যদি আপনার অ্যাপ্লিকেশন `/opt/myapp`-এ আর এর ডেটা `/var/lib/myapp`-এ রাখেন, এ পর্যন্ত বেঁচে থাকা প্রতিটা Linux ইঞ্জিনিয়ার জানে কোথায় খুঁজতে হবে। কনভেনশন মেনে চলুন।

## পাথ

```text
/etc/nginx/nginx.conf      # absolute — starts with /
./config.yaml              # relative — from current directory
../shared/data             # relative — up one level
~                          # your home directory (shell expands)
~/notes                    # /home/deploy/notes
```

`pwd` আপনি কোথায় আছেন তা প্রিন্ট করে। `cd -` আপনি যেখান থেকে এসেছিলেন সেখানে ফিরে যায়। আর্গুমেন্ট ছাড়া `cd` হোমে যায়।

## Inode — একটা ফাইল _আসলে_ কী

ডিস্কে একটা ফাইল দুটো জিনিস: **inode** (মেটাডেটা + ডেটা ব্লকের দিকে পয়েন্টার) আর **ডিরেক্টরি এন্ট্রি** (inode-এর দিকে ইশারা করা নাম)।

`ls -li` চালান:

```bash
$ ls -li /etc/passwd
2097284 -rw-r--r-- 1 root root 1789 Mar 15 10:42 /etc/passwd
```

প্রথম সংখ্যাটা, `2097284`, হলো inode। একাধিক নাম একই inode-এর দিকে ইশারা করতে পারে — একটা **hard link** ঠিক তাই।

```bash
ln /etc/passwd /tmp/passwd-copy
ls -li /etc/passwd /tmp/passwd-copy
# Both show the same inode number — same file, two names.
```

একটা **symbolic link** আলাদা — একটা ছোট্ট ফাইল যা শুধু একটা পাথ স্ট্রিং ধারণ করে:

```bash
ln -s /etc/passwd /tmp/passwd-symlink
ls -l /tmp/passwd-symlink
# lrwxrwxrwx ... /tmp/passwd-symlink -> /etc/passwd
```

টার্গেট সরে গেলে, symlink ভেঙে যায়। Hard link ভাঙতে পারে না — সেগুলোই ফাইল।

## পারমিশন — নয়-অক্ষরের মোড

```text
-rw-r--r--  1 deploy deploy   235 Mar 15 10:42 notes.txt
drwxr-xr-x  2 deploy deploy  4096 Mar 15 10:42 projects/
```

এটা চার অংশে পড়ুন:

1. **প্রথম অক্ষর**: ফাইল টাইপ। `-` regular, `d` directory, `l` symlink, `c` character device, `b` block device, `s` socket, `p` named pipe।
2. **Owner permissions** (অক্ষর 2–4): `rwx` — read, write, execute।
3. **Group permissions** (অক্ষর 5–7)।
4. **Other permissions** (অক্ষর 8–10) — বক্সের বাকি সবাই।

octal-এ:

| Octal | Binary | Permissions |
| ----- | ------ | ----------- |
| 7     | 111    | rwx         |
| 6     | 110    | rw-         |
| 5     | 101    | r-x         |
| 4     | 100    | r--         |
| 0     | 000    | ---         |

আপনি যেসব সাধারণ মোড ব্যবহার করবেন:

- `644` — সবার জন্য readable, শুধু owner-এর জন্য writable। (বেশিরভাগ config ফাইল।)
- `600` — শুধু owner read/write করতে পারে। (SSH private key, `.env`।)
- `755` — ডিরেক্টরি বা এক্সিকিউটেবল, world-readable, শুধু owner-writable।
- `700` — ডিরেক্টরি যেখানে শুধু owner ঢুকতে পারে। (`~/.ssh`।)

এগুলো সেট করুন:

```bash
chmod 600 ~/.ssh/id_ed25519
chmod 755 /opt/myapp/bin/run
chmod -R 750 /opt/myapp        # recursive
```

symbolic সিনট্যাক্সও কাজ করে:

```bash
chmod u+x script.sh             # add execute for owner
chmod g-w shared.txt            # remove write for group
chmod o=r public.txt            # set other to read only
```

## একটা ডিরেক্টরিতে "execute" মানে কী

একটা _ফাইলের_ জন্য, `x` মানে "আপনি এটা চালাতে পারবেন।" একটা _ডিরেক্টরির_ জন্য, `x` মানে "আপনি এতে `cd` করতে আর ভেতরের ফাইল অ্যাক্সেস করতে পারবেন।" একটা ডিরেক্টরিতে `r` মানে "আপনি এর কনটেন্ট `ls` করতে পারবেন।" এজন্যই `chmod 700 ~/.ssh` কাজ করে — আপনি ঢুকতে আর পড়তে পারেন, অন্যরা এমনকি এটা `ls`-ও করতে পারে না।

## ওনারশিপ

```bash
ls -l /etc/nginx/nginx.conf
# -rw-r--r-- 1 root root 1234 Mar 15 10:42 /etc/nginx/nginx.conf
```

দুটো নাম: **owner** (`root`) আর **group** (`root`)। এগুলো বদলান:

```bash
sudo chown deploy /opt/myapp/data.json
sudo chown deploy:deploy /opt/myapp/data.json   # owner and group
sudo chgrp www-data /var/www/site               # group only
sudo chown -R deploy:deploy /opt/myapp          # recursive
```

একটা সাধারণ প্যাটার্ন: একটা সার্ভিস একটা ডেডিকেটেড ইউজার হিসেবে চলে (যেমন, `nginx`, `postgres`), আর আপনার অ্যাপের ফাইলগুলো সেই ইউজারের মালিকানায় থাকে যাতে সার্ভিস সেগুলো পড়তে পারে কিন্তু বক্সের অন্য ইউজাররা পারে না।

## স্পেশাল বিট — setuid, setgid, sticky

```bash
ls -l /usr/bin/passwd
# -rwsr-xr-x 1 root root 68208 ... /usr/bin/passwd
```

`x`-এর জায়গায় `s` হলো **setuid** — এই বাইনারিটা চললে, যে চালিয়েছে তা নির্বিশেষে এটা _owner_ (root) হিসেবে চলে। এভাবেই একজন unprivileged ইউজার তার পাসওয়ার্ড বদলাতে পারে (যার জন্য root-এর মালিকানার `/etc/shadow`-এ লেখা দরকার)।

`setuid` বিপজ্জনক — সিস্টেমের প্রতিটা setuid বাইনারি একটা privilege escalation সারফেস। এদের অডিট করুন:

```bash
find / -perm -4000 -type f 2>/dev/null
```

একটা ডিরেক্টরিতে **sticky bit** (যেমন, `/tmp` হলো `drwxrwxrwt`) মানে "যে কেউ এখানে লিখতে পারে, কিন্তু আপনি শুধু নিজের মালিকানার ফাইল ডিলিট করতে পারবেন।" এজন্যই `/tmp` একটা শেয়ার্ড স্ক্র্যাচ স্পেস হিসেবে কাজ করে।

## মাউন্ট পয়েন্ট আর ডিস্ক

একটা ফাইলসিস্টেম একটা ট্রি, কিন্তু ট্রিটা একাধিক ডিস্কজুড়ে বিস্তৃত হতে পারে। `mount` জোড়ার পয়েন্টগুলো দেখায়:

```bash
$ mount | column -t
/dev/sda1  on  /         type ext4   (rw,relatime,errors=remount-ro)
tmpfs      on  /run      type tmpfs  (rw,nosuid,nodev,size=399768k)
/dev/sda2  on  /var      type ext4   (rw,relatime)
```

অথবা আরও পাঠযোগ্যভাবে:

```bash
df -h
# Filesystem      Size  Used Avail Use% Mounted on
# /dev/sda1        38G  4.2G   32G  12% /
# tmpfs           390M  1.2M  389M   1% /run
```

যখন `df` বলে আপনার স্পেস শেষ, তখন আপনার স্পেস শেষ একটা _নির্দিষ্ট ফাইলসিস্টেমে_। `/` ভর্তি থাকার মানে এই নয় যে `/var`-ও ভর্তি।

## হিডেন ফাইল

`.` দিয়ে শুরু হওয়া যেকোনো কিছু `ls` লুকিয়ে রাখে। `ls -a` সেগুলো দেখায়।

```bash
ls -la ~
# .bashrc, .ssh/, .config/ — all hidden by convention.
```

শুধু কনভেনশন। কার্নেল পরোয়া করে না। শেলের `ls` আর glob সেগুলো উপেক্ষা করে যাতে প্রতিটা ডিরেক্টরি লিস্টিংয়ে আপনি আপনার dotfile না দেখেন।

## প্র্যাকটিক্যাল: একটা config ফাইল দ্রুত খুঁজে বের করা

আপনি জানেন nginx ইনস্টল করা কিন্তু মনে করতে পারছেন না এর config কোথায় থাকে:

```bash
which nginx                    # /usr/sbin/nginx
nginx -t                       # tests config and prints its path
dpkg -L nginx | grep '\.conf'  # all conf files the package shipped
ls -la /etc/nginx/             # the standard place
```

তিন-চারটা কমান্ড আর আপনার কাছে একটা সম্পূর্ণ ম্যাপ আছে।

## রিক্যাপ

- FHS প্রতিটা ডিস্ট্রোতে একই। একবার শিখুন।
- ফাইল হলো inode; নাম হলো পয়েন্টার। Hard link একটা inode শেয়ার করে, symlink একটা পাথের দিকে ইশারা করে।
- পারমিশন হলো owner/group/other × read/write/execute। `rwx`-এর চেয়ে octal পড়া দ্রুত।
- ওনারশিপ একটা owner আর একটা group জোড়া বাঁধে। সার্ভিস ডেডিকেটেড ইউজার হিসেবে চলে।
- `setuid` বিরল আর ঝুঁকিপূর্ণ। একটা ডিরেক্টরিতে sticky bit মানে "শুধু আপনার ফাইল।"
- `df` আর `mount` দেখায় কোথায় কী মাউন্ট করা; স্পেস-শেষ হওয়াটা per-filesystem।

পরের চ্যাপ্টার: Linux-এ একটা "প্রসেস" আসলে কী, আর কেন আপনার অ্যাপ বিশেষ কিছু নয়।

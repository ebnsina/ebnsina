---
title: 'Production Checklist'
subtitle: 'এই ট্র্যাকের প্রতিটা ধাপ, একটা runbook-এ। একটা তাজা VPS প্রভিশন করুন আর দিন শেষে একটা hardened, monitored, deploy-এর জন্য প্রস্তুত বক্স নিয়ে বসুন।'
chapter: 12
level: 'advanced'
readingTime: '15 মিনিট'
topics: ['checklist', 'hardening', 'production', 'linux', 'vps']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা আল-ফিহরি নতুন একটা দোকান খুলছেন। কিন্তু চাবি ঘুরিয়ে দরজা খুলে দিয়েই ভেতরে কাস্টমার ঢুকতে দেওয়াটা তার স্বভাব না। তার হাতে একটা pre-opening checklist — একটা কাগজে লম্বা তালিকা, প্রতিটা লাইনের পাশে একটা করে টিক দেওয়ার ঘর। যতক্ষণ না প্রতিটা ঘরে টিক পড়ছে, দোকানের সদর দরজা জনসাধারণের জন্য খুলবে না। এক এক করে সে ধরে যায়।

প্রথম লাইন — সদর দরজায় শক্ত তালাটা লাগানো হয়েছে তো? লাগানো, টিক। গেটে দারোয়ান বসেছে, যে অপরিচিত সবাইকে ফিরিয়ে দেবে আর শুধু প্রত্যাশিত লোককে ঢুকতে দেবে? বসেছে, টিক। ফায়ার আর পেস্ট-কন্ট্রোল সার্ভিস কি নিয়মিত অটো-ভিজিটে সেট করা? করা, টিক। খাতাপত্রের নকল কপি বাইরের একটা নিরাপদ জায়গায় রাখা আছে? আছে, টিক। CCTV আর ঘটনার রেজিস্টার চালু, প্রতিটা নড়াচড়া লেখা হচ্ছে? চালু, টিক। কর্মচারীরা মাস্টার-চাবি নয়, নিজের নিজের সীমিত ব্যাজে কাজ করছে? করছে, টিক। প্রতি রাঁধুনির জন্য মাপা রেশন বরাদ্দ, যেন একজন সব খেয়ে না ফেলে? বরাদ্দ, টিক। সবগুলো ঘরে টিক পড়ার পরেই — একটাও বাকি না রেখে — ফাতিমা দরজা খুলে দেন।

এই checklist-ই আসলে একটা **production checklist**। শক্ত তালা হলো **SSH hardening** (non-default পোর্ট, key-only auth), দারোয়ান হলো **firewall** (default-deny, শুধু জানা পোর্ট খোলা), অটো ফায়ার/পেস্ট-সার্ভিস হলো **automatic security updates** (unattended-upgrades), খাতার বাইরের কপি হলো **backup** (কনফিগ git repo-তে সেভ), CCTV আর রেজিস্টার হলো **monitoring/logs** (journald retention, audit, fail2ban), সীমিত ব্যাজ হলো **non-root user** (root SSH disabled, sudo দিয়ে কাজ), আর মাপা রেশন হলো resource **limits** (swap, sysctl, MaxAuthTries)। বাস্তবেও নিয়মটা একই — একটা তাজা VPS-এ প্রতিটা box টিক না পড়া পর্যন্ত সেটাকে production-এ বিশ্বাস করবেন না; একটা আইটেম "না" থাকলে ফিরে গিয়ে সেটা শেষ করুন, তারপর দরজা খুলুন।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা production checklist অনেকটা pre-flight checklist-এর মতো — পাইলটরা ভুলে যান বলে নয়, বরং ভুলে যাওয়ার পরিণতি এত বেশি যে শুধু স্মৃতির ওপর ভরসা করা যায় না।

</Callout>

## এই অধ্যায় কীভাবে ব্যবহার করবেন

এটা একটা runbook। যতবার একটা নতুন VPS প্রভিশন করবেন, উপর থেকে নিচে এটা ধরে যান। লক্ষ্য হলো পুনরুৎপাদনযোগ্যতা — আপনি হাতে সেটআপ করা একটা বক্স যেন পরের মাসে সেটআপ করা বক্সের সাথে হুবহু মিলে যায়।

শেষমেশ আপনি এটা Ansible (অধ্যায় 23) বা একটা shell স্ক্রিপ্ট দিয়ে অটোমেট করবেন। আপনার প্রথম দশটা বক্সের জন্য এটা হাতে করুন যেন প্রতিটা লাইন বোঝেন।

প্রথমবারের জন্য ~90 মিনিট, দশমবারের জন্য ~20 মিনিটের পরিকল্পনা রাখুন।

## 0. শুরু করার আগে

আপনার দরকার:

- একটা VPS প্রোভাইডার অ্যাকাউন্ট।
- আপনার ল্যাপটপে একটা SSH key (`~/.ssh/id_ed25519` আর `id_ed25519.pub`)।
- আরেকটা উইন্ডোতে আপনার ল্যাপটপের `~/.ssh/config` খোলা।

ঠিক করুন:

- একটা hostname (যেমন, `web-01`, `db-01`, `app-eu-01`)।
- কোন user অ্যাকাউন্ট তৈরি করবেন (বাকিটা `deploy` ধরে নিয়ে চলবে)।
- কোন non-standard SSH পোর্ট (যেমন, `2222`)।

## 1. Provision

1. আপনার প্রোভাইডারের UI-তে VM তৈরি করুন। Debian 12 বা Ubuntu 24.04 LTS বেছে নিন। ≥1GB RAM সহ সবচেয়ে ছোট প্ল্যান। প্রভিশনিংয়ের সময় আপনার SSH public key যোগ করুন।
2. public IPv4 ঠিকানাটা টুকে রাখুন।
3. আপনার inventory-তে বক্সটা রেকর্ড করুন (একটা টেক্সট ফাইলই যথেষ্ট, বা 1Password, বা যা-ই হোক)।

## 2. প্রথম কানেকশন — root হিসেবে

```bash
ssh root@<public-ip>
```

যাচাই করুন আপনি যে বক্সটা ভাবছেন সেটাই পেয়েছেন:

```bash
hostname
cat /etc/os-release
ip addr show
free -h
df -h
```

## 3. সিস্টেম আপডেট

```bash
apt update
apt upgrade -y
apt autoremove -y
```

নতুন kernel ইনস্টল হলে reboot করুন:

```bash
[ -f /var/run/reboot-required ] && reboot
```

reboot-এর পরে আবার লগ ইন করে এগিয়ে যান।

## 4. hostname সেট করা

```bash
hostnamectl set-hostname web-01
echo "127.0.1.1 web-01" >> /etc/hosts
```

যাচাই করুন:

```bash
hostname
hostnamectl
```

## 5. টাইম জোন সেট করা

সার্ভারের জন্য UTC-ই সঠিক ডিফল্ট — প্রতিটা লগ timestamp অঞ্চল নির্বিশেষে তুলনীয়:

```bash
timedatectl set-timezone UTC
timedatectl
```

লোকাল সময় চাইলে `UTC`-এর বদলে `Europe/Berlin`, `America/New_York` ইত্যাদি বসান।

## 6. একটা non-root user তৈরি করা

```bash
adduser deploy
usermod -aG sudo deploy
```

একটা শক্তিশালী password সেট করুন (আপনি কদাচিৎ ব্যবহার করবেন, কিন্তু SSH ফেল করার বিরল ক্ষেত্রে একটা লাগবে)। এটা আপনার password manager-এ সেভ করুন।

নতুন user-এ আপনার SSH key কপি করুন:

```bash
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

## 7. deploy কাজ করছে যাচাই করা

**একদম নতুন একটা টার্মিনাল খুলুন** (root সেশন বন্ধ করবেন না) আর চালান:

```bash
ssh deploy@<public-ip>
sudo whoami
# Should print: root
exit
```

এটা কাজ করলে, root সেশনে ফিরে যান।

## 8. SSH harden করা

```bash
nano /etc/ssh/sshd_config
```

এই লাইনগুলো সেট করুন (দরকার হলে uncomment করুন):

```text
Port 2222
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding no
PrintMotd no
ClientAliveInterval 300
ClientAliveCountMax 2
MaxAuthTries 3
LoginGraceTime 30
AllowUsers deploy
```

Reload করুন:

```bash
systemctl reload ssh
```

**একটা নতুন টার্মিনাল থেকে**, যাচাই করুন:

```bash
ssh -p 2222 deploy@<public-ip>
```

এটা সফল হলে, root সেশন আর দরকার নেই — তবে firewall শেষ না হওয়া পর্যন্ত এটা খোলা রাখুন।

## 9. Firewall কনফিগার করা

```bash
apt install -y nftables
```

`/etc/nftables.conf` লিখুন:

```nft
#!/usr/sbin/nft -f

flush ruleset

table inet filter {
    chain input {
        type filter hook input priority filter; policy drop;

        iif "lo" accept
        ct state { established, related } accept
        ct state invalid drop

        ip protocol icmp accept
        ip6 nexthdr icmpv6 accept

        tcp dport 2222 accept
        tcp dport { 80, 443 } accept
    }

    chain forward {
        type filter hook forward priority filter; policy drop;
    }

    chain output {
        type filter hook output priority filter; policy accept;
    }
}
```

Apply করুন:

```bash
nft -f /etc/nftables.conf
nft list ruleset
systemctl enable --now nftables
```

**একটা নতুন টার্মিনাল থেকে**, যাচাই করুন SSH এখনও কাজ করছে:

```bash
ssh -p 2222 deploy@<public-ip>
```

হ্যাঁ হলে, আপনি root সেশন বন্ধ করতে পারেন।

## 10. fail2ban ইনস্টল করা

```bash
sudo apt install -y fail2ban
```

```bash
sudo nano /etc/fail2ban/jail.local
```

```text
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = 2222
```

```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
```

## 11. Unattended security upgrade

```bash
sudo apt install -y unattended-upgrades apt-listchanges
sudo dpkg-reconfigure -plow unattended-upgrades
```

এটা একটা daily timer ইনস্টল করে যা security update apply করে। যাচাই করুন:

```bash
sudo systemctl status unattended-upgrades.service
sudo cat /etc/apt/apt.conf.d/20auto-upgrades
```

এতে থাকা উচিত:

```text
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
```

## 12. Time sync

```bash
sudo apt install -y chrony
sudo systemctl enable --now chrony
chronyc tracking
chronyc sources
```

Time skew TLS, replication, distributed lock, আর আপনার মানসিক শান্তি ভেঙে দেয়। sync নিশ্চিত করুন।

## 13. Journal retention

`/etc/systemd/journald.conf` এডিট করুন:

```ini
[Journal]
SystemMaxUse=1G
SystemKeepFree=2G
MaxRetentionSec=2week
ForwardToSyslog=no
```

```bash
sudo systemctl restart systemd-journald
journalctl --disk-usage
```

## 14. Swap (শুধু ছোট VPS)

একটা 1 বা 2GB বক্স memory spike-এর সেফটি নেট হিসেবে একটা ছোট swap ফাইল থেকে উপকৃত হয়:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Tune swappiness — only swap under real pressure
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl --system
```

≥8GB RAM সহ বক্সের জন্য swap সাধারণত অপ্রয়োজনীয় আর memory leak লুকিয়ে ফেলতে পারে। এই ধাপ এড়িয়ে যান।

## 15. Kernel networking টিউন করা

যুক্তিসঙ্গত production ডিফল্ট সহ একটা sysctl ফাইল রাখুন:

```bash
sudo nano /etc/sysctl.d/99-server.conf
```

```text
# Increase max connections
net.core.somaxconn = 4096
net.core.netdev_max_backlog = 5000

# Reuse TIME-WAIT sockets faster
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15

# Larger ephemeral port range
net.ipv4.ip_local_port_range = 10000 65535

# More file watches (useful for build tools)
fs.inotify.max_user_watches = 524288

# Trust no source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
```

```bash
sudo sysctl --system
```

## 16. কাজের টুল

কিছু ইউটিলিটি যা আপনি নিয়মিত হাতে নেবেন:

```bash
sudo apt install -y \
  htop \
  iotop \
  iftop \
  ncdu \
  tree \
  jq \
  ripgrep \
  curl \
  wget \
  git \
  tmux \
  rsync \
  net-tools \
  dnsutils \
  tcpdump \
  strace \
  lsof
```

## 17. লোকাল SSH alias কনফিগার করা

আবার **আপনার ল্যাপটপে**, `~/.ssh/config` এডিট করুন:

```text
Host web-01
    HostName <public-ip>
    Port 2222
    User deploy
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

Test করুন:

```bash
ssh web-01
```

আপনার ঢুকে যাওয়ার কথা।

## 18. Audit — কী কী expose হয়ে আছে?

চলে যাওয়ার আগে, বক্সের নেটওয়ার্ক surface audit করুন:

```bash
sudo ss -tlnp                                        # listening TCP
sudo ss -ulnp                                        # listening UDP
sudo nft list ruleset                                # firewall
sudo systemctl list-units --state=running --type=service  # what is running
sudo journalctl -p err -b                            # any errors since boot
```

`ss -tlnp`-এর প্রতিটা লাইন পড়ুন। কোনো listening সার্ভিস চিনতে না পারলে, চলে যাওয়ার আগে জেনে নিন।

একটা পরিষ্কার, সদ্য-hardened বক্স এসবে listen করবে:

- `:22` বা `:2222` (sshd)
- আর কিছু নয়, যতক্ষণ না আপনি সার্ভিস ইনস্টল করা শুরু করেন

## 19. unit ফাইল আর কনফিগ backup করা

এই পর্যায়েও, আপনার হাতে গোনা কয়েকটা ফাইল আছে যা লিখতে হাতে খাটতে হয়েছে:

- `/etc/ssh/sshd_config`
- `/etc/nftables.conf`
- `/etc/systemd/journald.conf`
- `/etc/fail2ban/jail.local`
- `/etc/sysctl.d/99-server.conf`

এগুলো একটা git repository-তে কপি করুন, এমনকি যদি সেটা আপাতত বক্সেই private রাখেন। পরের বার প্রভিশন করার সময়, এই অধ্যায় আবার না পড়ে সেগুলো শুধু বসিয়ে দিতে পারবেন।

```bash
mkdir -p ~/server-config
cp /etc/ssh/sshd_config ~/server-config/
cp /etc/nftables.conf ~/server-config/
cp /etc/systemd/journald.conf ~/server-config/
cp /etc/fail2ban/jail.local ~/server-config/
cp /etc/sysctl.d/99-server.conf ~/server-config/
cd ~/server-config && git init && git add . && git commit -m "initial setup of $(hostname)"
```

শেষমেশ এটা একটা Ansible playbook হয়ে যায় (অধ্যায় 23)। আপাতত, একটা git repo-ই যথেষ্ট।

## 20. সম্পন্ন অবস্থা

আপনার এই সবগুলোতে সততার সাথে **হ্যাঁ** উত্তর দিতে পারা উচিত:

- [ ] OS পুরোপুরি patched, kernel current, reboot হয়ে গেছে।
- [ ] Hostname আর টাইম জোন সেট।
- [ ] sudo সহ non-root user, root SSH disabled।
- [ ] non-default পোর্টে SSH, key-only auth, MaxAuthTries 3।
- [ ] input-এ firewall default-deny, শুধু SSH আর HTTP/HTTPS খোলা।
- [ ] fail2ban চলছে, SSH দেখছে।
- [ ] Unattended security upgrade enabled।
- [ ] chrony-এর মাধ্যমে time sync হচ্ছে।
- [ ] Journald retention সীমাবদ্ধ।
- [ ] ছোট বক্সে Swap কনফিগার করা (বা বড় বক্সে বাদ দেওয়া)।
- [ ] sysctl দিয়ে kernel networking টিউন করা।
- [ ] সাধারণ ইউটিলিটি ইনস্টল করা।
- [ ] লোকাল SSH alias কাজ করছে।
- [ ] Audit pass — শুধু প্রত্যাশিত সার্ভিস listen করছে।
- [ ] কনফিগ একটা git repo-তে backup করা।

কোনো আইটেম "না" হলে, ফিরে গিয়ে সেটা শেষ করুন। এটাই সেই বক্স যেখানে আপনি সত্যিকারের সফটওয়্যার deploy করবেন। একবার ঠিক করুন, প্রতিবার।

## এতে আপনি কী পান

এভাবে কনফিগার করা একটা বক্স সাধারণ আক্রমণের বিরুদ্ধে hardened (brute force, drive-by scanner, নৈমিত্তিক lateral movement), reboot ঠিকঠাক টিকে যায়, লগ ভলিউম সীমাবদ্ধ, তার ঘড়ি sync করে, আর এরপর যা-ই এনে দেন তা হোস্ট করতে প্রস্তুত — Postgres, Redis, আপনার Go binary, nginx, সব।

এই সাইটের বাকি প্রতিটা অধ্যায় ধরে নেয় আপনি এমন একটা বক্স থেকে শুরু করছেন। যান, পরেরটা বানান।

## রিক্যাপ

- Provision, update, hostname, timezone, user, SSH lockdown, firewall, fail2ban — এই ক্রমে।
- এগোনোর আগে প্রতিটা ধাপ একটা তাজা টার্মিনাল থেকে যাচাই করুন।
- swappiness, sysctl, journal retention যুক্তিসঙ্গত ডিফল্টে টিউন করুন।
- চলে যাওয়ার আগে listening পোর্ট audit করুন।
- আপনার কনফিগ version control-এ সেভ করুন।

এটাই Linux ও VPS বেসিকস ট্র্যাকের শেষ। আপনি এখন এই সাইটের যেকোনো অন্য টপিকের অধ্যায় 1-এর জন্য প্রস্তুত।

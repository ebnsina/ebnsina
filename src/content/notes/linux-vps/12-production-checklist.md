---
title: "Production Checklist"
subtitle: "Every step from this track, in one runbook. Provision a fresh VPS and end the day with a hardened, monitored, ready-to-deploy box."
chapter: 12
level: "advanced"
readingTime: "15 min"
topics: ["checklist", "hardening", "production", "linux", "vps"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A production checklist is like a pre-flight checklist — not because pilots forget, but because the consequences of forgetting are too high to rely on memory alone.

</Callout>

## How to use this chapter

This is a runbook. Every time you provision a new VPS, run through it top to bottom. The goal is reproducibility — a box you set up by hand should look identical to a box you set up next month.

Eventually you will automate this with Ansible (chapter 23) or a shell script. For your first ten boxes, do it by hand so you understand every line.

Plan for ~90 minutes the first time, ~20 the tenth.

## 0. Before you start

You need:

- A VPS provider account.
- An SSH key on your laptop (`~/.ssh/id_ed25519` and `id_ed25519.pub`).
- Your laptop's `~/.ssh/config` open in another window.

Decide:

- A hostname (e.g., `web-01`, `db-01`, `app-eu-01`).
- Which user account to create (the rest of this assumes `deploy`).
- Which non-standard SSH port (e.g., `2222`).

## 1. Provision

1. Create the VM in your provider's UI. Pick Debian 12 or Ubuntu 24.04 LTS. Smallest plan with ≥1GB RAM. Add your SSH public key during provisioning.
2. Note the public IPv4 address.
3. Record the box in your inventory (a text file is fine, or 1Password, or whatever).

## 2. First connection — as root

```bash
ssh root@<public-ip>
```

Verify you got the box you think you got:

```bash
hostname
cat /etc/os-release
ip addr show
free -h
df -h
```

## 3. System update

```bash
apt update
apt upgrade -y
apt autoremove -y
```

Reboot if a new kernel was installed:

```bash
[ -f /var/run/reboot-required ] && reboot
```

After reboot, log back in and continue.

## 4. Set the hostname

```bash
hostnamectl set-hostname web-01
echo "127.0.1.1 web-01" >> /etc/hosts
```

Verify:

```bash
hostname
hostnamectl
```

## 5. Set the time zone

UTC is the right default for servers — every log timestamp is comparable across regions:

```bash
timedatectl set-timezone UTC
timedatectl
```

If you want local time, replace `UTC` with `Europe/Berlin`, `America/New_York`, etc.

## 6. Create a non-root user

```bash
adduser deploy
usermod -aG sudo deploy
```

Set a strong password (you will rarely use it, but you need one for the rare case where SSH fails). Save it in your password manager.

Copy your SSH key to the new user:

```bash
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

## 7. Verify deploy works

**Open a brand new terminal** (do not close the root session) and run:

```bash
ssh deploy@<public-ip>
sudo whoami
# Should print: root
exit
```

If that worked, return to the root session.

## 8. Harden SSH

```bash
nano /etc/ssh/sshd_config
```

Set these lines (uncomment if needed):

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

Reload:

```bash
systemctl reload ssh
```

**From a new terminal**, verify:

```bash
ssh -p 2222 deploy@<public-ip>
```

If that succeeds, the root session is no longer needed — but keep it open until firewall is done.

## 9. Configure firewall

```bash
apt install -y nftables
```

Write `/etc/nftables.conf`:

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

Apply:

```bash
nft -f /etc/nftables.conf
nft list ruleset
systemctl enable --now nftables
```

**From a new terminal**, verify SSH still works:

```bash
ssh -p 2222 deploy@<public-ip>
```

If yes, you can close the root session.

## 10. Install fail2ban

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

## 11. Unattended security upgrades

```bash
sudo apt install -y unattended-upgrades apt-listchanges
sudo dpkg-reconfigure -plow unattended-upgrades
```

That installs a daily timer that applies security updates. Verify:

```bash
sudo systemctl status unattended-upgrades.service
sudo cat /etc/apt/apt.conf.d/20auto-upgrades
```

It should contain:

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

Time skew breaks TLS, replication, distributed locks, and your sanity. Confirm sync.

## 13. Journal retention

Edit `/etc/systemd/journald.conf`:

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

## 14. Swap (small VPS only)

A 1 or 2GB box benefits from a small swap file as a safety net for memory spikes:

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

For boxes with ≥8GB RAM, swap is usually unnecessary and can hide memory leaks. Skip this step.

## 15. Tune kernel networking

Drop a sysctl file with sensible production defaults:

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

## 16. Useful tools

A small set of utilities you will reach for constantly:

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

## 17. Configure local SSH alias

Back on **your laptop**, edit `~/.ssh/config`:

```text
Host web-01
    HostName <public-ip>
    Port 2222
    User deploy
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

Test:

```bash
ssh web-01
```

You should be in.

## 18. Audit — what is exposed?

Before walking away, audit the box's network surface:

```bash
sudo ss -tlnp                                        # listening TCP
sudo ss -ulnp                                        # listening UDP
sudo nft list ruleset                                # firewall
sudo systemctl list-units --state=running --type=service  # what is running
sudo journalctl -p err -b                            # any errors since boot
```

Read every line of `ss -tlnp`. If you do not recognize a listening service, find out before you walk away.

A clean, freshly-hardened box should listen on:

- `:22` or `:2222` (sshd)
- nothing else, until you start installing services

## 19. Backup the unit files and configs

Even at this stage, you have a small handful of files that took manual work to write:

- `/etc/ssh/sshd_config`
- `/etc/nftables.conf`
- `/etc/systemd/journald.conf`
- `/etc/fail2ban/jail.local`
- `/etc/sysctl.d/99-server.conf`

Copy them to a git repository, even one you keep private on the box itself for now. The next time you provision, you can drop them in instead of reading this chapter again.

```bash
mkdir -p ~/server-config
cp /etc/ssh/sshd_config ~/server-config/
cp /etc/nftables.conf ~/server-config/
cp /etc/systemd/journald.conf ~/server-config/
cp /etc/fail2ban/jail.local ~/server-config/
cp /etc/sysctl.d/99-server.conf ~/server-config/
cd ~/server-config && git init && git add . && git commit -m "initial setup of $(hostname)"
```

Eventually this becomes an Ansible playbook (chapter 23). For now, a git repo is enough.

## 20. The done state

You should be able to truthfully answer **yes** to all of these:

- [ ] OS fully patched, kernel current, reboot done.
- [ ] Hostname and time zone set.
- [ ] Non-root user with sudo, root SSH disabled.
- [ ] SSH on a non-default port, key-only auth, MaxAuthTries 3.
- [ ] Firewall default-deny on input, only SSH and HTTP/HTTPS open.
- [ ] fail2ban running, watching SSH.
- [ ] Unattended security upgrades enabled.
- [ ] Time syncing via chrony.
- [ ] Journald retention bounded.
- [ ] Swap configured on small boxes (or skipped on large).
- [ ] Kernel networking tuned via sysctl.
- [ ] Common utilities installed.
- [ ] Local SSH alias works.
- [ ] Audit pass — only expected services listening.
- [ ] Configs backed up to a git repo.

If any item is "no," go back and finish it. This is the box you will deploy real software to. Get it right once, every time.

## What this earns you

A box configured this way is hardened against the common attacks (brute force, drive-by scanners, casual lateral movement), survives reboots correctly, has bounded log volume, syncs its clock, and is ready to host whatever you throw at it next — Postgres, Redis, your Go binary, nginx, all of it.

Every other chapter in this site assumes you are starting from a box like this. Go build the next one.

## Recap

- Provision, update, hostname, timezone, user, SSH lockdown, firewall, fail2ban — in that order.
- Verify each step from a fresh terminal before moving on.
- Tune swappiness, sysctl, journal retention to sensible defaults.
- Audit listening ports before walking away.
- Save your configs in version control.

This is the end of the Linux & VPS basics track. You are now ready for chapter 1 of any other topic on this site.


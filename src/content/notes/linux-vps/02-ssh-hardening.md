---
title: "First Login & SSH Hardening"
subtitle: "Generate a key, disable password login, lock down sshd, and put fail2ban in front. The single most important hour you will ever spend on a VPS."
chapter: 2
level: "beginner"
readingTime: "13 min"
topics: ["ssh", "security", "openssh", "fail2ban", "hardening"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

SSH hardening is like replacing a cheap lock with a deadbolt and removing the spare key from under the mat — the door still opens, just only for the right people.

</Callout>

## Why SSH is your only real risk surface

Once you provision a fresh VPS, **port 22 is open to the entire internet**. Within minutes of a new IP being assigned, automated scanners are knocking on it, trying `root`/`123456`, `admin`/`admin`, every leaked credential dump from the last decade. This is not paranoia — it is the default state of public IPs.

If you do nothing else, lock down SSH first. Everything else can wait.

<Callout type="warn">

The actions in this chapter are **non-optional**. A VPS with password auth and root SSH enabled will be compromised. Not "might be" — *will be*.

</Callout>

## The plan

1. Generate an SSH key pair on your laptop (if you do not already have one).
2. Copy the public key to the VPS.
3. Create a non-root user with `sudo`.
4. Disable password authentication.
5. Disable root SSH.
6. Move SSH to a non-standard port (optional, reduces noise).
7. Install `fail2ban` to ban IPs that try too many times.

## Step 1 — Generate a key on your laptop

Run this on your **local machine**, not the VPS:

```bash
ssh-keygen -t ed25519 -C "you@laptop"
```

When prompted:

- **File** — accept the default `~/.ssh/id_ed25519`.
- **Passphrase** — set one. A keyfile without a passphrase is a credential anyone can copy. With a passphrase, even a stolen laptop is one more wall.

You now have two files:

- `~/.ssh/id_ed25519` — **private key**. Never copy this anywhere. Never paste it into chat. If it leaks, anyone who reads it is you.
- `~/.ssh/id_ed25519.pub` — **public key**. Safe to share.

<Callout type="info">

**Why ed25519 over RSA?**

Smaller, faster, modern. RSA-2048 is fine but unnecessarily large. RSA-1024 is broken. ed25519 is the current default for new keys.

</Callout>

## Step 2 — Copy the public key to the VPS

If you added the key during provisioning, skip this. Otherwise:

```bash
ssh-copy-id root@49.13.123.45
```

Or by hand:

```bash
cat ~/.ssh/id_ed25519.pub | ssh root@49.13.123.45 \
  'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
```

Now log in with the key:

```bash
ssh root@49.13.123.45
```

It should not ask for a password (except your local key passphrase).

## Step 3 — Create a non-root user

Working as root is a habit you should break early. Create a real user:

```bash
adduser deploy
usermod -aG sudo deploy
```

`adduser` will ask for a password — set a long random one and put it in your password manager. You will rarely use it; it is the fallback if your key file is ever inaccessible.

Copy your authorized_keys to the new user:

```bash
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Open a **new terminal** (keep your root session open as a safety net) and verify:

```bash
ssh deploy@49.13.123.45
sudo whoami
# expected: root
```

If that worked, you are ready to disable root SSH.

## Step 4 — Edit sshd_config

```bash
sudo nano /etc/ssh/sshd_config
```

Make these changes (most lines exist commented out — uncomment and edit):

```text
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

What each does:

- **PermitRootLogin no** — root cannot SSH in directly. Forces you to log in as `deploy` and use `sudo`.
- **PasswordAuthentication no** — only key-based auth. The brute-force surface is gone.
- **MaxAuthTries 3** — three wrong attempts and the connection drops.
- **ClientAliveInterval / Max** — kicks idle sessions after ~10 minutes.
- **AllowUsers deploy** — only this one user can SSH at all.

Save, then reload:

```bash
sudo systemctl reload ssh
```

<Callout type="warn">

**Do not close your existing root session yet.**

Open a brand new terminal and try `ssh deploy@49.13.123.45`. If it works, you are safe. If it fails, your old session still has root and you can fix `sshd_config`. Closing both before testing is how people lock themselves out.

</Callout>

## Step 5 — Move SSH to a non-standard port (optional)

This does not improve security in any deep sense — port scans find anything — but it dramatically reduces *noise* in your logs. Pick a port between 1024 and 65535 that you can remember:

```text
Port 2222
```

Reload `ssh`. Now connect with:

```bash
ssh -p 2222 deploy@49.13.123.45
```

Add it to `~/.ssh/config` on your laptop so you do not have to type `-p 2222` every time:

```text
Host web-01
    HostName 49.13.123.45
    Port 2222
    User deploy
    IdentityFile ~/.ssh/id_ed25519
```

Then just: `ssh web-01`.

## Step 6 — Install fail2ban

Even with key-only auth, the SSH log fills with junk. `fail2ban` watches the log and bans IPs that hit it too many times.

```bash
sudo apt update
sudo apt install -y fail2ban
```

Create a local override so package upgrades do not stomp your settings:

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

Reload:

```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
```

## Step 7 — Quick verification

From your laptop, try a wrong password to confirm it is blocked:

```bash
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no deploy@web-01
# Should fail immediately with "Permission denied (publickey)"
```

Try connecting as root:

```bash
ssh -p 2222 root@49.13.123.45
# Should fail
```

Try a few wrong attempts to trip fail2ban:

```bash
for i in 1 2 3 4 5 6; do
  ssh -p 2222 -o BatchMode=yes -i /tmp/wrong_key.pem deploy@49.13.123.45
done
# After ~5, your laptop's IP is banned for an hour
```

## Recap

- Keys, not passwords. ed25519 with a passphrase.
- Non-root user with `sudo`. Root SSH disabled.
- `MaxAuthTries 3`, `AllowUsers deploy`, no PAM challenge nonsense.
- `fail2ban` to keep the log clean.
- Save your laptop's `~/.ssh/config` host alias so future commands stay short.

In chapter 3, we explore the filesystem you just landed in.


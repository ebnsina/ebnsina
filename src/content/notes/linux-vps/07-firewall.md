---
title: "Firewall Fundamentals"
subtitle: "How packets actually flow through the kernel, and how to write nftables rules that allow exactly what you want and reject everything else."
chapter: 7
level: "intermediate"
readingTime: "13 min"
topics: ["firewall", "nftables", "iptables", "ufw", "netfilter", "linux"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A firewall is like a security guard at the building entrance who checks a list of who's allowed in before opening the door — everyone else is turned away before they even reach the lobby.

</Callout>

## What a firewall on Linux actually is

There is no separate "firewall" daemon on Linux. The kernel itself, via the **netfilter** framework, runs every packet through a series of decision points called *hooks* — `prerouting`, `input`, `forward`, `output`, `postrouting`. At each hook, the kernel consults a set of rules: accept, drop, mangle, redirect. Whatever the rules say, the packet does.

You configure those rules with one of three tools:

- **`nftables`** — modern, what you should use. Single command (`nft`), single config file.
- **`iptables`** — classic, what every old tutorial uses. Still works but is now a compatibility wrapper over nftables on most distros.
- **`ufw`** — friendly front-end. Wraps iptables/nftables in commands like `ufw allow 22`. Fine for desktops and quick setups; fragile when you need anything custom.

We will use **nftables** directly. Once you can read and write a small `nft` ruleset, you will never need ufw again.

<Callout type="info">

**Why pick one and stick with it?**

Mixing iptables and nftables on the same host can produce contradictory rule chains that are nearly impossible to debug. Pick nftables. Disable iptables-persistent. Move on.

</Callout>

## The default-deny philosophy

A correct firewall is **default-deny**: any packet not explicitly allowed is dropped. The opposite (default-allow) means every new service exposes itself unless you remember to block it — and you will not remember.

The minimum useful policy:

1. Allow all **established** and **related** connections (so replies to outbound requests come back).
2. Allow all loopback traffic (`lo` interface).
3. Allow specific **inbound** ports: SSH, HTTP, HTTPS.
4. Drop everything else.

That is it. Five rules and you have a real firewall.

## Installing and enabling nftables

On Debian/Ubuntu:

```bash
sudo apt update
sudo apt install -y nftables
sudo systemctl enable --now nftables
```

The default config is at `/etc/nftables.conf`. Replace it with a sensible base.

## Your first ruleset

```nft
#!/usr/sbin/nft -f

flush ruleset

table inet filter {

    chain input {
        type filter hook input priority filter; policy drop;

        # Allow loopback
        iif "lo" accept

        # Allow established and related connections
        ct state { established, related } accept

        # Drop invalid packets
        ct state invalid drop

        # Allow ICMP (ping, MTU discovery)
        ip protocol icmp accept
        ip6 nexthdr icmpv6 accept

        # SSH
        tcp dport 2222 accept

        # HTTP and HTTPS
        tcp dport { 80, 443 } accept

        # Optional rate-limit incoming SSH
        # tcp dport 2222 ct state new limit rate 10/minute accept
    }

    chain forward {
        type filter hook forward priority filter; policy drop;
    }

    chain output {
        type filter hook output priority filter; policy accept;
    }
}
```

Save to `/etc/nftables.conf`, then:

```bash
sudo nft -f /etc/nftables.conf
sudo nft list ruleset
```

Test from your laptop that SSH still works **before** you log out:

```bash
ssh -p 2222 deploy@web-01
```

If it fails, your existing session is your safety net — fix the rules.

## Reading the ruleset, line by line

```nft
table inet filter {
```

`inet` means "both IPv4 and IPv6." `filter` is a name you choose; conventionally `filter` for the main packet-decision table.

```nft
chain input {
    type filter hook input priority filter; policy drop;
```

A chain bound to the `input` hook — packets destined for this host. `priority filter` is the standard ordering. `policy drop` is the default-deny.

```nft
iif "lo" accept
```

Anything coming in on the loopback interface — accept. Without this, your own services cannot talk to each other over `127.0.0.1`.

```nft
ct state { established, related } accept
```

Connection tracking. If a packet belongs to a connection that was already accepted, accept its reply too. This is what makes outbound HTTP work — the SYN goes out, the SYN-ACK comes back, conntrack remembers.

```nft
tcp dport 2222 accept
tcp dport { 80, 443 } accept
```

Allow specific destination ports.

```nft
chain forward {
    type filter hook forward priority filter; policy drop;
}
```

`forward` is for packets routed *through* this host (relevant if you turn this box into a router or run containers without bridge mode). Default-deny.

```nft
chain output {
    type filter hook output priority filter; policy accept;
}
```

Outbound is allowed by default — the box can talk to the internet. Tighten this only if you have a specific reason (egress filtering for compliance, etc.).

## Common modifications

**Add a port:**

```nft
tcp dport 9100 ip saddr 10.0.0.0/8 accept   # Prometheus scrape, only from VPN
```

**Block a specific IP:**

```nft
ip saddr 1.2.3.4 drop
```

**Rate-limit:**

```nft
tcp dport 80 ct state new limit rate 100/second burst 200 packets accept
```

**Allow ping but limit it:**

```nft
ip protocol icmp icmp type echo-request limit rate 5/second accept
```

**Geo-block (after creating a set elsewhere):**

```nft
set blocked_countries {
    type ipv4_addr; flags interval;
    elements = { 1.2.3.0/24, 5.6.7.0/24 }
}

# In the chain:
ip saddr @blocked_countries drop
```

## Logging dropped packets

While debugging:

```nft
chain input {
    type filter hook input priority filter; policy drop;
    # ... rules ...
    log prefix "FW-DROP: " level info limit rate 5/second
}
```

The drops show up in `journalctl -k` (kernel log). Turn it off when you are done — a busy server logging every dropped packet will drown its journal.

## Live editing without reloading

`nft` lets you edit the ruleset live. Useful for testing:

```bash
sudo nft list ruleset                                     # show everything
sudo nft list table inet filter                           # one table
sudo nft list chain inet filter input                     # one chain

sudo nft add rule inet filter input tcp dport 8443 accept
sudo nft delete rule inet filter input handle 12          # by handle
```

To find handles:

```bash
sudo nft -a list ruleset
```

Live edits are not persisted — they vanish on reboot. Once you confirm a rule works, write it to `/etc/nftables.conf`.

## Network-namespace caveat (containers)

If you run Docker, it manipulates iptables (or nftables) on its own to set up bridge networks and port forwards. Your handwritten rules and Docker's auto-generated rules can collide.

The tidy answer:

- Put your rules in `inet filter`.
- Let Docker have its own tables (`ip filter` and `ip nat` with chain `DOCKER-USER`).
- If you need to enforce something across both, use the `DOCKER-USER` chain — Docker leaves it alone.

For containers without Docker (bare systemd-nspawn, podman in rootless mode), your rules apply directly.

## Reading and understanding cloud provider firewalls

Many providers (Hetzner, AWS, DigitalOcean) offer a *cloud firewall* — packet filtering done outside your VM, before the packet even reaches your kernel. They are useful belt-and-suspenders, but they do not replace local rules:

- The cloud firewall protects against scanners hitting your IP.
- The local firewall protects against lateral movement if another VPS in your account is compromised.
- The local firewall also documents your intent in a file you can read, diff, and version-control.

Run both. Configure them to agree.

## What ufw actually does

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 2222/tcp
sudo ufw allow 80,443/tcp
sudo ufw enable
```

That generates rules and pushes them into nftables. Fine for a quick setup. Frustrating when you want to express anything ufw does not natively support — at which point you end up reading `/etc/ufw/before.rules` and editing it by hand. The shortcut is gone.

If you are going to read raw rules anyway, just write nftables.

## Common mistakes

- **Forgetting the SSH port.** Adding `policy drop` to `input` without an `accept` for SSH locks you out. Always test from a *new* terminal before closing your existing session.
- **Forgetting `iif lo accept`.** Half your services break because they cannot talk to localhost.
- **Forgetting `ct state established accept`.** Outbound stops working — your `apt update` hangs.
- **Mixing iptables and nftables.** Pick one. If you have iptables-persistent installed, remove it.

## Recap

- Firewall on Linux is netfilter. nftables is the modern interface.
- Default-deny on input. Default-allow on output. Drop forward unless you are routing.
- Five rules: loopback, established/related, ICMP, SSH, HTTP/HTTPS.
- Live edits are temporary. Persist via `/etc/nftables.conf`.
- Cloud firewalls and local firewalls complement each other; run both.

Next chapter: users, groups, and the sudo problem.


---
title: "Picking a VPS"
subtitle: "What a VPS actually is, how to size one, and how to provision your first box without locking yourself into anyone's ecosystem."
chapter: 1
level: "beginner"
readingTime: "9 min"
topics: ["vps", "linux", "provisioning", "hetzner", "ovh", "digitalocean"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Picking a VPS is like choosing an apartment — location, size, and price all matter, and you can always move, but it's more painful than you expect.

</Callout>

## What a VPS actually is

A **virtual private server** is a slice of a real, physical computer in someone's data center. The provider runs a hypervisor (KVM, Xen, or VMware) on a big machine with hundreds of cores and a terabyte of RAM, and they sell you a virtual machine on top — your own kernel, your own filesystem, your own IP address.

You get root. You get a static public IP. You get a real Linux distribution. That is it. There is no "platform," no managed dashboard with sixty buttons, no surprise bill at the end of the month for an idle queue. You pay a flat fee, you do whatever you want with the box.

<Callout type="info">

**Why a VPS over managed cloud?**

Because you understand exactly what you are paying for and exactly what is running. Managed services are great when you know what they do under the hood — but you cannot get there without first running things yourself.

</Callout>

## What it is not

- **Not shared hosting.** You are not sharing a PHP install with two thousand WordPress sites. You have your own kernel.
- **Not a serverless platform.** Nothing scales for you. Nothing wakes up on demand. The box is on, full stop.
- **Not bulletproof.** A single VPS can disappear. Hardware fails, providers have outages, the network drops. You will learn to design for that — but a single $5 box is the right starting point.

## Choosing a provider

Any of these will do for learning. Pick one based on price, region, and reputation:

| Provider | Smallest plan | Notes |
|---|---|---|
| **Hetzner Cloud** | ~€4/mo (2 vCPU, 4GB RAM, 40GB SSD) | Best price/performance. EU and US regions. |
| **OVH / Public Cloud** | ~€3/mo | Cheap, French, occasionally rough UI. |
| **DigitalOcean** | $4/mo (1 vCPU, 512MB RAM, 10GB) | Polished docs, slightly pricier. |
| **Linode (Akamai)** | $5/mo (1 vCPU, 1GB RAM, 25GB) | Solid, similar to DO. |
| **Vultr** | $3.50/mo | Many regions worldwide. |

The skill is **identical** across all of them. The hardening, the firewall rules, the systemd units — none of it changes. Pick one.

## Sizing your first box

Default to the smallest plan with at least **1GB of RAM**. That is enough to run:

- nginx
- A small Postgres
- A backend service in Go or Node
- Redis
- ssh, journald, the firewall

If you go below 1GB, you will spend more time fighting the OOM killer than learning. If you need more later, you can resize.

```text
Rule of thumb for the first VPS:
  1 vCPU
  2 GB RAM
  20–40 GB SSD
  1 IPv4 + 1 IPv6
  ~$4–6/month
```

## Picking the OS

Pick **Debian 12 (Bookworm)** or **Ubuntu Server LTS (24.04)** for your first box. Both are mainstream, both have huge package selections, both have years of free security updates.

- **Debian** is leaner, fewer surprises, what most production servers run.
- **Ubuntu** is friendlier, has slightly more recent packages, more tutorials online.

Avoid for now:
- **Alpine** — different libc, occasional gotchas with prebuilt binaries.
- **Arch / rolling distros** — fast-moving, fine for a desktop, painful for a server.
- **CentOS Stream / RHEL clones** — the dnf/yum world is fine but every other tutorial assumes apt.

## Provisioning the box (Hetzner example)

Concrete walkthrough. The flow is identical at every other provider — only the buttons move.

1. Sign up. Verify your email and add a payment method.
2. Click **New Project**, then **New Server**.
3. Pick a **location** close to your users (or to you, for learning).
4. Pick **Debian 12** as the image.
5. Pick the **CX22** plan (or equivalent — 2 vCPU, 4GB RAM, ~€4/mo).
6. **Add an SSH key** — paste the public key from your laptop. (We will cover making one in chapter 2 if you do not already have one.)
7. Give the server a name like `web-01`.
8. Click **Create & Buy now**.

In about 15 seconds, the provider hands you back a public IPv4 like `49.13.123.45`. That is your box.

## First connection

```bash
ssh root@49.13.123.45
```

If you added your SSH key during provisioning, you go straight in. If not, the provider emails you a temporary root password — use it once, change it immediately, then add a key (chapter 2).

You should see something like:

```
Linux web-01 6.1.0-21-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.90-1
The programs included with the Debian GNU/Linux system are free software;
the exact distribution terms for each program are described in the
individual files in /usr/share/doc/*/copyright.
root@web-01:~#
```

Congratulations — you are root on a real Linux box on the internet, in a data center somewhere in Europe or America. From here on, every chapter teaches you what to do with it.

## What to do right now

1. Run `uname -a` — see your kernel version.
2. Run `cat /etc/os-release` — see your distribution.
3. Run `ip addr` — see your network interfaces and IPs.
4. Run `free -h` — see your memory.
5. Run `df -h` — see your disk.

That is your environment. In the next chapter, we lock down the front door before anything else.

<Callout type="warn">

**Do not skip chapter 2.**

A fresh VPS with password auth and root SSH enabled will start getting brute-forced within minutes of being on the public internet. Hardening before anything else is non-negotiable.

</Callout>

## Recap

- A VPS is a virtual machine on someone else's metal. You get root, a public IP, a real OS.
- Pick Hetzner, OVH, DigitalOcean, Linode, or Vultr — the skills transfer.
- Default to Debian 12 or Ubuntu LTS, smallest plan with ≥1GB RAM.
- Provision, SSH in as root, take a snapshot of what you see — then move on to hardening.


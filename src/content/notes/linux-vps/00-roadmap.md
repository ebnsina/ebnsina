---
title: 'Linux & VPS Basics — Roadmap'
subtitle: 'Twelve chapters that take you from a brand-new VPS to a hardened, monitored, ready-to-run-real-software box. No managed cloud.'
chapter: 0
level: 'beginner'
readingTime: '6 min'
topics: ['roadmap', 'linux', 'vps', 'self-hosted']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What you will be able to do at the end

You will rent a VPS, harden it, install the things a real backend needs, and feel at home on the command line. Every other chapter on this site assumes you can do this. If you cannot already SSH into a box and feel comfortable, start here.

<Callout type="info">

This track is **vendor-neutral**. Any VPS provider works — Hetzner, OVH, DigitalOcean, Linode, Vultr, a Raspberry Pi on your desk, or an old laptop. The skills are the box, not the brand.

</Callout>

## Prereqs

- Comfortable typing in a terminal (you can `cd` and `ls`)
- A laptop with `ssh` installed (macOS and Linux already have it; on Windows use WSL or PowerShell's OpenSSH)
- A credit card for a $5/month VPS (or use your own hardware)

## The 12 chapters, in order

**Foundations**

1. **Picking a VPS** — what a VPS actually is, how to choose, how to provision
2. **First login & SSH hardening** — keys, `sshd_config`, fail2ban, the front door
3. **The Linux filesystem** — paths, permissions, ownership, the FHS
4. **Processes & signals** — what your app actually _is_ on Linux
5. **systemd** — services that survive reboot

**Core**

6. **Sockets, ports, and what's listening** — `ss`, `lsof`, port theory
7. **Firewall fundamentals** — `nftables`/`iptables`, the chains that protect you
8. **Users, groups, and sudo** — least privilege without ceremony
9. **Logs & journalctl** — where output goes, how to read it, how to rotate it

**Advanced**

10. **Resource limits** — cgroups, `ulimit`, OOM killer, the limits that bite
11. **Cron & systemd timers** — scheduled work without surprises
12. **Production checklist** — every box you ever provision, in one runbook

## How to use this track

Read in order. Do every chapter on a real VPS, not in your head. Break things on purpose. Re-provision and do it again — muscle memory matters more than notes.

Total reading time: ~2.5 hours. Total hands-on time, the first time: 8–12 hours over a weekend.

---
title: "The boring stack ships"
description: "An argument for picking the dullest technology that solves your problem — and a working definition of 'dull'."
date: 2026-03-14
tags: ["engineering", "opinions"]
minutesRead: 1
---

The most interesting thing about my current production stack is that
nothing about it is interesting.

Postgres. A single backend service in Go. A static frontend. Cron jobs.
A managed Redis I'm slowly trying to delete. That's the whole thing,
and it serves more traffic than three of my previous startups combined.

## "Boring" is not "old"

Boring isn't a synonym for legacy. A boring technology is one where:

- **The failure modes are documented.** Not just the happy path.
- **The operational story is solved.** Backups, restores, upgrades,
  observability &mdash; all answered by someone who isn't you.
- **The talent pool is deep.** You can hire someone who's run this
  in anger.

By that definition, Postgres in 2026 is boring. So is Go. So is
plain HTML over a CDN.

## The hidden cost of novelty

Every novel piece of infrastructure imposes a tax:

1. The learning tax (yours, and every future hire's).
2. The integration tax (it's the only thing that doesn't fit the rest).
3. The on-call tax (when it breaks at 3am, who knows the runbook?).

You pay that tax forever. It's only worth paying when the novel piece
delivers something the boring alternative *fundamentally cannot*.

## A test I use

Before adopting any new piece of infrastructure, I ask: *what's the
worst weekend I'll have because of this in the next two years?*

If I can't answer with specifics, I don't know the technology well
enough to choose it.


---
title: "Cron & systemd Timers"
subtitle: "Two ways to run code on a schedule. Which to pick, how to write each, and how to keep scheduled jobs from silently failing for months."
chapter: 11
level: "advanced"
readingTime: "10 min"
topics: ["cron", "systemd", "timers", "scheduling", "linux"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A cron job is like an alarm clock that runs a task instead of waking you up — set it once, and it fires on schedule without any further attention.

</Callout>

## Two scheduling systems

Linux has two ways to run something on a schedule:

1. **cron** — the classic, since 1975. A daemon that reads `crontab` files and forks tasks at scheduled times.
2. **systemd timers** — modern. `.timer` units that trigger `.service` units.

Both work. Cron is shorter to write for one-line jobs and instantly familiar. Systemd timers are stricter, integrate with the journal, support persistence across reboots, and let you reuse all the service-hardening directives from chapter 5.

If you are already on systemd (you are), prefer timers for anything important. Use cron for tiny throwaway jobs and one-liners.

## cron — the classic

Each user has a crontab — a file listing scheduled jobs. Edit yours:

```bash
crontab -e
```

Each line is `minute hour day-of-month month day-of-week command`:

```text
# m h dom mon dow   command
0 4 * * *           /opt/myapp/bin/backup.sh
*/15 * * * *        /opt/myapp/bin/healthcheck.sh
0 0 1 * *           /opt/myapp/bin/monthly-report.sh
30 9 * * 1-5        /opt/myapp/bin/workday-task.sh
```

Read top to bottom:

- `0 4 * * *` — at 4:00 AM every day.
- `*/15 * * * *` — every 15 minutes.
- `0 0 1 * *` — midnight on the first of every month.
- `30 9 * * 1-5` — 9:30 AM Monday through Friday.

System-wide cron files live in `/etc/crontab`, `/etc/cron.daily/`, `/etc/cron.hourly/`, `/etc/cron.weekly/`, `/etc/cron.monthly/`. Drop a script in `/etc/cron.daily/` and it runs daily without writing a crontab line.

## The cron environment trap

Cron jobs run with a *minimal* environment. `$PATH` is short, `$HOME` may not be set, your shell aliases are not loaded. Scripts that work in your terminal often fail in cron because they expect environment they no longer have.

The fix:

- Use absolute paths for binaries (`/usr/bin/curl`, not `curl`).
- Set `PATH` at the top of your crontab if needed.
- Source your environment file explicitly.

```text
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SHELL=/bin/bash

0 4 * * * cd /opt/myapp && /opt/myapp/bin/backup.sh >>/var/log/myapp/backup.log 2>&1
```

That redirect at the end is critical: by default, cron emails any output to the user via local mail, which probably is not configured on a VPS. Redirect to a log file, or to `/dev/null` if you do not care.

## cron pitfalls

- **Silent failures.** If your script exits 1 and you redirected stderr to `/dev/null`, you will never know. Always log.
- **Overlapping runs.** If a job takes longer than its interval, cron fires another copy alongside the first. Use a lockfile (`flock`) if simultaneous runs would be bad.
- **Missed runs after downtime.** If the box was off when 4am hit, cron does not run the job late. It is gone.
- **Time zones.** Cron uses the system's local time. If your VPS is in UTC and your crontab says `0 4 * * *`, that is 4am UTC. Be deliberate about this.

## Locking — preventing overlap

```text
*/5 * * * * /usr/bin/flock -n /tmp/sync.lock /opt/myapp/bin/sync.sh
```

`flock -n` (non-blocking) acquires the lock or exits immediately. If `sync.sh` is still running from the last interval, the new invocation simply skips this round.

## systemd timers — the modern way

A timer is a pair of unit files: a `.service` that does the work and a `.timer` that says when to run it.

The service:

```ini
# /etc/systemd/system/backup.service
[Unit]
Description=Daily backup

[Service]
Type=oneshot
User=myapp
ExecStart=/opt/myapp/bin/backup.sh
StandardOutput=journal
StandardError=journal

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/backup
```

Note: no `[Install]` section — you do not enable a oneshot service directly; you enable its timer.

The timer:

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Run backup daily

[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=15m
Unit=backup.service

[Install]
WantedBy=timers.target
```

Enable the timer (not the service):

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer
```

Verify:

```bash
$ systemctl list-timers
NEXT                         LEFT          LAST                         PASSED       UNIT
Tue 2026-05-05 00:14:32 UTC  6h 12min      Mon 2026-05-04 00:08:11 UTC  17h 52min    backup.timer
```

Run it on demand:

```bash
sudo systemctl start backup.service
```

## OnCalendar — the schedule grammar

Systemd's `OnCalendar` syntax is more readable than cron and supports calendar shortcuts:

```text
OnCalendar=daily                   # 00:00 every day
OnCalendar=hourly                  # at the top of every hour
OnCalendar=weekly                  # Monday 00:00
OnCalendar=monthly                 # 1st of the month, 00:00
OnCalendar=Mon..Fri 09:30          # weekdays at 9:30
OnCalendar=*-*-* 04:00:00          # every day at 4:00 (full form)
OnCalendar=*-*-01 00:00:00         # 1st of each month at midnight
OnCalendar=Mon *-*-* 09:00:00      # every Monday at 9:00
OnCalendar=*:0/15                  # every 15 minutes
OnCalendar=*-*-* *:00,30           # every hour on the hour and half-hour
```

Validate a schedule string:

```bash
$ systemd-analyze calendar 'Mon *-*-* 09:00:00'
  Original form: Mon *-*-* 09:00:00
Normalized form: Mon *-*-* 09:00:00
    Next elapse: Mon 2026-05-04 09:00:00 UTC
```

## Persistent — runs missed schedules

```ini
[Timer]
OnCalendar=daily
Persistent=true
```

If the box was off when the timer should have fired, `Persistent=true` runs it as soon as the box comes back. Cron has no equivalent. For backups, snapshots, certificate renewals — anything that must eventually happen — `Persistent=true` is the right setting.

## RandomizedDelaySec — fleet-wide jitter

If a hundred boxes all run a backup at exactly midnight, the backup target is hammered for one minute and idle for the rest. Add jitter:

```ini
RandomizedDelaySec=15m
```

Each box will fire some random number of seconds between 0 and 15 minutes after the scheduled time. Effortless load smoothing.

## OnBootSec — relative timers

Sometimes "every X minutes after this service started" is what you want. For periodic health checks:

```ini
[Timer]
OnBootSec=5min
OnUnitActiveSec=10min
```

5 minutes after boot, run once. Then run every 10 minutes after the *last successful run*. If a run takes 8 minutes, the next one is 10 minutes after that — never overlapping.

## Timer logs

The big advantage over cron: every timer's runs are in the journal.

```bash
journalctl -u backup.service                    # output of every backup
journalctl -u backup.service -f                 # follow live
journalctl -u backup.service --since today
systemctl list-timers                           # next run for everything
systemctl list-timers --all                     # including disabled
```

You can see at a glance: when did this last run? Did it fail? What did it print?

## Migration: cron to timer

Cron line:

```text
0 4 * * * /opt/myapp/bin/backup.sh
```

Equivalent service + timer pair:

```ini
# backup.service
[Unit]
Description=Daily backup
[Service]
Type=oneshot
ExecStart=/opt/myapp/bin/backup.sh
```

```ini
# backup.timer
[Unit]
Description=Run backup at 04:00
[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true
[Install]
WantedBy=timers.target
```

More files, but you get journald logging, sandbox directives, persistence across reboots, monitoring via `systemctl status`, and the ability to test by running the service manually.

## When to still use cron

- One-off, non-critical tasks where two unit files feel like overkill.
- A server that does not run systemd (rare today — most do).
- Scripts you copy verbatim from blog posts and just want to work.

For anything you would be sad to discover hadn't run for a month, write a timer.

## Diagnosing a job that "isn't running"

```bash
# Cron
sudo grep CRON /var/log/syslog          # cron's own activity
sudo less /var/log/myapp/backup.log     # your job's output (if you redirected)

# systemd timer
systemctl list-timers --all
systemctl status backup.timer
systemctl status backup.service
journalctl -u backup.service -n 100
```

The most common reason a "scheduled job isn't running":

- Cron — you typoed the schedule or your script's $PATH is wrong.
- Timer — you `enable`-d the service instead of the timer.

## Recap

- Cron is fine for trivial recurring jobs. Always redirect output. Beware silent failures, missed runs, and environment surprises.
- systemd timers replace cron for anything important. Two files instead of one, but you get journald, persistence, hardening, and live status.
- `OnCalendar` is more readable than cron syntax. `Persistent=true` runs missed schedules. `RandomizedDelaySec` smooths fleet-wide bursts.
- `systemctl list-timers` is the dashboard for every scheduled job on the box.

Next chapter: the production checklist. Everything from this track, in one runbook for every fresh VPS.


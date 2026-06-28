---
title: 'Logs & journalctl'
subtitle: 'Where every line of output goes on a modern Linux box, how to query it, how to keep the disk from filling up, and when to ship logs off the host.'
chapter: 9
level: 'intermediate'
readingTime: '11 min'
topics: ['logs', 'journalctl', 'journald', 'logrotate', 'syslog', 'linux']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

The system log is like a ship's log — every event is recorded in sequence, so you can reconstruct exactly what happened and when, even long after the fact.

</Callout>

## Two log worlds, one system

Modern Linux has two parallel log destinations:

1. **journald** — systemd's binary, structured, queryable journal. Every service supervised by systemd writes here automatically.
2. **Plain text files in `/var/log/`** — the traditional approach. Apache writes `/var/log/apache2/access.log`. Postgres writes `/var/log/postgresql/postgresql-15-main.log`. Custom apps log wherever you tell them to.

A well-organized server uses both: services that respect `stdout`/`stderr` flow into journald (zero config), and services that insist on log files write to `/var/log/<servicename>/`. Both are queryable with the same mental model.

## journald — what it actually does

When a systemd service writes to stdout or stderr, journald captures it, attaches metadata (PID, UID, unit name, hostname, timestamp, priority), and stores it in a binary file under `/var/log/journal/`. Querying it later produces the _exact same fields back_, including the metadata.

This is genuinely better than text logs because:

- You can filter by structured field, not just regex.
- You can render in many formats (plain, JSON, JSON pretty, exporter-friendly).
- It is one tool with one query language for everything systemd touches.
- It auto-rotates. Old logs are deleted when the journal hits a size cap.

You can keep the journal forever or volatile-only. Default depends on the distro.

## journalctl — the only command you need

```bash
journalctl                            # everything, oldest first
journalctl -e                         # everything, jump to end
journalctl -f                         # follow new entries (tail -f)
journalctl -n 100                     # last 100 lines
journalctl -r                         # reverse order, newest first
journalctl --since "1 hour ago"
journalctl --since "2026-05-04 09:00" --until "2026-05-04 10:00"
journalctl --since today --until "10 minutes ago"
```

By **service**:

```bash
journalctl -u myapp                   # one service, all time
journalctl -u myapp -f                # follow it
journalctl -u myapp -p err            # only error and worse
journalctl -u myapp -u nginx          # multiple services, merged
journalctl -u myapp --since today
```

By **process or executable**:

```bash
journalctl _PID=1234
journalctl _COMM=nginx                # all processes named nginx
journalctl /usr/sbin/nginx            # by binary path
```

By **priority**:

```bash
journalctl -p err                     # err and above
journalctl -p warning..err            # warning, err, only
```

Priority values from least to most severe:

```text
debug, info, notice, warning, err, crit, alert, emerg
```

By **boot**:

```bash
journalctl -b                         # current boot
journalctl -b -1                      # previous boot
journalctl --list-boots               # all known boots
```

## Output formats

```bash
journalctl -u myapp -o short           # default
journalctl -u myapp -o short-iso       # ISO timestamps (better for grepping)
journalctl -u myapp -o json            # one JSON object per line
journalctl -u myapp -o json-pretty     # multi-line JSON
journalctl -u myapp -o cat             # message field only, no metadata
```

`-o json` is the cheat code for shipping logs elsewhere — pipe it to whatever processor you like:

```bash
journalctl -u myapp -o json --since today | jq '. | select(.PRIORITY <= "3")'
```

## Searching

```bash
journalctl -u myapp -g "connection refused"
journalctl -u myapp -g "ERROR" --case-sensitive
```

`-g` (grep) is built in. For structured fields, the equality form is faster:

```bash
journalctl PRIORITY=3                 # all error-priority messages from any service
journalctl _SYSTEMD_UNIT=myapp.service _COMM=worker
```

## What metadata is available

```bash
journalctl -u myapp -o verbose -n 1
```

Output:

```text
Mon 2026-05-04 10:42:11.123456 UTC [s=abc...]
    PRIORITY=6
    SYSLOG_FACILITY=3
    _UID=998
    _GID=998
    _PID=1234
    _COMM=myapp
    _EXE=/opt/myapp/bin/myapp
    _CMDLINE=/opt/myapp/bin/myapp --config /etc/myapp/config.yaml
    _SYSTEMD_UNIT=myapp.service
    _BOOT_ID=...
    _MACHINE_ID=...
    _HOSTNAME=web-01
    _TRANSPORT=stdout
    MESSAGE=starting on :8080
```

Every one of those underscore-prefixed fields is filterable. That is the structured-logging payoff.

## Disk usage and retention

```bash
journalctl --disk-usage
# Archived and active journals take up 264.5M in the file system.
```

Configure retention in `/etc/systemd/journald.conf`:

```ini
[Journal]
SystemMaxUse=1G
SystemKeepFree=2G
MaxRetentionSec=2week
ForwardToSyslog=no
```

After editing:

```bash
sudo systemctl restart systemd-journald
```

Manually purge:

```bash
sudo journalctl --vacuum-size=500M    # keep the last 500MB
sudo journalctl --vacuum-time=7d      # keep the last 7 days
sudo journalctl --vacuum-files=10     # keep the last 10 archived files
```

If you have ever filled `/var` with logs and crashed your box, this is the chapter you skipped.

## Plain-text logs — `/var/log`

Some services still write text files because they predate journald or because their authors prefer it. Common ones:

```bash
ls /var/log
# auth.log, syslog, kern.log, daemon.log, dpkg.log, apt/, nginx/, postgresql/, ...
```

Read them like any text file:

```bash
sudo less /var/log/auth.log
sudo tail -f /var/log/nginx/access.log
sudo grep -E "FAIL|ERROR" /var/log/syslog
```

`grep -E` for extended regex; `grep -F` for plain string (faster); `grep -c` to count matches; `grep -A 3 -B 3` for context lines.

## logrotate — rotating text logs

A 50GB nginx access.log will eat your disk. `logrotate` runs daily (via cron or a systemd timer) and rotates files:

```text
/var/log/nginx/access.log
/var/log/nginx/access.log.1
/var/log/nginx/access.log.2.gz
/var/log/nginx/access.log.3.gz
...
```

Config lives in `/etc/logrotate.d/`. nginx's looks like:

```text
/var/log/nginx/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 nginx adm
    sharedscripts
    prerotate
        if [ -d /etc/logrotate.d/httpd-prerotate ]; then \
            run-parts /etc/logrotate.d/httpd-prerotate; \
        fi \
    endscript
    postrotate
        invoke-rc.d nginx rotate >/dev/null 2>&1
    endscript
}
```

Translation: rotate daily, keep 14 days, gzip everything but the most recent rotation, only rotate non-empty logs, and tell nginx to reopen its file descriptors after rotation (so it does not keep writing to the renamed file).

Test a rotation without waiting:

```bash
sudo logrotate -fv /etc/logrotate.d/nginx
```

## syslog and rsyslog

A third path: syslog. Older daemons send messages via the syslog protocol to a local syslog daemon (rsyslog on Debian/Ubuntu), which writes them to `/var/log/syslog`, `/var/log/auth.log`, `/var/log/kern.log`, etc.

In modern systems, journald and rsyslog both run, journald forwards to rsyslog, and rsyslog writes to text files. You can disable rsyslog if you only want journald:

```bash
sudo systemctl disable --now rsyslog
sudo apt remove rsyslog
```

Journal-only is fine for small fleets. Keep rsyslog if you want to ship logs off-host using its forwarding rules.

## Shipping logs elsewhere

A single VPS holding all its own logs is fine until the VPS dies and takes the logs with it. For real systems:

- **Lightweight:** `journalctl -u myapp -o json | <some forwarder>` running as a systemd timer or sidecar.
- **Standard:** Vector, Fluent Bit, Promtail, or rsyslog forwarding via TCP/TLS to a central log server.
- **Bigger:** Loki for structured search; ClickHouse + a parser for serious volume.

For this chapter, the rule is: know how to query the local journal cold. Once you can do that, exporting it is a five-line config.

## Application logging — what to write

Best practices for the logs _your app_ emits:

- **Write to stdout/stderr.** journald captures it. Do not invent your own log file.
- **One event per line.** Multi-line stack traces are okay; multi-line "human" log messages are not.
- **Structured fields where possible.** Use a logger that emits JSON in production: `logger.info("connection accepted", peer=addr, request_id=rid)`.
- **Log priorities deliberately.** Reserve `error` for things that need attention. If everything is an error, nothing is.
- **Include a request ID** that flows through the whole request. You will thank yourself.

## Common queries you will use over and over

```bash
# What did myapp do in the last 5 minutes?
journalctl -u myapp --since "5 min ago"

# Errors from any service today
journalctl -p err --since today

# Authentication attempts (good and bad)
journalctl -u ssh --since today

# Out-of-memory kills
journalctl -k --grep "out of memory"

# Reboots
journalctl --list-boots

# Why did the system go down at 03:14?
journalctl --since "03:10" --until "03:20"
```

## Recap

- journald captures stdout/stderr from every systemd service automatically. `journalctl` is the universal log viewer.
- Filter by `-u <unit>`, `-p <priority>`, `--since`, `--until`. Use `-f` to follow.
- Configure retention in `journald.conf` to keep `/var` from filling up.
- Plain-text logs in `/var/log/` are the older path; rotate them with logrotate.
- Apps should log JSON to stdout, not a file. Let journald handle the rest.
- Ship logs off-host before relying on a single VPS to remember anything important.

Next chapter: limits — the kernel knobs that decide how much your services are allowed to consume.

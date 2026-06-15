---
title: "systemd"
subtitle: "Write a unit file. Restart on crash. Survive reboot. Read the journal. The supervisor that runs everything on a modern Linux box."
chapter: 5
level: "beginner"
readingTime: "14 min"
topics: ["systemd", "services", "journald", "init", "linux"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

systemd is like a shift supervisor who starts workers at boot, restarts them automatically if they crash, and keeps a detailed log of everything that happened during the shift.

</Callout>

## Why systemd

Before systemd, every distribution had a different init system, every daemon had a different way of being started, and "is nginx running?" had three answers depending on which version of which init script you were looking at. systemd unified all of that. On every mainstream Linux distribution today, the same commands work the same way:

```bash
systemctl start nginx
systemctl enable nginx
systemctl status nginx
systemctl restart nginx
journalctl -u nginx -f
```

You may dislike systemd. You may have heard people on the internet dislike it more. None of that matters — it is the standard, it is what every tutorial assumes, and it works.

## What systemd actually does

Three jobs:

1. **Boot the system.** As PID 1, it brings up disks, network, services in dependency order.
2. **Supervise services.** It starts your processes, restarts them if they crash, captures their stdout/stderr, runs them as the right user, kills them politely on shutdown.
3. **Manage the journal.** All output from supervised services flows into `journald`, a structured binary log you query with `journalctl`.

Everything else (timers, sockets, mounts, scopes, slices) is an extension of these three.

## Units — the building block

A **unit** is anything systemd manages. Each has a name and a type, separated by a dot:

| Type | What it represents |
|---|---|
| `.service` | A long-running process. The most common kind. |
| `.timer` | A scheduled trigger (cron replacement). |
| `.socket` | A listening port managed by systemd, hands off to a service when a connection arrives. |
| `.target` | A grouping of units. `multi-user.target` is "the system is up and ready." |
| `.mount` | A filesystem mount point. |
| `.path` | A trigger that fires when a file changes. |
| `.timer` | A schedule. |

Units live in three directories, in order of precedence:

- `/etc/systemd/system/` — **what you write.** Highest priority. Edit here.
- `/run/systemd/system/` — runtime, generated. Do not touch.
- `/usr/lib/systemd/system/` — what packages install. Do not edit; copy to `/etc/` and edit there.

## Your first service unit

Say you have a Go binary at `/opt/myapp/bin/myapp` that listens on port 8080 and reads its config from `/opt/myapp/config.yaml`. Here is the complete unit:

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My example app
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/bin/myapp --config /opt/myapp/config.yaml
Restart=on-failure
RestartSec=5

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/myapp /var/log/myapp
PrivateTmp=true

# Resource limits
LimitNOFILE=65536
MemoryMax=512M

[Install]
WantedBy=multi-user.target
```

That is it. Save it, then:

```bash
sudo systemctl daemon-reload          # systemd picks up the new file
sudo systemctl start myapp            # start it now
sudo systemctl enable myapp           # start it at every boot
sudo systemctl status myapp           # is it running?
```

Reboot the box. Your app comes back up automatically. Crash it. systemd waits five seconds and restarts it.

## Reading a unit file, line by line

**[Unit]** — metadata and dependencies.

- `Description` — shows up in `systemctl status`.
- `After=network-online.target` — do not start me until the network is fully up.
- `Wants=network-online.target` — start that target if it is not already, but do not fail if it cannot.
- `Requires=` (not used here) — if this dependency fails, fail me too. Stricter than `Wants`.

**[Service]** — how to run the process.

- `Type=simple` — the most common. systemd assumes the process is up the moment it forks.
  - `Type=forking` — for daemons that fork into the background. Rare in modern apps.
  - `Type=notify` — the process sends `READY=1` over a socket when it is genuinely ready (good for slow startups).
  - `Type=oneshot` — runs once and exits, used for setup tasks.
- `User`, `Group` — never run as root unless you must.
- `WorkingDirectory` — `cd` here before exec.
- `ExecStart` — the command. Must be an absolute path.
- `Restart=on-failure` — restart only on non-zero exit. Other options: `always`, `on-abort`, `no`.
- `RestartSec=5` — wait this long before restarting.

**Hardening directives** — every one of these makes your service safer:

- `NoNewPrivileges=true` — process cannot gain privileges via setuid binaries.
- `ProtectSystem=strict` — `/usr`, `/boot`, `/efi` are read-only. `/etc` is read-only with `=full`.
- `ProtectHome=true` — `/home`, `/root`, `/run/user` are inaccessible.
- `ReadWritePaths=` — directories the service is *allowed* to write, despite the above.
- `PrivateTmp=true` — your `/tmp` is a sandbox, not the shared `/tmp`.

**Resource limits**:

- `LimitNOFILE=65536` — max open file descriptors. The default of 1024 is too low for any real network service.
- `MemoryMax=512M` — kill the service if it grows past 512MB.
- `CPUQuota=50%` — soft cap on CPU usage.

**[Install]** — how `systemctl enable` should wire the service.

- `WantedBy=multi-user.target` — when the system boots into "multi-user mode" (the default), start me.

## Inspecting a service

```bash
systemctl status myapp
```

Output:

```text
● myapp.service - My example app
     Loaded: loaded (/etc/systemd/system/myapp.service; enabled; preset: enabled)
     Active: active (running) since Mon 2026-05-04 10:42:11 UTC; 12min ago
   Main PID: 1234 (myapp)
      Tasks: 7 (limit: 4647)
     Memory: 18.4M
        CPU: 1.234s
     CGroup: /system.slice/myapp.service
             └─1234 /opt/myapp/bin/myapp --config /opt/myapp/config.yaml

May 04 10:42:11 web-01 systemd[1]: Started myapp.service - My example app.
May 04 10:42:11 web-01 myapp[1234]: starting on :8080
```

Useful queries:

```bash
systemctl is-active myapp              # active / inactive / failed
systemctl is-enabled myapp             # enabled / disabled
systemctl list-units --type=service    # everything currently running
systemctl list-unit-files              # everything installed
systemctl list-dependencies myapp      # what does this need?
systemctl cat myapp                    # show the unit file
systemctl edit myapp                   # create a drop-in override
systemctl edit --full myapp            # edit the whole file
```

## Logs and journalctl

Anything your service writes to stdout or stderr goes into the journal:

```bash
journalctl -u myapp                    # all logs ever, oldest first
journalctl -u myapp -n 50              # last 50 lines
journalctl -u myapp -f                 # follow (like tail -f)
journalctl -u myapp --since '1 hour ago'
journalctl -u myapp --since today --until '10 minutes ago'
journalctl -u myapp -p err             # priority err and worse
journalctl -u myapp -o json-pretty     # full structured JSON
journalctl -u myapp --grep 'connection refused'
```

Priorities, lowest to highest:

```text
debug, info, notice, warning, err, crit, alert, emerg
```

## Reload vs restart

```bash
systemctl restart myapp                # stop, then start. Drops connections.
systemctl reload myapp                 # ask the service to re-read its config without exiting
```

`reload` only works if the service supports it (the unit file declares `ExecReload=`). nginx reloads on `SIGHUP`, postgres on `SIGHUP`, your custom Go binary unless you wrote a handler.

## Drop-in overrides

You should not edit unit files in `/usr/lib/systemd/system/` — package upgrades will overwrite your changes. Use **drop-ins**:

```bash
sudo systemctl edit nginx
```

Opens an editor on `/etc/systemd/system/nginx.service.d/override.conf`. Anything you put there is merged with the package's unit file:

```ini
[Service]
LimitNOFILE=200000
Restart=always
```

Save. systemd auto-reloads. Your override survives package upgrades.

## Timers — the modern cron

A `.timer` unit triggers a `.service` unit on a schedule. Two files:

```ini
# /etc/systemd/system/backup.service
[Unit]
Description=Daily backup

[Service]
Type=oneshot
ExecStart=/opt/myapp/bin/backup.sh
```

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Run backup daily

[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=15min

[Install]
WantedBy=timers.target
```

Enable the *timer*, not the service:

```bash
sudo systemctl enable --now backup.timer
systemctl list-timers
```

`Persistent=true` runs the timer at next boot if the box was off when it should have fired. `RandomizedDelaySec` jitters the start so a hundred boxes do not all hammer the backup server at midnight. Cron has no equivalent; this alone is worth the switch.

## Common mistakes

- **Forgetting `daemon-reload`.** After editing a unit file, `systemctl` still has the old version cached. `sudo systemctl daemon-reload` fixes it.
- **Running as root by default.** Without `User=`, the service runs as root. Fix it.
- **Using relative paths in `ExecStart`.** systemd does not have a shell PATH. Always use absolute paths.
- **Not setting `Restart=`.** Default is `no` — your service will *not* restart on crash unless you ask.
- **Logs going to a file the unit cannot write.** Just write to stdout. journald handles the rest.

## Recap

- systemd manages services via unit files in `/etc/systemd/system/`.
- A service unit needs `[Unit]`, `[Service]`, `[Install]`. Five lines is enough; thirty lines is hardened.
- `systemctl` is the verb. `journalctl` is the log viewer.
- Use drop-ins for overrides. Use timers for schedules. Run as a non-root user. Set resource limits.
- Reload picks up new unit files; restart kills and respawns the service.

Next chapter: who is listening on what port, and the tools to find out.


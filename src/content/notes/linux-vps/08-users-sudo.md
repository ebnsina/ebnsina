---
title: 'Users, Groups, and Sudo'
subtitle: 'How Linux identifies who is doing what, why services run as their own users, and how sudo gives you root without making you root.'
chapter: 8
level: 'intermediate'
readingTime: '11 min'
topics: ['users', 'groups', 'sudo', 'permissions', 'linux']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Users and sudo are like office key cards — most employees get the main door, but only a few authorized people get the server room.

</Callout>

## A user is a number

To the kernel, you are a UID — a 32-bit integer. The username `deploy` is just a friendly label that resolves to UID `1000` via `/etc/passwd`. The kernel only ever sees `1000`. Same for groups: a GID is the real identity; `/etc/group` maps it to a name.

Look at yours:

```bash
$ id
uid=1000(deploy) gid=1000(deploy) groups=1000(deploy),27(sudo)
```

You are UID 1000, primary group GID 1000, also a member of group 27 (sudo). Every file you create gets owned by `1000:1000` until you say otherwise.

## /etc/passwd, /etc/shadow, /etc/group

These three plaintext files are the entire user database on most Linux systems.

```bash
$ getent passwd deploy
deploy:x:1000:1000:Deploy user,,,:/home/deploy:/bin/bash
```

Seven colon-separated fields:

1. **Username** — `deploy`
2. **Password placeholder** — always `x`. The real hash lives in `/etc/shadow`, which is root-only.
3. **UID** — `1000`
4. **GID** (primary group) — `1000`
5. **GECOS** (display name, phone, etc.) — `Deploy user,,,`
6. **Home directory** — `/home/deploy`
7. **Shell** — `/bin/bash`

The shell is set when you SSH in or run `su - deploy`. `/usr/sbin/nologin` (used by service users) means "this account cannot log in interactively."

```bash
$ getent shadow deploy
deploy:$y$j9T$abc...:19815:0:99999:7:::
```

The second field is the password hash (`$y$` is yescrypt, the modern default). If it is `*` or `!`, the account has no password and login is disabled — exactly what you want for service users.

```bash
$ getent group sudo
sudo:x:27:deploy,alice
```

Group 27 is `sudo`, with two members.

## Primary group vs supplementary groups

Every user has _one_ primary group (field 4 of `/etc/passwd`) and _zero or more_ supplementary groups (the comma-separated list in `/etc/group`).

When you create a file, it gets owned by your primary group by default. `id` shows both:

```bash
$ id
uid=1000(deploy) gid=1000(deploy) groups=1000(deploy),27(sudo),100(users)
```

Add yourself to a group:

```bash
sudo usermod -aG docker deploy
```

`-a` means _append_ (without it, `usermod -G` _replaces_ all your groups — a classic foot-gun). The change does not take effect until you log out and back in, because supplementary groups are loaded at login.

## System users vs login users

There is a soft convention:

- **UIDs 0–999** — system users (root, daemon users like `nginx`, `postgres`).
- **UIDs 1000+** — real human users.

`adduser` and `useradd` honor this. When you provision a service, give it a system user:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin myapp
```

That creates a UID in the system range (e.g., 998), no home, no shell. This is the user your systemd unit's `User=myapp` directive refers to. The account _exists_ in the kernel's eyes for permission checks, but no one can log in as it.

## File ownership in practice

```bash
$ ls -l /opt/myapp/
total 12
-rwxr-xr-x 1 myapp myapp 8192 May  4 10:42 binary
drwx------ 2 myapp myapp 4096 May  4 10:42 data
-rw-r----- 1 myapp myapp  340 May  4 10:42 config.yaml
```

- The binary is executable by everyone (`r-x` for other), but only `myapp` can write it.
- `data/` is owned by `myapp` and _only_ `myapp` can enter it (`drwx------`).
- `config.yaml` is `r--` for the group only — the `myapp` user reads it, the `myapp` group reads it, no one else can.

When your systemd unit declares `User=myapp Group=myapp`, the running process becomes UID/GID of `myapp` — and these permissions all line up. Other users on the box cannot read the config or the data directory, even if they SSH in.

## The root account

UID 0 is special. The kernel grants UID 0 every privilege regardless of file permissions. Root can read `/etc/shadow`, kill any process, mount any filesystem, write to any disk.

That is exactly why you do not run as root day-to-day. One typo (`rm -rf $UNDEFINED/`) erases the entire box. One compromised process running as root owns everything. Working as a non-root user with `sudo` for elevation gives you a _deliberate_ moment to think before each privileged action.

## sudo — root with paperwork

`sudo` lets a normal user run a single command as root, after authenticating with their _own_ password (not root's), and logs every invocation.

```bash
$ sudo systemctl restart nginx
[sudo] password for deploy:
$
```

Three things happen:

1. `sudo` checks `/etc/sudoers` to see whether `deploy` is allowed to run that command.
2. It prompts for `deploy`'s password (the first time in 5 minutes, by default).
3. It logs the command to `journalctl -t sudo`.

Look at the log:

```bash
$ sudo journalctl -t sudo -n 5
May 04 10:42:11 web-01 sudo[2345]: deploy : TTY=pts/0 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/systemctl restart nginx
```

Every privileged action is attributable. That alone is worth the friction.

## /etc/sudoers and visudo

`/etc/sudoers` is the sudo policy file. **Never edit it directly** — use `visudo`, which validates the file before saving. A broken sudoers file means no one can run sudo until you boot from rescue media.

```bash
sudo visudo
```

The default Debian/Ubuntu file ends with:

```text
# Members of the admin group may gain root privileges
%admin ALL=(ALL) ALL

# Allow members of group sudo to execute any command
%sudo   ALL=(ALL:ALL) ALL

# See sudoers(5) for more information on "@include" directives:
@includedir /etc/sudoers.d
```

The percent-sign means "group". So any member of `sudo` can run any command as any user.

For finer-grained policies, drop a file in `/etc/sudoers.d/`:

```bash
sudo visudo -f /etc/sudoers.d/deploy-restart-nginx
```

```text
deploy ALL=(root) NOPASSWD: /bin/systemctl restart nginx
deploy ALL=(root) NOPASSWD: /bin/systemctl reload nginx
```

`deploy` can now restart or reload nginx without entering a password — but not, say, edit `/etc/passwd`. Useful for deploy scripts that need exactly one privileged action.

<Callout type="warn">

**`NOPASSWD` is a sharp tool.**

Anyone who lands a shell as `deploy` can run those commands without authentication. If the command takes a path argument, they could potentially do more than you intended — `systemctl edit` and similar will open an editor with full root powers. Lock down to _exact_ command lines, never patterns.

</Callout>

## su vs sudo -i vs sudo -s

Three ways to "become root":

```bash
sudo -i        # become root with root's full login environment (recommended)
sudo -s        # root shell, but with your environment
su -           # switch user, become root, requires root's password
sudo su -      # equivalent to sudo -i, but uglier
```

Use `sudo -i` when you legitimately need to do many things as root in a row — building from source, debugging weird permission issues. Always exit back to your normal user when done.

## Capabilities — fine-grained root powers

Linux has split root's omnipotence into ~40 **capabilities**. Examples:

- `CAP_NET_BIND_SERVICE` — bind to ports below 1024.
- `CAP_SYS_TIME` — change the system clock.
- `CAP_SYS_PTRACE` — attach a debugger to other processes.
- `CAP_DAC_OVERRIDE` — bypass file permission checks.

You can grant a capability to a specific binary:

```bash
sudo setcap 'cap_net_bind_service=+ep' /opt/myapp/bin/server
```

Now `/opt/myapp/bin/server` can listen on port 80 _without being root_. This is a much safer pattern than running the whole process as root just to bind a privileged port. systemd's `AmbientCapabilities=CAP_NET_BIND_SERVICE` does the same thing for you.

## Common mistakes

- **Running services as root.** A web server bug at root is a kernel-level compromise. Run services as their own users.
- **`usermod -G docker deploy`** without `-a`. You just removed `deploy` from `sudo` and every other group.
- **Editing `/etc/sudoers` directly.** Use `visudo`. Always.
- **Sharing the `deploy` user across humans.** Every human gets their own login. `deploy` is a deploy automation user, not a person.

## Recap

- Users and groups are numbers; names are labels in `/etc/passwd` and `/etc/group`.
- System users (UID &lt; 1000) for services. Login users for humans. Service users have `nologin` shells.
- Run services as their own user. Lock files down to that user.
- `sudo` instead of working as root. Audit log via `journalctl -t sudo`.
- Use `visudo` to edit policy. Use `sudoers.d` for per-task overrides. Use `setcap` instead of root for privileged ports.

Next chapter: where all those service logs go, and how to make sense of them.

---
title: 'The Linux Filesystem'
subtitle: 'Where everything lives, why it lives there, and the permissions model that decides what your processes can touch.'
chapter: 3
level: 'beginner'
readingTime: '12 min'
topics: ['filesystem', 'permissions', 'fhs', 'linux']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

The Linux filesystem is like a filing cabinet with labeled drawers — everything has a designated place, and knowing the layout is the only way to find anything quickly.

</Callout>

## Everything is a file

This is the slogan, and it is mostly true. Open files are files. Directories are files. Devices like `/dev/null` and `/dev/sda` are files. Even running processes show up as files under `/proc`. Sockets, pipes, the kernel's view of memory — all addressable via paths.

This matters because the same tools (`cat`, `ls`, `cp`, `>`, `<`) work everywhere. Once you understand paths and permissions, ninety percent of "how do I do X on Linux" answers itself.

## The Filesystem Hierarchy Standard (FHS)

Every mainstream distribution lays things out the same way. Memorize this map — it pays back forever.

| Path                    | What lives there                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `/`                     | The root of everything. Mount point for the root filesystem.                                    |
| `/bin`, `/sbin`         | Essential commands. `ls`, `cp`, `mount`, `ip`. (On modern distros these symlink to `/usr/bin`.) |
| `/usr/bin`, `/usr/sbin` | Most commands installed by the package manager.                                                 |
| `/usr/local/bin`        | Stuff _you_ install by hand, outside the package manager.                                       |
| `/etc`                  | All system configuration. Editable text files.                                                  |
| `/var`                  | Variable data: logs (`/var/log`), spool, mail, package caches.                                  |
| `/var/log`              | Where log files go. `journald` keeps its own binary log here.                                   |
| `/home`                 | User home directories. `/home/deploy` is yours.                                                 |
| `/root`                 | Root's home. Yes, separate from `/home`.                                                        |
| `/tmp`                  | Wiped at every reboot. Use for scratch only.                                                    |
| `/opt`                  | Vendor-installed software, often self-contained.                                                |
| `/srv`                  | Data served by the system (web roots, samba shares).                                            |
| `/dev`                  | Device files. Disks, terminals, random sources.                                                 |
| `/proc`                 | Live kernel state. Each process has a directory `/proc/<pid>`.                                  |
| `/sys`                  | Like `/proc` but for hardware and kernel objects.                                               |
| `/run`                  | Runtime state since boot. Sockets, PID files. Wiped on reboot.                                  |
| `/boot`                 | Kernel and bootloader. Touch with extreme care.                                                 |
| `/mnt`, `/media`        | Manual mount points and removable media.                                                        |
| `/lib`, `/lib64`        | Shared libraries. Symlinked to `/usr/lib` on modern systems.                                    |

If you put your application in `/opt/myapp` and its data in `/var/lib/myapp`, every other Linux engineer who has ever lived knows where to look. Follow the convention.

## Paths

```text
/etc/nginx/nginx.conf      # absolute — starts with /
./config.yaml              # relative — from current directory
../shared/data             # relative — up one level
~                          # your home directory (shell expands)
~/notes                    # /home/deploy/notes
```

`pwd` prints where you are. `cd -` jumps back to where you came from. `cd` with no argument goes home.

## Inodes — what a file _really_ is

A file on disk is two things: the **inode** (metadata + pointer to data blocks) and the **directory entry** (the name pointing at the inode).

Run `ls -li`:

```bash
$ ls -li /etc/passwd
2097284 -rw-r--r-- 1 root root 1789 Mar 15 10:42 /etc/passwd
```

The first number, `2097284`, is the inode. Multiple names can point at the same inode — that is what a **hard link** is.

```bash
ln /etc/passwd /tmp/passwd-copy
ls -li /etc/passwd /tmp/passwd-copy
# Both show the same inode number — same file, two names.
```

A **symbolic link** is different — a tiny file that just contains a path string:

```bash
ln -s /etc/passwd /tmp/passwd-symlink
ls -l /tmp/passwd-symlink
# lrwxrwxrwx ... /tmp/passwd-symlink -> /etc/passwd
```

When the target moves, the symlink breaks. Hard links cannot break — they are the file.

## Permissions — the nine-character mode

```text
-rw-r--r--  1 deploy deploy   235 Mar 15 10:42 notes.txt
drwxr-xr-x  2 deploy deploy  4096 Mar 15 10:42 projects/
```

Read it as four parts:

1. **First character**: file type. `-` regular, `d` directory, `l` symlink, `c` character device, `b` block device, `s` socket, `p` named pipe.
2. **Owner permissions** (chars 2–4): `rwx` — read, write, execute.
3. **Group permissions** (chars 5–7).
4. **Other permissions** (chars 8–10) — everyone else on the box.

In octal:

| Octal | Binary | Permissions |
| ----- | ------ | ----------- |
| 7     | 111    | rwx         |
| 6     | 110    | rw-         |
| 5     | 101    | r-x         |
| 4     | 100    | r--         |
| 0     | 000    | ---         |

Common modes you will use:

- `644` — readable by everyone, writable only by owner. (Most config files.)
- `600` — only owner can read/write. (SSH private keys, `.env`.)
- `755` — directory or executable, world-readable, only owner-writable.
- `700` — directory only owner can enter. (`~/.ssh`.)

Set them:

```bash
chmod 600 ~/.ssh/id_ed25519
chmod 755 /opt/myapp/bin/run
chmod -R 750 /opt/myapp        # recursive
```

Symbolic syntax also works:

```bash
chmod u+x script.sh             # add execute for owner
chmod g-w shared.txt            # remove write for group
chmod o=r public.txt            # set other to read only
```

## What "execute" means on a directory

For a _file_, `x` means "you can run this." For a _directory_, `x` means "you can `cd` into this and access files inside it." `r` on a directory means "you can `ls` its contents." That is why `chmod 700 ~/.ssh` works — you can enter and read it, others cannot even `ls` it.

## Ownership

```bash
ls -l /etc/nginx/nginx.conf
# -rw-r--r-- 1 root root 1234 Mar 15 10:42 /etc/nginx/nginx.conf
```

Two names: **owner** (`root`) and **group** (`root`). Change them:

```bash
sudo chown deploy /opt/myapp/data.json
sudo chown deploy:deploy /opt/myapp/data.json   # owner and group
sudo chgrp www-data /var/www/site               # group only
sudo chown -R deploy:deploy /opt/myapp          # recursive
```

A common pattern: a service runs as a dedicated user (e.g., `nginx`, `postgres`), and your app's files are owned by that user so the service can read them but other users on the box cannot.

## Special bits — setuid, setgid, sticky

```bash
ls -l /usr/bin/passwd
# -rwsr-xr-x 1 root root 68208 ... /usr/bin/passwd
```

The `s` in place of `x` is **setuid** — when this binary runs, it runs as the _owner_ (root) regardless of who launched it. That is how an unprivileged user can change their password (which requires writing to `/etc/shadow`, owned by root).

`setuid` is dangerous — every setuid binary on the system is a privilege escalation surface. Audit them with:

```bash
find / -perm -4000 -type f 2>/dev/null
```

The **sticky bit** on a directory (e.g., `/tmp` is `drwxrwxrwt`) means "anyone can write here, but you can only delete files you own." That is why `/tmp` works as a shared scratch space.

## Mount points and disks

A filesystem is a tree, but the tree may span multiple disks. `mount` shows the splice points:

```bash
$ mount | column -t
/dev/sda1  on  /         type ext4   (rw,relatime,errors=remount-ro)
tmpfs      on  /run      type tmpfs  (rw,nosuid,nodev,size=399768k)
/dev/sda2  on  /var      type ext4   (rw,relatime)
```

Or more readably:

```bash
df -h
# Filesystem      Size  Used Avail Use% Mounted on
# /dev/sda1        38G  4.2G   32G  12% /
# tmpfs           390M  1.2M  389M   1% /run
```

When `df` says you are out of space, you are out of space on a _specific filesystem_. `/` being full does not necessarily mean `/var` is.

## Hidden files

Anything starting with `.` is hidden by `ls`. `ls -a` shows them.

```bash
ls -la ~
# .bashrc, .ssh/, .config/ — all hidden by convention.
```

Convention only. The kernel does not care. The shell's `ls` and globs ignore them so you do not see your dotfiles in every directory listing.

## Practical: locate a config file fast

You know nginx is installed but cannot remember where its config lives:

```bash
which nginx                    # /usr/sbin/nginx
nginx -t                       # tests config and prints its path
dpkg -L nginx | grep '\.conf'  # all conf files the package shipped
ls -la /etc/nginx/             # the standard place
```

Three or four commands and you have a complete map.

## Recap

- The FHS is the same on every distro. Learn it once.
- Files are inodes; names are pointers. Hard links share an inode, symlinks point at a path.
- Permissions are owner/group/other × read/write/execute. Octal is faster to read than `rwx`.
- Ownership pairs an owner and a group. Services run as dedicated users.
- `setuid` is rare and risky. The sticky bit on a directory means "your files only."
- `df` and `mount` show what is mounted where; out-of-space is per-filesystem.

Next chapter: what a "process" actually is on Linux, and why your app is not special.

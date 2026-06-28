---
title: 'nginx Fundamentals'
subtitle: 'Install, structure the config, write server blocks, understand locations and includes. The nginx mental model that holds for every advanced feature.'
chapter: 6
level: 'intermediate'
readingTime: '13 min'
topics: ['nginx', 'configuration', 'server blocks', 'locations']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why nginx

nginx is fast, stable, has been deployed at every scale from one VPS to global CDNs, runs on a vanishing amount of CPU, and has a config language that makes sense once you have read this chapter. It is the standard answer for "what serves my static files and proxies my app." This chapter teaches the structure; later chapters add reverse proxying, caching, performance tuning.

<Callout type="info">

**Real-World Analogy**

nginx is like a traffic cop at an intersection — it directs each request to the right lane without touching the cargo inside.

</Callout>

## Installing on Debian/Ubuntu

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

Verify:

```bash
curl -i http://localhost/
# HTTP/1.1 200 OK
# Server: nginx/1.24.0
# ...
# Welcome to nginx!
```

The default config serves `/usr/share/nginx/html/index.html` (or `/var/www/html/index.nginx-debian.html` on Debian). You will replace this.

## The file layout

```text
/etc/nginx/
├── nginx.conf              # main config — usually minimal
├── conf.d/                 # custom global configs
├── sites-available/        # virtual host files (you write these)
├── sites-enabled/          # symlinks to sites-available (active hosts)
├── modules-enabled/        # dynamic modules
├── snippets/               # reusable config snippets
├── mime.types              # extension → MIME type map
└── fastcgi_params, uwsgi_params, scgi_params

/var/log/nginx/
├── access.log
└── error.log

/var/cache/nginx/           # default cache directory
/var/www/html/              # default document root
```

The Debian convention of `sites-available` + `sites-enabled` (symlinks) is a neat way to enable/disable virtual hosts:

```bash
# Disable a site without deleting it:
sudo rm /etc/nginx/sites-enabled/example.com
sudo systemctl reload nginx
```

## The config grammar

nginx's config is a tree of _directives_ and _blocks_. Three rules:

1. **Directives end with `;`.**
2. **Blocks open with `{` and close with `}`.**
3. **Directives only work inside the right context.** A `server` directive only makes sense inside an `http` block. nginx tells you when you put one in the wrong place.

```nginx
# Top level — this is the "main" context
worker_processes auto;
error_log /var/log/nginx/error.log warn;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    keepalive_timeout 65;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

Three contexts you will see immediately:

- **main** — worker count, error log, PID file.
- **events** — connection-handling tuning.
- **http** — everything HTTP-related: server blocks, MIME types, sendfile, gzip, caching.

Inside `http`:

- **server** — a virtual host. One per domain, or one per port, or both.
- **upstream** — a named pool of backend servers (for proxying).
- **map** — variable transformations.

Inside `server`:

- **location** — a path-prefix or regex match for routing within this host.

## Your first server block

A static site at `example.com`:

```nginx
# /etc/nginx/sites-available/example.com
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    root /var/www/example.com;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` tests the config without applying it — always run this before reload. A bad config can take down all your sites.

## Reading the server block, line by line

```nginx
listen 80;
listen [::]:80;
```

Listen on TCP port 80 over IPv4 and IPv6. The `[::]` is IPv6's `0.0.0.0`. Without explicit IPv6, you only listen on IPv4.

```nginx
server_name example.com www.example.com;
```

Match these exact hostnames in the `Host` header. nginx's virtual hosting works entirely off `Host`. A request to `other.com` will not be served by this block; it falls back to the _default_ server (or returns 404 if none matches).

```nginx
root /var/www/example.com;
index index.html;
```

`root` is the document root. A request for `/about/team.html` looks for `/var/www/example.com/about/team.html`. `index index.html` says when a request is `/some/dir/`, try `index.html` inside it.

```nginx
location / {
    try_files $uri $uri/ =404;
}
```

For any path, try the file at `$uri`, then a directory at `$uri/`, otherwise 404. This is the standard SPA-fallback-free pattern; for a single-page app you would write `try_files $uri /index.html;` to fall back to the SPA shell.

```nginx
location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff2)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

`~*` is a case-insensitive regex match. Anything with these extensions gets a 30-day cache lifetime.

## location matching — the rules in order

`location` blocks compete for each request. nginx picks one and only one to serve. The rules:

1. **Exact match (`=`)** — wins immediately if it matches.

   ```nginx
   location = / { ... }       # only the literal `/`
   location = /favicon.ico { ... }
   ```

2. **Prefix match (no modifier)** — longest-prefix match wins.

   ```nginx
   location /api/ { ... }     # everything starting with /api/
   location / { ... }         # catch-all
   ```

3. **Preferential prefix (`^~`)** — like prefix, but wins over regex.

   ```nginx
   location ^~ /static/ { ... }  # do not even try regexes
   ```

4. **Regex match (`~` case-sensitive, `~*` case-insensitive)** — first match wins.
   ```nginx
   location ~ \.php$ { ... }
   location ~* \.(jpg|png)$ { ... }
   ```

The actual matching algorithm:

1. Find the longest `=` match. If found, use it. Done.
2. Find the longest prefix match (including `^~`). Remember it.
3. If the longest prefix was `^~`, use it. Done.
4. Otherwise, walk regex blocks in order. First match wins.
5. If no regex matched, use the prefix from step 2.

This is one of the few quirks of nginx — once you know the algorithm, it is predictable; without it, "why is _this_ block matching?" is mysterious.

## Variables — the language under the language

nginx has a small built-in DSL with variables. Some of the common ones:

| Variable          | Meaning                                                           |
| ----------------- | ----------------------------------------------------------------- |
| `$uri`            | The current URI (rewritten if you used `rewrite`).                |
| `$request_uri`    | The original URI as the client sent it.                           |
| `$args`           | The query string.                                                 |
| `$host`           | The Host header (lowercased).                                     |
| `$server_name`    | The matched server_name.                                          |
| `$remote_addr`    | The client's IP (or proxy's, see `set_real_ip_from`).             |
| `$scheme`         | `http` or `https`.                                                |
| `$request_method` | `GET`, `POST`, etc.                                               |
| `$http_<header>`  | Any request header — `$http_user_agent`, `$http_x_forwarded_for`. |
| `$cookie_<name>`  | A specific cookie value.                                          |
| `$arg_<name>`     | A specific query-string argument.                                 |

Use them in directives:

```nginx
add_header X-Request-ID $request_id;
log_format main '$remote_addr "$request" $status $bytes_sent';
return 301 https://$host$request_uri;
```

## Includes — keep the config readable

Repeated patterns belong in `snippets/` or `conf.d/`. Example: a snippet for security headers:

```nginx
# /etc/nginx/snippets/security-headers.conf
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-XSS-Protection "0" always;
```

In the server block:

```nginx
server {
    listen 80;
    server_name example.com;
    include snippets/security-headers.conf;
    # ...
}
```

Now the same headers ship from every site you serve, without copy/paste.

`always` on `add_header` means "include this even on error responses (4xx, 5xx)." Without it, a 500 response from your backend skips the header — undesirable.

## The default server — what catches unmatched requests

If a request's `Host` does not match any `server_name`, nginx uses the **default** server. By default, that is the _first_ server block defined. To make it explicit:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;            # close connection without a response
}
```

This catches scanner traffic that hits your IP directly (without a real domain) and quietly drops it. Cleaner than serving them your default site.

## Reload, test, and roll back

The development cycle:

```bash
sudo nano /etc/nginx/sites-available/example.com
sudo nginx -t                              # verify config
sudo systemctl reload nginx                # apply without downtime
```

`reload` sends `SIGHUP` to nginx — the master forks new workers with the new config and gracefully retires the old ones. Active connections finish on the old workers. Zero-downtime config changes.

If reload fails:

```text
nginx: [emerg] "server" directive is not allowed here in /etc/nginx/sites-available/example.com:5
nginx: configuration file /etc/nginx/nginx.conf test failed
```

The reload aborted; the previous config is still running. Fix the file, run `nginx -t` again, retry the reload.

## Logs to watch

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
sudo journalctl -u nginx -f
```

Access logs record every request; error logs record failures, timeouts, malformed requests, upstream errors. When something is wrong, `error.log` is almost always the first place to look.

## Common mistakes

- **Forgetting `nginx -t` before reload.** Eventually you ship a typo and reload fails. Make `nginx -t` muscle memory.
- **Editing in `sites-enabled`.** That directory should only contain symlinks. Edit in `sites-available`, the symlink picks it up.
- **Multiple `default_server` declarations on the same `listen`.** nginx refuses to start.
- **Forgetting `always` on `add_header`.** Headers vanish on error pages.
- **Setting `worker_connections` too high.** Multiplied by `worker_processes`, it caps total simultaneous connections; but each connection consumes a file descriptor, so raise `worker_rlimit_nofile` to match.

## A tidy production layout

```text
/etc/nginx/
├── nginx.conf
├── conf.d/
│   ├── gzip.conf
│   ├── log_format.conf
│   └── proxy_defaults.conf
├── snippets/
│   ├── security-headers.conf
│   ├── ssl-modern.conf
│   └── letsencrypt.conf
├── sites-available/
│   ├── example.com
│   ├── api.example.com
│   └── _default
└── sites-enabled/
    ├── example.com -> ../sites-available/example.com
    ├── api.example.com -> ../sites-available/api.example.com
    └── _default -> ../sites-available/_default
```

One file per site. Shared config in `conf.d/` (loaded automatically) and `snippets/` (included by hand). A `_default` server that catches scanner traffic. This scales to dozens of sites without becoming hostile to read.

## Recap

- nginx config is a tree of directives and blocks, organized by context (main, events, http, server, location).
- A `server` block is a virtual host matched by `server_name`. A `location` block routes within a host.
- `location` matching has a defined order — exact, prefix, `^~`, regex, longest-prefix fallback.
- Variables (`$uri`, `$host`, etc.) and `add_header always` cover most everyday work.
- `nginx -t` then `systemctl reload nginx` for zero-downtime config changes.
- Use `sites-available`/`sites-enabled` and `snippets/` to keep config readable.

Next chapter: putting nginx in front of an application server — the reverse proxy pattern that ties everything together.

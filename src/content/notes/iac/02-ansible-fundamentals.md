---
title: "Ansible Fundamentals"
subtitle: "Inventories, playbooks, roles, and variables — configuring servers reliably without installing an agent."
chapter: 2
level: "beginner"
readingTime: "12 min"
topics: ["Ansible", "playbooks", "roles", "inventory", "handlers", "templates"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A stage director with a script: they don't perform every action themselves — they give instructions to the right actors (hosts), in the right order (tasks), with the flexibility to handle different characters differently (variables and conditionals). Ansible is the director; your servers are the cast.

</Callout>

## How Ansible Works

Ansible is agentless — it SSHes into target machines and runs tasks. No daemon to install on managed nodes. Requirements: SSH access from the control node, Python on the target.

```
Control node (your laptop or CI server)
  → SSH to managed nodes
  → Copies and runs Python modules
  → Reports results back
  → Applies changes to reach desired state
```

## Inventory

The inventory defines which hosts Ansible manages and how to reach them:

```ini
# inventory/hosts.ini

[web]
web-1.example.com
web-2.example.com ansible_user=ubuntu

[db]
db-primary.example.com ansible_user=postgres ansible_port=2222

[all:vars]
ansible_user=admin
ansible_ssh_private_key_file=~/.ssh/deploy_key

[production:children]
web
db
```

**Dynamic inventory** (for cloud environments — hosts change as you scale):
```bash
# AWS dynamic inventory
ansible-inventory -i aws_ec2.yml --list

# aws_ec2.yml
plugin: aws_ec2
regions:
  - us-east-1
filters:
  instance-state-name: running
  tag:Environment: production
keyed_groups:
  - key: tags.Role     # group by Role tag: [tag_Role_web], [tag_Role_db]
```

## Playbooks

A playbook is a list of plays. Each play applies tasks to a group of hosts.

```yaml
# site.yml
---
- name: Configure web servers
  hosts: web
  become: true           # sudo
  vars:
    app_port: 3000
    nginx_worker_processes: auto

  tasks:
    - name: Update apt cache
      apt:
        update_cache: true
        cache_valid_time: 3600  # only update if cache is > 1hr old

    - name: Install packages
      apt:
        name:
          - nginx
          - certbot
          - python3-certbot-nginx
        state: present

    - name: Create app user
      user:
        name: appuser
        system: true
        shell: /usr/sbin/nologin

    - name: Deploy nginx config
      template:
        src: templates/nginx.conf.j2
        dest: /etc/nginx/sites-available/myapp
        owner: root
        group: root
        mode: '0644'
      notify: Reload nginx     # triggers handler only if this task changed something

    - name: Enable nginx site
      file:
        src: /etc/nginx/sites-available/myapp
        dest: /etc/nginx/sites-enabled/myapp
        state: link

  handlers:
    - name: Reload nginx
      service:
        name: nginx
        state: reloaded        # reload (not restart) — avoids dropping connections
```

```bash
# Run the playbook
ansible-playbook -i inventory/hosts.ini site.yml

# Dry run — show what would change
ansible-playbook -i inventory/hosts.ini site.yml --check --diff

# Limit to specific hosts
ansible-playbook -i inventory/hosts.ini site.yml --limit web-1.example.com

# Run specific tags
ansible-playbook -i inventory/hosts.ini site.yml --tags nginx
```

## Templates (Jinja2)

Templates let you generate config files with variables:

```jinja2
{# templates/nginx.conf.j2 #}
upstream app {
    {% for i in range(app_instances) %}
    server 127.0.0.1:{{ app_port + i }};
    {% endfor %}
}

server {
    listen 80;
    server_name {{ domain_name }};

    location / {
        proxy_pass http://app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    access_log /var/log/nginx/{{ app_name }}.access.log;
    error_log  /var/log/nginx/{{ app_name }}.error.log;
}
```

Variables come from: playbook vars, inventory vars, group_vars, host_vars, or passed at runtime.

## Variables and Precedence

```yaml
# group_vars/web.yml — applies to all hosts in [web] group
app_port: 3000
nginx_worker_processes: auto
log_level: warn

# group_vars/production.yml — overrides for production
log_level: error

# host_vars/web-1.example.com.yml — overrides for specific host
nginx_worker_connections: 2048
```

Ansible variable precedence (lower number = lower priority, overridden by higher):
```
1. Role defaults
2. Inventory vars
3. group_vars
4. host_vars
5. Play vars
6. Task vars (highest — use sparingly)
```

## Roles

Roles are reusable, self-contained units of Ansible content. Instead of one giant playbook, roles organize tasks by function.

```
roles/
  nginx/
    tasks/
      main.yml        # entry point
      install.yml
      configure.yml
    handlers/
      main.yml
    templates/
      nginx.conf.j2
      vhost.conf.j2
    defaults/
      main.yml        # default variable values
    vars/
      main.yml        # role-specific variables (higher precedence than defaults)
    files/
      dhparam.pem     # static files to copy
```

```yaml
# roles/nginx/tasks/main.yml
---
- import_tasks: install.yml
- import_tasks: configure.yml

# roles/nginx/tasks/install.yml
---
- name: Install nginx
  apt:
    name: nginx
    state: present

# roles/nginx/defaults/main.yml
---
nginx_worker_processes: auto
nginx_worker_connections: 1024
nginx_keepalive_timeout: 65
```

```yaml
# Use roles in a playbook
- name: Configure web servers
  hosts: web
  become: true
  roles:
    - nginx
    - { role: certbot, domain: myapp.com }
    - node_app
```

## Handlers

Handlers run only when notified — and only once, at the end of the play, even if notified multiple times:

```yaml
tasks:
  - name: Deploy nginx.conf
    template:
      src: nginx.conf.j2
      dest: /etc/nginx/nginx.conf
    notify: Reload nginx

  - name: Deploy vhost config
    template:
      src: vhost.conf.j2
      dest: /etc/nginx/sites-available/myapp
    notify: Reload nginx  # notified twice, but handler runs once

handlers:
  - name: Reload nginx
    service:
      name: nginx
      state: reloaded
```

If neither task changes anything (because the config is already correct), the handler never runs. This is idempotency in action.

## Secrets with Ansible Vault

Never put passwords or API keys in plaintext YAML:

```bash
# Encrypt a file
ansible-vault encrypt group_vars/production/secrets.yml

# Edit encrypted file
ansible-vault edit group_vars/production/secrets.yml

# Run playbook with vault password
ansible-playbook site.yml --vault-password-file ~/.vault_pass
# or
ansible-playbook site.yml --ask-vault-pass
```

```yaml
# group_vars/production/secrets.yml (encrypted at rest)
db_password: "{{ vault_db_password }}"
api_key: "{{ vault_api_key }}"

# group_vars/production/vars.yml (plaintext, references vault vars)
database_url: "postgresql://app:{{ db_password }}@db.internal/mydb"
```

Store `vault_pass` in CI secrets, not in the repo. The encrypted files can be committed safely.

## A Complete Server Provisioning Example

```yaml
# provision-web-server.yml
---
- name: Provision web server
  hosts: web
  become: true

  vars_files:
    - group_vars/all/secrets.yml

  roles:
    - common           # base packages, users, sshd config, ufw
    - nginx            # install, configure
    - node             # install node via nvm
    - app              # deploy application, systemd unit

  post_tasks:
    - name: Verify app is running
      uri:
        url: "http://localhost:3000/health"
        status_code: 200
      retries: 5
      delay: 5
```

Run against a new server after it's provisioned:
```bash
ansible-playbook \
  -i "newserver.example.com," \  # comma = treat as list, not file
  provision-web-server.yml \
  --private-key ~/.ssh/deploy_key
```

The same playbook that configures a new server can be re-run later to apply config changes or update the application. Idempotent all the way down.


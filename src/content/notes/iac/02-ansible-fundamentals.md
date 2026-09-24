---
title: 'Ansible Fundamentals'
subtitle: 'Inventory, playbook, role, আর variable — কোনো agent install না করেই নির্ভরযোগ্যভাবে server configure করা।'
chapter: 2
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['Ansible', 'playbooks', 'roles', 'inventory', 'handlers', 'templates']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

script হাতে একজন stage director: তিনি প্রতিটা কাজ নিজে করেন না — তিনি সঠিক actor-দের (host) সঠিক ক্রমে (task) নির্দেশ দেন, আর ভিন্ন character-কে ভিন্নভাবে সামলানোর নমনীয়তা রাখেন (variable আর conditional)। Ansible হলো director; আপনার server-গুলো হলো cast।

</Callout>

## গল্পে বুঝি

সিনার একটা নামকরা রেস্তোরাঁর চেইন — শহরের নানা মহল্লায় ছড়ানো অনেকগুলো শাখার রান্নাঘর, প্রতিটাই আগে থেকে চালু। সমস্যা হলো, প্রতিটা শাখার রান্না একেক রকম হয়ে যাচ্ছিল। তাই সিনা একটা লিখিত নির্দেশনা-শিট বানালেন, ধাপে ধাপে সাজানো: "১. কাউন্টার ঘষে পরিষ্কার করো, ২. মসলার তাক ভরাও, ৩. চুলা জ্বালাও"। তারপর একজন দৌড়বিদ ছেলেকে দিয়ে প্রতিটা শাখায় হুবহু একই শিট পাঠিয়ে দিলেন। শাখায় কোনো স্থায়ী লোক বসিয়ে রাখতে হয়নি — দৌড়বিদ শুধু শিটটা পৌঁছে দিয়ে রাঁধুনিকে ধাপগুলো ধরিয়ে দিয়ে আসে।

মজার ব্যাপার হলো, কোনো ধাপ যদি আগে থেকেই করা থাকে — ধরুন মসলার তাক আগেই ভরা — রাঁধুনি সেটা টুক করে টপকে যায়, নতুন করে কিছু বদলায় না। তাই একই শিট আজ পাঠান, কাল পাঠান, পরশু পাঠান — কোনো ক্ষতি নেই; যেটুকু বাকি সেটুকুই ঠিক হয়, বাকিটা যেমন আছে তেমনই থাকে। খোয়ারিজমি চাইলে শুধু নতুন খোলা শাখাটায়ও একই শিট পাঠিয়ে সেটাকে সবার সাথে মিলিয়ে দিতে পারেন।

এই গল্পটাই আসলে **Ansible**। ধাপে ধাপে সাজানো নির্দেশনা-শিটটাই হলো একটা **playbook**, যার প্রতিটা লাইন একেকটা **task**। শিটটা চালু শাখাগুলোয় পাঠানোটাই **push-based config** — Ansible আপনার control node থেকে চালু server-গুলোতে **SSH** দিয়ে গিয়ে task চালায়। দৌড়বিদের জন্য শাখায় স্থায়ী কেউ লাগে না — এটাই **agentless**, target-এ কোনো daemon বসাতে হয় না। "আগে থেকে করা ধাপ টপকে যাও, কিছু বদলায় না" — এটাই **idempotency**, একই playbook বারবার চালালেও শুধু যা desired state-এ নেই সেটুকুই বদলায়। আর কোন কোন শাখায় শিট যাবে তার তালিকাটাই **inventory**। বাস্তবে ঠিক এভাবেই টিমগুলো Ansible দিয়ে ডজন ডজন চালু server-কে একই কনফিগে standardize করে — নতুন কোনো agent install না করেই।

## Ansible কীভাবে কাজ করে

Ansible agentless — এটা target মেশিনে SSH করে আর task চালায়। Managed node-এ কোনো daemon install করতে হয় না। প্রয়োজন: control node থেকে SSH access, target-এ Python।

```
Control node (your laptop or CI server)
  → SSH to managed nodes
  → Copies and runs Python modules
  → Reports results back
  → Applies changes to reach desired state
```

## Inventory

Inventory define করে Ansible কোন host manage করে আর কীভাবে সেগুলোতে পৌঁছায়:

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

**Dynamic inventory** (cloud environment-এর জন্য — scale করার সাথে host বদলায়):

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

## Playbook

একটা playbook হলো play-এর একটা list। প্রতিটা play একদল host-এ task apply করে।

```yaml
# site.yml
---
- name: Configure web servers
  hosts: web
  become: true # sudo
  vars:
    app_port: 3000
    nginx_worker_processes: auto

  tasks:
    - name: Update apt cache
      apt:
        update_cache: true
        cache_valid_time: 3600 # only update if cache is > 1hr old

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
      notify: Reload nginx # triggers handler only if this task changed something

    - name: Enable nginx site
      file:
        src: /etc/nginx/sites-available/myapp
        dest: /etc/nginx/sites-enabled/myapp
        state: link

  handlers:
    - name: Reload nginx
      service:
        name: nginx
        state: reloaded # reload (not restart) — avoids dropping connections
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

## Template (Jinja2)

Template দিয়ে আপনি variable সহ config file generate করতে পারেন:

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

Variable আসে: playbook vars, inventory vars, group_vars, host_vars থেকে, কিংবা runtime-এ পাস করা হয়।

## Variable আর Precedence

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

Ansible variable precedence (ছোট নম্বর = কম priority, বড় নম্বর দিয়ে override হয়):

```
1. Role defaults
2. Inventory vars
3. group_vars
4. host_vars
5. Play vars
6. Task vars (highest — use sparingly)
```

## Role

Role হলো পুনর্ব্যবহারযোগ্য, স্বয়ংসম্পূর্ণ Ansible content-এর unit। একটা বিশাল playbook-এর বদলে role task-গুলোকে function অনুযায়ী সাজায়।

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

## Handler

Handler কেবল notify হলেই চলে — আর একবারই, play-এর শেষে, একাধিকবার notify হলেও:

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
    notify: Reload nginx # notified twice, but handler runs once

handlers:
  - name: Reload nginx
    service:
      name: nginx
      state: reloaded
```

যদি কোনো task-ই কিছু পরিবর্তন না করে (কারণ config আগে থেকেই সঠিক), তাহলে handler কখনো চলে না। এটাই idempotency বাস্তবে।

## Ansible Vault দিয়ে Secrets

কখনো plaintext YAML-এ password বা API key রাখবেন না:

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
db_password: '{{ vault_db_password }}'
api_key: '{{ vault_api_key }}'

# group_vars/production/vars.yml (plaintext, references vault vars)
database_url: 'postgresql://app:{{ db_password }}@db.internal/mydb'
```

`vault_pass` CI secrets-এ রাখুন, repo-তে নয়। Encrypted file-গুলো নিরাপদে commit করা যায়।

## একটা সম্পূর্ণ Server Provisioning উদাহরণ

```yaml
# provision-web-server.yml
---
- name: Provision web server
  hosts: web
  become: true

  vars_files:
    - group_vars/all/secrets.yml

  roles:
    - common # base packages, users, sshd config, ufw
    - nginx # install, configure
    - node # install node via nvm
    - app # deploy application, systemd unit

  post_tasks:
    - name: Verify app is running
      uri:
        url: 'http://localhost:3000/health'
        status_code: 200
      retries: 5
      delay: 5
```

একটা নতুন server provision হওয়ার পর সেটার ওপর চালান:

```bash
ansible-playbook \
  -i "newserver.example.com," \  # comma = treat as list, not file
  provision-web-server.yml \
  --private-key ~/.ssh/deploy_key
```

যে playbook একটা নতুন server configure করে সেটাই পরে আবার চালিয়ে config পরিবর্তন apply করা বা application আপডেট করা যায়। একেবারে নিচ পর্যন্ত idempotent।

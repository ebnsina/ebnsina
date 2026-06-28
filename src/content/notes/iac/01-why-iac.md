---
title: 'Why Infrastructure as Code'
subtitle: 'The problems with manual infrastructure — drift, undocumented state, unrepeatable environments — and how IaC solves them.'
chapter: 1
level: 'beginner'
readingTime: '7 min'
topics: ['IaC', 'infrastructure', 'Terraform', 'Ansible', 'drift', 'idempotency']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A recipe vs cooking from memory: if you cook from memory, each time the dish comes out slightly different and nobody else can replicate it. A written recipe produces the same dish reliably, can be shared across a team, reviewed for improvements, and versioned when you change the ingredients. Infrastructure as Code is your recipe for servers.

</Callout>

## The Manual Infrastructure Problem

The traditional workflow: SSH into a server, run commands, hope you remember what you did. This creates several compounding problems.

**Snowflake servers:** Each server becomes unique over time — different package versions, config files modified in different ways, manual tweaks nobody documented. When it fails, you can't reproduce it. When you need a second one, you can't clone it exactly.

**Configuration drift:** Servers that were identical when provisioned diverge over weeks as different engineers apply different patches, change settings, or install tools. Production has packages that staging doesn't. Staging has config that dev doesn't. "Works on my machine" extends to "works in staging but not production."

**No audit trail:** `apt install nginx`, `vim /etc/nginx/nginx.conf` — who did this, when, why? `git log` tells you nothing because the changes never went through version control.

**Fear of change:** If the current server state is fragile, undocumented, and hard to reproduce, nobody wants to touch it. Patches get delayed. Security updates are skipped. "If it ain't broke, don't fix it" becomes the policy because nobody knows what would break it.

## What IaC Provides

**Declarative state:** You declare what you want (`database: postgres 15, users: [app, replica]`) rather than the steps to get there. The tool figures out what needs to change.

**Idempotency:** Run the same playbook or plan 10 times — the result is the same. No side effects from re-running. Safe to apply repeatedly.

**Version control:** Infrastructure changes go through the same PR process as application code. Review, approve, audit, revert.

**Repeatability:** The same code that built staging builds production. No manual differences. No "I did some extra steps on production that I forgot to document."

**Self-documenting:** The current state of your infrastructure is defined in files you can read. No more SSH'ing around to understand what's installed.

## The IaC Landscape

Three different levels of abstraction:

**Configuration Management (Ansible, Chef, Puppet):**
Manage software and config _on existing servers_. SSH into a machine, ensure packages are installed, config files have the right content, services are running.

```yaml
# Ansible: ensure nginx is installed and running
- name: Install nginx
  apt:
    name: nginx
    state: present

- name: Configure nginx
  template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
  notify: Restart nginx

- name: Ensure nginx is running
  service:
    name: nginx
    state: started
    enabled: true
```

**Infrastructure Provisioning (Terraform, Pulumi, CloudFormation):**
Create and manage cloud resources — VMs, networks, databases, load balancers, DNS. Terraform talks to cloud APIs; it doesn't SSH into machines.

```hcl
# Terraform: provision an EC2 instance
resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.medium"

  vpc_security_group_ids = [aws_security_group.web.id]
  subnet_id              = aws_subnet.public.id

  tags = {
    Name        = "web-server"
    Environment = "production"
  }
}
```

**Container Orchestration (Kubernetes, ECS):**
Define how containers run — replicas, resources, health checks, networking. Kubernetes manifests are also infrastructure as code.

Most teams use a combination: Terraform to provision cloud infrastructure, Ansible or cloud-init to configure servers, Kubernetes or ECS for application workloads.

## Idempotency in Practice

An idempotent operation produces the same result regardless of how many times you run it. This is the core property that makes IaC safe.

```yaml
# Ansible: idempotent — checks state before acting
- name: Create app user
  user:
    name: appuser
    state: present
    system: true
# Run 1: user doesn't exist → creates it
# Run 2: user exists → does nothing
# Run 3: user exists → does nothing
```

Compare to a shell script:

```bash
# NOT idempotent — fails on second run
useradd appuser     # Run 1: succeeds
useradd appuser     # Run 2: "user already exists" error
```

IaC tools check current state and only apply changes needed to reach the desired state.

## Drift Detection

Even with IaC, someone might SSH in and make a manual change. Drift detection finds these:

```bash
# Terraform: show what would change if you applied now
terraform plan

# If output shows "0 to add, 0 to change, 0 to destroy": no drift
# If it shows changes: someone modified infra outside Terraform

# Ansible: check mode — runs without making changes, shows what would change
ansible-playbook site.yml --check --diff
```

Schedule drift detection in CI:

```yaml
# GitHub Actions: daily drift check
- name: Check for infrastructure drift
  run: terraform plan -detailed-exitcode
  # Exit code 0: no changes
  # Exit code 1: error
  # Exit code 2: changes detected — alert
```

## The Workflow

```
Change needed → Write code → PR review → Apply to staging → Verify → Apply to prod
     ↑                                                                      |
     └──────────────────── Monitor, discover drift ────────────────────────┘
```

Infrastructure changes should never go directly to production without going through staging. The IaC code is the single source of truth — if it's not in code, it shouldn't be on the server.

## IaC Anti-Patterns

**Manual fixes "just this once":** The most common path to drift. One SSH fix leads to another, and soon the IaC no longer reflects reality.

**Storing state locally:** Terraform's state file tracks what it has created. If it's on a developer's laptop, the team can't collaborate. Use remote state (S3, Terraform Cloud).

**No testing:** Apply to prod without testing in staging. IaC needs the same discipline as application code.

**Monolithic configs:** One massive Terraform file or one Ansible playbook for everything. Hard to understand, hard to change safely. Modularize.

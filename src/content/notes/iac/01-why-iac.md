---
title: 'Infrastructure as Code কেন'
subtitle: 'Manual infrastructure-এর সমস্যা — drift, undocumented state, unrepeatable environment — আর IaC কীভাবে সেগুলো সমাধান করে।'
chapter: 1
level: 'beginner'
readingTime: '7 মিনিট'
topics: ['IaC', 'infrastructure', 'Terraform', 'Ansible', 'drift', 'idempotency']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা একজন wedding planner, আর তার আয়োজন করা প্রতিটা বিয়ের অনুষ্ঠান হয় একদম নিখুঁত। তার রহস্য একটাই — প্রতিটা ইভেন্ট সে চালায় একটা লিখে রাখা বিস্তারিত checklist ধরে। ভেন্যুর সাজসজ্জা, খাবারের মেনু, অতিথিদের বসার বিন্যাস, সময়সূচি — প্রতিটা সিদ্ধান্ত কাগজে লেখা। ফলে তার টিমের যে কোনো সহকর্মী সেই checklist হাতে নিয়ে হুবহু একই অনুষ্ঠান আবার আয়োজন করতে পারে, ফাতিমা নিজে না থাকলেও। বিয়ের আগেই সবাই মিলে checklist পড়ে দেখে, ভুল ধরে, উন্নতির পরামর্শ দেয় — অনুষ্ঠানের দিন নয়, তার অনেক আগেই। আর যদি বিয়ের ঠিক আগমুহূর্তে ভেন্যু হাতছাড়া হয়ে যায়, ওই একই কাগজ দেখে সে অন্য কোথাও পুরো অনুষ্ঠান নতুন করে দাঁড় করিয়ে ফেলে।

উল্টোদিকে খোয়ারিজমি নামের আরেকজন planner সব কিছু করে স্মৃতি থেকে, মুখে মুখে সিদ্ধান্ত নিয়ে। একটা অনুষ্ঠানে সে ফুলের সাজ দেয় এক রকম, পরেরটায় ভুলে যায়। কোনো কিছু লেখা নেই বলে অন্য কেউ তার কাজ হাতে নিতে পারে না, আগে থেকে কেউ review-ও করতে পারে না। তার দুটো অনুষ্ঠান কখনো একরকম হয় না, আর ভেন্যু বদলে গেলে সে পুরো ব্যাপারটা মাথা চুলকে নতুন করে ভাবতে বসে।

এই গল্পটাই আসলে **Infrastructure as Code**। ফাতিমার লিখে রাখা checklist হলো code-এ define করা infrastructure — যে কোনো সহকর্মীর হুবহু একই অনুষ্ঠান আবার বানানো মানে **reproducible** environment; আগে থেকে checklist পড়ে ভুল ধরা আর উন্নতি করা মানে **version control**-এ রাখা, **review**-যোগ্য পরিবর্তন; আর কাগজ দেখে অন্য জায়গায় পুরো অনুষ্ঠান দাঁড় করানো মানে infrastructure পুরোপুরি **rebuildable**। অন্যদিকে খোয়ারিজমির স্মৃতি থেকে improvise করা হলো manual click-ops — server-এ SSH করে হাতে হাতে বদল, যা document হয় না, **drift** করে, আর দুটো environment কখনো এক হয় না। বাস্তবে Terraform বা Ansible দিয়ে ঠিক এভাবেই infrastructure একটা code file-এ লিখে রাখা হয়, যেন যে কোনো টিমমেট সেই file থেকে হুবহু একই environment বারবার তৈরি করতে পারে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

রেসিপি বনাম স্মৃতি থেকে রান্না: আপনি যদি স্মৃতি থেকে রান্না করেন, প্রতিবার খাবারটা একটু আলাদা হয় আর অন্য কেউ সেটা হুবহু বানাতে পারে না। লিখে রাখা রেসিপি প্রতিবার একই খাবার নির্ভরযোগ্যভাবে বানায়, টিমের সাথে share করা যায়, উন্নতির জন্য review করা যায়, আর উপকরণ বদলালে version করা যায়। Infrastructure as Code হলো server-এর জন্য আপনার রেসিপি।

</Callout>

## Manual Infrastructure-এর সমস্যা

গতানুগতিক workflow: server-এ SSH করা, command চালানো, আর আশা করা যে আপনি কী করেছিলেন মনে থাকবে। এটা কয়েকটা জমতে থাকা সমস্যা তৈরি করে।

**Snowflake server:** প্রতিটা server সময়ের সাথে আলাদা হয়ে যায় — ভিন্ন package version, ভিন্নভাবে modify করা config file, কেউ document না করা manual tweak। যখন এটা fail করে, আপনি সেটা reproduce করতে পারেন না। যখন আপনার আরেকটা লাগে, আপনি সেটা হুবহু clone করতে পারেন না।

**Configuration drift:** যেসব server provision করার সময় একদম identical ছিল, সেগুলো সপ্তাহখানেকের মধ্যে আলাদা হয়ে যায় কারণ বিভিন্ন engineer বিভিন্ন patch apply করে, setting বদলায়, কিংবা tool install করে। Production-এ এমন package আছে যা staging-এ নেই। Staging-এ এমন config আছে যা dev-এ নেই। "Works on my machine" প্রসারিত হয়ে হয় "staging-এ কাজ করে কিন্তু production-এ না।"

**কোনো audit trail নেই:** `apt install nginx`, `vim /etc/nginx/nginx.conf` — কে এটা করল, কখন, কেন? `git log` আপনাকে কিছুই বলে না কারণ পরিবর্তনগুলো কখনো version control-এর মধ্য দিয়ে যায়নি।

**পরিবর্তনের ভয়:** বর্তমান server state যদি ভঙ্গুর, undocumented, আর reproduce করা কঠিন হয়, তাহলে কেউ সেটাকে ছুঁতে চায় না। Patch পিছিয়ে যায়। Security update বাদ পড়ে। "If it ain't broke, don't fix it" নীতি হয়ে দাঁড়ায় কারণ কেউ জানে না কী করলে এটা ভেঙে পড়বে।

## IaC যা দেয়

**Declarative state:** কীভাবে সেখানে পৌঁছাবেন সেই ধাপগুলোর বদলে আপনি কী চান তা declare করেন (`database: postgres 15, users: [app, replica]`)। Tool বের করে কী পরিবর্তন করা দরকার।

**Idempotency:** একই playbook বা plan ১০ বার চালান — ফলাফল একই থাকে। বারবার চালানোর কোনো side effect নেই। বারবার apply করা নিরাপদ।

**Version control:** Infrastructure পরিবর্তন application code-এর মতোই একই PR process-এর মধ্য দিয়ে যায়। Review, approve, audit, revert।

**Repeatability:** যে code staging বানিয়েছে সেই code-ই production বানায়। কোনো manual পার্থক্য নেই। "production-এ কিছু বাড়তি ধাপ করেছিলাম যেটা document করতে ভুলে গেছি" — এমন কিছু নেই।

**Self-documenting:** আপনার infrastructure-এর বর্তমান state এমন file-এ define করা যা আপনি পড়তে পারেন। কী install করা আছে বুঝতে আর SSH করে ঘোরাঘুরি করতে হয় না।

## IaC-এর Landscape

তিনটা ভিন্ন level-এর abstraction:

**Configuration Management (Ansible, Chef, Puppet):**
_বিদ্যমান server-এ_ software আর config manage করে। একটা মেশিনে SSH করা, নিশ্চিত করা যে package install করা আছে, config file-এ সঠিক content আছে, service চলছে।

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
Cloud resource তৈরি ও manage করা — VM, network, database, load balancer, DNS। Terraform cloud API-এর সাথে কথা বলে; এটা মেশিনে SSH করে না।

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
Container কীভাবে চলবে তা define করা — replica, resource, health check, networking। Kubernetes manifest-ও infrastructure as code।

বেশিরভাগ টিম একটা combination ব্যবহার করে: cloud infrastructure provision করতে Terraform, server configure করতে Ansible বা cloud-init, আর application workload-এর জন্য Kubernetes বা ECS।

## বাস্তবে Idempotency

একটা idempotent operation যতবারই চালান একই ফলাফল দেয়। এই core property-ই IaC-কে নিরাপদ করে।

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

একটা shell script-এর সাথে তুলনা করুন:

```bash
# NOT idempotent — fails on second run
useradd appuser     # Run 1: succeeds
useradd appuser     # Run 2: "user already exists" error
```

IaC tool বর্তমান state যাচাই করে আর কেবল desired state-এ পৌঁছাতে যে পরিবর্তন দরকার সেটুকুই apply করে।

## Drift Detection

IaC থাকলেও কেউ হয়তো SSH করে একটা manual পরিবর্তন করে ফেলতে পারে। Drift detection এগুলো খুঁজে বের করে:

```bash
# Terraform: show what would change if you applied now
terraform plan

# If output shows "0 to add, 0 to change, 0 to destroy": no drift
# If it shows changes: someone modified infra outside Terraform

# Ansible: check mode — runs without making changes, shows what would change
ansible-playbook site.yml --check --diff
```

CI-তে drift detection schedule করুন:

```yaml
# GitHub Actions: daily drift check
- name: Check for infrastructure drift
  run: terraform plan -detailed-exitcode
  # Exit code 0: no changes
  # Exit code 1: error
  # Exit code 2: changes detected — alert
```

## Workflow

```
Change needed → Write code → PR review → Apply to staging → Verify → Apply to prod
     ↑                                                                      |
     └──────────────────── Monitor, discover drift ────────────────────────┘
```

Infrastructure পরিবর্তন staging-এর মধ্য দিয়ে না গিয়ে কখনোই সরাসরি production-এ যাওয়া উচিত না। IaC code হলো single source of truth — যদি এটা code-এ না থাকে, তাহলে সেটা server-এও থাকা উচিত না।

## IaC Anti-Pattern

**"just this once" বলে manual fix:** Drift-এর দিকে সবচেয়ে সাধারণ পথ। একটা SSH fix আরেকটার দিকে নিয়ে যায়, আর অল্প সময়েই IaC আর বাস্তবতাকে প্রতিফলিত করে না।

**State locally রাখা:** Terraform-এর state file track করে এটা কী কী তৈরি করেছে। এটা যদি কোনো developer-এর laptop-এ থাকে, তাহলে টিম collaborate করতে পারে না। Remote state ব্যবহার করুন (S3, Terraform Cloud)।

**কোনো testing নেই:** Staging-এ test না করেই prod-এ apply করা। IaC-এর application code-এর মতোই একই discipline দরকার।

**Monolithic config:** সবকিছুর জন্য একটা বিশাল Terraform file বা একটা Ansible playbook। বোঝা কঠিন, নিরাপদে বদলানো কঠিন। Modularize করুন।

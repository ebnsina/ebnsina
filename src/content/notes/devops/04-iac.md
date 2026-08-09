---
title: 'Infrastructure as Code'
subtitle: 'Terraform, declarative infrastructure, state management — আপনার cloud resource-গুলো version-controlled ফাইলে ডিফাইন করুন।'
chapter: 4
level: 'intermediate'
readingTime: '14 মিনিট'
topics: ['Terraform', 'IaC', 'infrastructure', 'cloud']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ইবনে সিনা একটা কমিউনিটি রান্নাঘর চালু করতে চান — শহরের নানা জায়গায় হুবহু একই সেটআপের রান্নাঘর। প্রথম রান্নাঘরটা তিনি নিজে হাতে সাজালেন: চুলা কোথায়, মশলার তাক কোন দেয়ালে, পানির লাইন কোন কোণে। কাজ চলল ঠিকঠাক। কিন্তু দ্বিতীয় জায়গায় গিয়ে দেখা গেল, রাঁধুনি আল-খোয়ারিজমি নিজের স্মৃতি থেকে সাজাতে গিয়ে মশলার তাকটা ভুল দেয়ালে বসিয়ে ফেলেছেন, আর ছুরি রাখার ড্রয়ারটা একদমই ভুলে গেছেন। তৃতীয় রান্নাঘরটা আরও আলাদা হয়ে গেল। কোনো দুটো রান্নাঘরই এক রকম হলো না।

তখন ফাতিমা আল-ফিহরি একটা মাস্টার রেসিপি-কার্ড লিখলেন — একটা লিখিত ব্লুপ্রিন্ট। কোথায় কোন জিনিস, কী মাপে, কোন ক্রমে বসবে, সব হুবহু লেখা। এখন যে কেউ সেই কার্ড হাতে নিয়ে যেকোনো জায়গায় গিয়ে একদম এক রকম রান্নাঘর দাঁড় করাতে পারে — প্রতিবার, নির্ভুলভাবে। কার্ডটা বানানোর আগেই সবাই মিলে বসে পড়ে দেখে নিতে পারে, ভুল ধরতে পারে, উন্নতি করতে পারে। আর একটা রান্নাঘর আগুনে পুড়ে গেলেও কার্ড থেকে হুবহু আবার বানিয়ে ফেলা যায়।

এই লিখিত রেসিপি-কার্ডটাই হলো **Infrastructure as Code** — সার্ভার, নেটওয়ার্ক, রিসোর্স সব একটা declarative ফাইলে ডিফাইন করা। যেকোনো জায়গায় হুবহু একই রান্নাঘর মানে **reproducible infrastructure**। কার্ড আগে থেকে পড়ে-রিভিউ করে version control-এ রাখাটাই **version-controlled ও reviewable** ইনফ্রাস্ট্রাকচার। আর স্মৃতি থেকে হাতে হাতে সাজানো — যেখানে প্রতিবার একটু আলাদা হয়ে drift তৈরি হয় — সেটাই ম্যানুয়াল click-ops। বাস্তবে **Terraform** ঠিক এই রেসিপি-কার্ডের কাজটাই করে: আপনি কোডে desired state লিখে দেন, Terraform প্রতিবার হুবহু সেই ইনফ্রাস্ট্রাকচার দাঁড় করিয়ে দেয়।

## Infrastructure as Code কেন?

Cloud console-এ ক্লিক করে করে resource বানানো:

- **রিপ্রোডিউসিবল নয়**: পুরো ইনফ্রাস্ট্রাকচার আপনি কি একদম শূন্য থেকে আবার বানাতে পারবেন?
- **অডিটেবল নয়**: কে কী, কখন বদলালো?
- **স্কেলেবল নয়**: নতুন একটা environment সেটআপ মানে আবার সবকিছুতে ক্লিক করা

IaC এটার সমাধান দেয়: ইনফ্রাস্ট্রাকচার কোডে ডিফাইন করুন, Git-এ রাখুন, আর একটা পাইপলাইনের মধ্য দিয়ে চেঞ্জ apply করুন।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

ব্লুপ্রিন্ট দেখে বাড়ি বানানোর মতো — মিস্ত্রিকে মুখে মুখে বলার বদলে আপনি তাকে হুবহু প্ল্যান দিয়ে দিচ্ছেন। একই ব্লুপ্রিন্ট থেকে যে কেউ একই বাড়ি বানাতে পারবে। পুড়ে গেলে প্ল্যান থেকে হুবহু আবার বানিয়ে ফেলুন।

</Callout>

## Terraform-এর বেসিক

Terraform একটা declarative ভাষা (HCL) ব্যবহার করে desired state বর্ণনা করতে। আপনি বলেন "আমার একটা database চাই," Terraform বের করে নেয় কীভাবে সেটা বানাতে হবে।

```hcl
# main.tf — declare what you want
provider "aws" {
  region = "us-east-1"
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"

  tags = {
    Name        = "production"
    Environment = "prod"
  }
}

resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_db_instance" "postgres" {
  identifier     = "app-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t3.medium"
  allocated_storage = 50

  db_name  = "myapp"
  username = var.db_username
  password = var.db_password

  vpc_security_group_ids = [aws_security_group.db.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  backup_retention_period = 7
  multi_az               = true
  skip_final_snapshot    = false
}
```

## Terraform ওয়ার্কফ্লো

```typescript
// 1. terraform init — download providers
// 2. terraform plan — preview changes (diff)
// 3. terraform apply — make changes
// 4. terraform destroy — tear everything down

// Plan output shows exactly what will change:
// + aws_db_instance.postgres will be created
// ~ aws_security_group.db will be updated
//   - ingress rule: 5432 from 10.0.0.0/16
//   + ingress rule: 5432 from 10.0.0.0/8
// - aws_instance.old_server will be destroyed
```

## State Management

Terraform কী কী ম্যানেজ করছে তা একটা **state file**-এ ট্র্যাক করে রাখে। এটা আপনার config-কে বাস্তব cloud resource-এর সাথে map করে।

```typescript
// State file records:
// "aws_db_instance.postgres" → "arn:aws:rds:us-east-1:123:db:app-db"
// Without state, Terraform doesn't know what exists

// Remote state (required for teams):
// Store state in S3/GCS with locking (DynamoDB/Cloud Storage)
```

```hcl
# backend.tf — store state remotely
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "prod/infrastructure.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"  # prevents concurrent applies
    encrypt        = true
  }
}
```

<Callout type="warning">

**কখনো state ম্যানুয়ালি এডিট করবেন না** আর কখনো এটা Git-এ রাখবেন না। locking সহ remote state ব্যবহার করুন। locking ছাড়া দুজন মানুষ একসাথে `terraform apply` চালালে আপনার state, আর সম্ভবত আপনার ইনফ্রাস্ট্রাকচারও নষ্ট হয়ে যাবে।

</Callout>

## Modules: পুনর্ব্যবহারযোগ্য ইনফ্রাস্ট্রাকচার

```hcl
# modules/api-service/main.tf
variable "name" {}
variable "image" {}
variable "cpu" { default = 256 }
variable "memory" { default = 512 }

resource "aws_ecs_service" "api" {
  name            = var.name
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 2
  # ...
}

# Usage:
module "user_api" {
  source = "./modules/api-service"
  name   = "user-api"
  image  = "myregistry/user-api:v1.2.3"
  cpu    = 512
  memory = 1024
}

module "order_api" {
  source = "./modules/api-service"
  name   = "order-api"
  image  = "myregistry/order-api:v2.0.1"
}
```

<Callout type="tip">

**প্রতিটি PR-এ CI-তে `terraform plan` চালান।** plan-এর output PR কমেন্ট হিসেবে পোস্ট করুন, যাতে রিভিউয়াররা ঠিক দেখতে পারে কোডটা কী কী ইনফ্রাস্ট্রাকচার চেঞ্জ করবে। শুধু main-এ merge হলেই apply করুন।

</Callout>

## মূল কথা

1. **IaC ইনফ্রাস্ট্রাকচারকে রিপ্রোডিউসিবল করে** — কোড থেকে গোটা environment দাঁড় করান
2. **`apply`-এর আগে `terraform plan`** — কী বদলাবে তা সবসময় রিভিউ করুন
3. **locking সহ remote state** টিমের জন্য বাধ্যতামূলক — corruption ঠেকায়
4. **Modules** আপনাকে প্রজেক্ট জুড়ে ইনফ্রাস্ট্রাকচার প্যাটার্ন পুনর্ব্যবহার করতে দেয়

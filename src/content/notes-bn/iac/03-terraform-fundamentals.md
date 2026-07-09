---
title: 'Terraform Fundamentals'
subtitle: 'Resource, state, provider, module, আর plan/apply workflow যা cloud provisioning-কে reproducible করে।'
chapter: 3
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['Terraform', 'HCL', 'state', 'providers', 'modules', 'plan', 'apply']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

নির্মাণের আগে অনুমোদিত একজন architect-এর blueprint: প্রথমে আপনি plan আঁকেন (terraform plan), কেউ সেটা review করে, তারপর crew সেটা বানায় (terraform apply)। আপনি কংক্রিট ঢালা শুরু করে চলতে চলতে বুঝে নেন না। Blueprint হলো source of truth — building হলো artifact।

</Callout>

## মূল ধারণা

**Provider:** যে plugin একটা API-এর সাথে কথা বলে (AWS, GCP, Hetzner, Cloudflare)। HCL-কে API call-এ অনুবাদ করে।

**Resource:** Terraform-এর manage করা একটা একক infrastructure object (একটা EC2 instance, একটা DNS record, একটা database)।

**State:** Terraform একটা state file-এ track করে এটা কী কী তৈরি করেছে। কী আছে, কী বদলেছে, কী destroy করতে হবে তা জানার জন্য দরকার।

**Plan:** Terraform কী করবে তার একটা preview — create, modify, বা destroy — সেটা করার আগেই।

**Apply:** Plan execute করা, infrastructure-এ আসল পরিবর্তন করা।

## মৌলিক Structure

```
project/
  main.tf          # resources
  variables.tf     # input variable declarations
  outputs.tf       # output value declarations
  terraform.tf     # required providers, terraform settings
  terraform.tfvars # variable values (gitignored for secrets)
```

```hcl
# terraform.tf
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state — required for team use
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

provider "aws" {
  region = var.aws_region
}
```

## Resource

```hcl
# main.tf

# VPC
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true

  tags = {
    Name        = "main"
    Environment = var.environment
  }
}

# Subnet
resource "aws_subnet" "public" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id    # reference to VPC above
  cidr_block        = cidrsubnet("10.0.0.0/16", 8, count.index)
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name = "public-${var.availability_zones[count.index]}"
  }
}

# EC2 instance
resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type

  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.web.id]
  key_name               = aws_key_pair.deploy.key_name

  user_data = file("scripts/user-data.sh")

  tags = {
    Name        = "web-${var.environment}"
    Environment = var.environment
  }

  lifecycle {
    create_before_destroy = true   # create new, then destroy old (zero-downtime replace)
  }
}

# Data source: look up an existing resource (not managed by Terraform)
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]  # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-*-22.04-amd64-server-*"]
  }
}
```

## Variable আর Output

```hcl
# variables.tf
variable "environment" {
  type        = string
  description = "Deployment environment"
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "instance_type" {
  type    = string
  default = "t3.medium"
}

variable "availability_zones" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}

variable "db_password" {
  type      = string
  sensitive = true   # masked in plan output and logs
}
```

```hcl
# outputs.tf
output "web_public_ip" {
  value       = aws_instance.web.public_ip
  description = "Public IP of the web server"
}

output "db_endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = true
}
```

```hcl
# terraform.tfvars (gitignored — contains environment-specific values)
environment  = "production"
instance_type = "t3.xlarge"
db_password  = "secret"   # better: use SSM or environment variable
```

```bash
# Or pass sensitive values via environment variables
export TF_VAR_db_password="secret"
```

## Workflow

```bash
# 1. Initialize — download providers, configure backend
terraform init

# 2. Validate syntax
terraform validate

# 3. Format code
terraform fmt -recursive

# 4. Plan — preview changes
terraform plan -out=tfplan
# Output:
# Plan: 3 to add, 1 to change, 0 to destroy.

# 5. Review the plan (especially for production)
# Post plan output to PR for team review

# 6. Apply the plan
terraform apply tfplan

# 7. Check state
terraform state list
terraform show
```

**Production-এ কখনো plan এড়িয়ে যাবেন না।** একটা plan সস্তা; একটা দুর্ঘটনাবশত `destroy` নয়।

## State Management

State হলো Terraform কী কী তৈরি করেছে তার রেকর্ড। এটা configuration-কে আসল resource-এর সাথে map করে।

**টিমের জন্য remote state আবশ্যক:**

```bash
# Configure S3 backend (in terraform.tf)
# Create the bucket first (bootstrap problem — create manually or with a separate config)
aws s3 mb s3://my-terraform-state
aws s3api put-bucket-versioning \
  --bucket my-terraform-state \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption \
  --bucket my-terraform-state \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"}}]}'

# State locking (prevents simultaneous applies)
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

**State command:**

```bash
# List resources in state
terraform state list

# Show details of a specific resource
terraform state show aws_instance.web

# Move resource (rename without recreating)
terraform state mv aws_instance.web aws_instance.web_server

# Remove from state (stop managing without destroying)
terraform state rm aws_instance.web

# Import existing resource into state
terraform import aws_instance.web i-1234567890abcdef0
```

## Module

Module হলো Terraform configuration-এর পুনর্ব্যবহারযোগ্য package:

```hcl
# modules/web-server/main.tf
resource "aws_instance" "this" {
  ami           = var.ami
  instance_type = var.instance_type
  subnet_id     = var.subnet_id
  # ...
}

resource "aws_security_group" "this" {
  name   = "${var.name}-sg"
  vpc_id = var.vpc_id
  # ...
}

# modules/web-server/variables.tf
variable "name" {}
variable "ami" {}
variable "instance_type" { default = "t3.medium" }
variable "vpc_id" {}
variable "subnet_id" {}

# modules/web-server/outputs.tf
output "instance_id" { value = aws_instance.this.id }
output "public_ip"   { value = aws_instance.this.public_ip }
```

```hcl
# Use the module
module "web" {
  source = "./modules/web-server"  # local path

  name          = "web-prod"
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.xlarge"
  vpc_id        = aws_vpc.main.id
  subnet_id     = aws_subnet.public[0].id
}

output "web_ip" {
  value = module.web.public_ip
}
```

**Public registry module** (সাবধানে ব্যবহার করুন — বিশ্বাস করার আগে audit করুন):

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.2"  # always pin version

  name = "main"
  cidr = "10.0.0.0/16"
  azs  = ["us-east-1a", "us-east-1b"]
}
```

## Workspace

Workspace দিয়ে আপনি একই configuration থেকে একাধিক environment manage করতে পারেন:

```bash
# Create workspace per environment
terraform workspace new staging
terraform workspace new production

# Switch workspace
terraform workspace select production

# Use workspace name in config
resource "aws_instance" "web" {
  instance_type = terraform.workspace == "production" ? "t3.xlarge" : "t3.small"

  tags = {
    Environment = terraform.workspace
  }
}
```

বিকল্প: ভিন্ন `tfvars` দিয়ে প্রতি environment-এ আলাদা state file। দুটো approach-ই কাজ করে — workspace সহজতর, আলাদা config শক্তিশালী isolation দেয়।

## CI/CD Integration

```yaml
# GitHub Actions: Terraform CI
- name: Terraform plan
  run: |
    terraform init
    terraform plan -out=tfplan -no-color 2>&1 | tee plan.txt

- name: Post plan to PR
  uses: actions/github-script@v7
  with:
    script: |
      const plan = require('fs').readFileSync('plan.txt', 'utf8');
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `<details><summary>Terraform Plan</summary>\n\n\`\`\`\n${plan}\n\`\`\`\n</details>`,
      });

# Apply only on merge to main
- name: Terraform apply
  if: github.ref == 'refs/heads/main'
  run: terraform apply tfplan
```

কোনো মানুষ plan review না করে কখনো production-এ auto-apply করবেন না। দ্রুত feedback-এর জন্য staging-এ auto-apply ঠিক আছে।

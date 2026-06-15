---
title: "Infrastructure as Code"
subtitle: "Terraform, declarative infrastructure, state management — define your cloud resources in version-controlled files."
chapter: 4
level: "intermediate"
readingTime: "14 min"
topics: ["Terraform", "IaC", "infrastructure", "cloud"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Infrastructure as Code?

Clicking through cloud consoles to create resources is:
- **Not reproducible**: can you recreate your entire infrastructure from scratch?
- **Not auditable**: who changed what, when?
- **Not scalable**: setting up a new environment means clicking through everything again

IaC solves this: define infrastructure in code, store it in Git, and apply changes through a pipeline.

<Callout type="info">

**Real-World Analogy**

Like building a house from blueprints — instead of telling the builder verbally, you give them exact plans. Anyone can build the same house from the same blueprints. If it burns down, rebuild exactly from the plans.

</Callout>

## Terraform Basics

Terraform uses a declarative language (HCL) to describe desired state. You say "I want a database," Terraform figures out how to create it.

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

## The Terraform Workflow

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

Terraform tracks what it's managing in a **state file**. This maps your config to real cloud resources.

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

**Never edit state manually** and never store it in Git. Use remote state with locking. If two people run `terraform apply` simultaneously without locking, you'll corrupt your state and potentially your infrastructure.

</Callout>

## Modules: Reusable Infrastructure

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

**Run `terraform plan` in CI on every PR.** Post the plan output as a PR comment so reviewers can see exactly what infrastructure changes the code will make. Only apply on merge to main.

</Callout>

## Key Takeaways

1. **IaC makes infrastructure reproducible** — spin up entire environments from code
2. **`terraform plan` before `apply`** — always review what will change
3. **Remote state with locking** is mandatory for teams — prevents corruption
4. **Modules** let you reuse infrastructure patterns across projects


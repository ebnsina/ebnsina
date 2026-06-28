---
title: 'Terraform Patterns & Production'
subtitle: 'Module composition, environments, secrets, drift detection, and the practices that keep large Terraform codebases manageable.'
chapter: 4
level: 'intermediate'
readingTime: '10 min'
topics: ['Terraform', 'modules', 'environments', 'secrets', 'drift', 'refactoring']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

An engineering firm with standard building components: they don't design a new elevator from scratch for each project — they use a certified, tested design and compose it with other standard components. Terraform module composition works the same way: reliable, tested modules composed into environment-specific configurations.

</Callout>

## Repository Structure for Scale

Single flat config works for small projects. For multiple services and environments:

```
infrastructure/
  modules/
    vpc/              # reusable VPC module
    web-server/       # reusable EC2 + security group
    rds-postgres/     # reusable RDS setup
    redis-cluster/    # reusable ElastiCache

  environments/
    staging/
      main.tf         # composes modules for staging
      terraform.tfvars
      backend.tf      # staging state bucket

    production/
      main.tf         # composes modules for production (different sizes)
      terraform.tfvars
      backend.tf      # production state bucket

  global/
    dns/              # Route53 zones (shared across environments)
    iam/              # IAM roles and policies
```

```hcl
# environments/production/main.tf
module "vpc" {
  source = "../../modules/vpc"
  name   = "production"
  cidr   = "10.0.0.0/16"
  azs    = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

module "web" {
  source        = "../../modules/web-server"
  name          = "web-production"
  instance_type = "t3.xlarge"
  instance_count = 3
  vpc_id        = module.vpc.vpc_id
  subnet_ids    = module.vpc.public_subnet_ids
}

module "db" {
  source        = "../../modules/rds-postgres"
  name          = "production"
  instance_class = "db.m5.xlarge"
  multi_az      = true
  vpc_id        = module.vpc.vpc_id
  subnet_ids    = module.vpc.private_subnet_ids
}
```

## Secrets Management

Never put secrets in `.tfvars` files or Terraform state in plaintext.

**AWS SSM Parameter Store:**

```hcl
# Reference SSM parameters instead of hardcoding
data "aws_ssm_parameter" "db_password" {
  name            = "/myapp/production/db_password"
  with_decryption = true
}

resource "aws_db_instance" "main" {
  password = data.aws_ssm_parameter.db_password.value
}
```

```bash
# Store secret in SSM (done once, manually or via separate process)
aws ssm put-parameter \
  --name /myapp/production/db_password \
  --value "supersecret" \
  --type SecureString \
  --key-id alias/aws/ssm
```

**AWS Secrets Manager:**

```hcl
data "aws_secretsmanager_secret_version" "db_creds" {
  secret_id = "production/myapp/db"
}

locals {
  db_creds = jsondecode(data.aws_secretsmanager_secret_version.db_creds.secret_string)
}

resource "aws_db_instance" "main" {
  username = local.db_creds["username"]
  password = local.db_creds["password"]
}
```

**Mark outputs as sensitive** to prevent them appearing in logs:

```hcl
output "db_endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = true
}
```

## Preventing Accidental Destruction

`lifecycle` blocks protect critical resources:

```hcl
resource "aws_db_instance" "main" {
  # ...

  lifecycle {
    prevent_destroy = true   # terraform destroy will error on this resource
  }
}

resource "aws_s3_bucket" "uploads" {
  # ...

  lifecycle {
    prevent_destroy       = true
    ignore_changes        = [tags]  # don't detect drift in tags (changed manually)
    create_before_destroy = true    # for resources that can't be updated in-place
  }
}
```

**Targeted applies for risky changes:**

```bash
# Only apply changes to specific resources — don't touch everything
terraform apply -target=aws_instance.web -target=aws_security_group.web

# Review: what would be destroyed?
terraform plan -destroy
```

## Refactoring Without Destroying

Renaming a resource in HCL would destroy and recreate it — unless you move it in state first:

```hcl
# Before: resource "aws_instance" "app"
# After rename: resource "aws_instance" "web"

# Without state move: Terraform would destroy "app" and create "web"
# With state move: Terraform knows they're the same resource

terraform state mv aws_instance.app aws_instance.web
# Now: terraform plan shows 0 to add, 0 to destroy
```

**`moved` block (Terraform 1.1+) — the declarative way:**

```hcl
# main.tf — document the rename in code
moved {
  from = aws_instance.app
  to   = aws_instance.web
}
```

The `moved` block is committed to the repo — other team members get the state move automatically when they apply, rather than having to run `terraform state mv` manually.

## Drift Detection in CI

```yaml
# .github/workflows/drift.yml
name: Drift Detection
on:
  schedule:
    - cron: '0 8 * * *' # every morning at 8am

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        run: terraform init
        working-directory: environments/production

      - name: Check for drift
        id: plan
        run: |
          terraform plan -detailed-exitcode -no-color 2>&1
        working-directory: environments/production
        continue-on-error: true

      - name: Alert on drift
        if: steps.plan.outputs.exitcode == '2'
        run: |
          curl -X POST $SLACK_WEBHOOK \
            -d '{"text":"⚠️ Infrastructure drift detected in production"}'
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
```

Exit codes: `0` = no changes, `1` = error, `2` = changes detected (drift).

## Testing Infrastructure Code

**`terraform validate`:** Syntax and type checking. Fast, no API calls.

**`terraform plan`:** Actual diff against current state. Requires credentials.

**Terratest** (Go-based integration testing):

```go
// test/web_server_test.go
func TestWebServer(t *testing.T) {
    opts := &terraform.Options{
        TerraformDir: "../modules/web-server",
        Vars: map[string]interface{}{
            "instance_type": "t3.micro",
            "name":          "test",
        },
    }

    // Destroy after test
    defer terraform.Destroy(t, opts)
    terraform.InitAndApply(t, opts)

    ip := terraform.Output(t, opts, "public_ip")

    // Verify the server is reachable and responding
    url := fmt.Sprintf("http://%s/health", ip)
    http_helper.HttpGetWithRetry(t, url, nil, 200, "ok", 30, 5*time.Second)
}
```

Run integration tests in CI against an isolated test environment (separate account or namespace). Tear down after test completes.

## The 10 Rules for Maintainable Terraform

```
1. Remote state — never local state in a team
2. State locking — prevent concurrent applies (DynamoDB for S3 backend)
3. Pin provider versions — ~> 5.0 not >= 5.0
4. Pin module versions — especially public registry modules
5. One environment per directory — not workspace-only separation
6. Separate state per layer — networking in one state, apps in another
7. Use data sources for cross-stack references — not hardcoded IDs
8. Mark sensitive outputs — prevent secret leakage in CI logs
9. prevent_destroy on data — databases, S3 buckets, DNS zones
10. Plan before every apply — especially in production, always with review
```

**Cross-stack data sources:**

```hcl
# networking stack outputs VPC ID
output "vpc_id" { value = aws_vpc.main.id }

# app stack reads it via remote state
data "terraform_remote_state" "networking" {
  backend = "s3"
  config = {
    bucket = "my-terraform-state"
    key    = "production/networking/terraform.tfstate"
    region = "us-east-1"
  }
}

resource "aws_instance" "web" {
  vpc_security_group_ids = [aws_security_group.web.id]
  subnet_id = data.terraform_remote_state.networking.outputs.public_subnet_ids[0]
}
```

This gives you decoupled stacks that reference each other without being in the same state file — so a networking change doesn't require touching the app stack at all.

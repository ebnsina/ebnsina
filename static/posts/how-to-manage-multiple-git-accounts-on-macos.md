---
title: How to Manage Multiple Git Accounts (GitHub & Bitbucket) on macOS
date: '2025-08-01'
tags: ['git', 'github', 'bitbucket', 'ssh', 'macos']
excerpt: Learn how to configure and manage multiple Git accounts (personal and work) on your M1 Mac using SSH keys and Git configuration.
---

Managing multiple Git accounts (e.g., one for personal GitHub and another for work Bitbucket or GitHub) can be challenging without proper configuration. This guide will show you how to set up and manage multiple Git accounts cleanly on macOS (M1) using SSH keys and Git configuration to avoid authentication conflicts.

---

## Generate SSH Keys for Each Account

```sh
# For personal GitHub
ssh-keygen -t ed25519 -C "your_personal_email@example.com" -f ~/.ssh/id_ed25519_github

# For work Bitbucket
ssh-keygen -t ed25519 -C "your_work_email@example.com" -f ~/.ssh/id_ed25519_bitbucket
```

This creates two key pairs:

```sh
~/.ssh/id_ed25519_github (personal)

~/.ssh/id_ed25519_bitbucket (work)
```

## Add Public Keys to Your Git Accounts

### GitHub (Personal)
1. Go to GitHub → Settings → SSH and GPG keys
2. Add contents of:
```sh
cat ~/.ssh/id_ed25519_github.pub
```

### Bitbucket (Work)
1. Go to Bitbucket → Personal Settings → SSH Keys
2. Add contents of:

Add contents of:

```sh
cat ~/.ssh/id_ed25519_bitbucket.pub

## Configure SSH Config File

Edit or create `~/.ssh/config` and add:
```

```sh
# Personal GitHub
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github
  IdentitiesOnly yes

# Work Bitbucket
Host bitbucket.org
  HostName bitbucket.org
  User git
  IdentityFile ~/.ssh/id_ed25519_bitbucket
  IdentitiesOnly yes
```

Tip: This allows Git to auto-select the right key depending on the remote host.

## Test Your Setup

```sh
# Test GitHub (personal)
ssh -T git@github.com

# Test Bitbucket (work)
ssh -T git@bitbucket.org
If it works, you’ll see a success message like:

Hi your_username! You've successfully authenticated...
```

## Git Config Setup
First, set your global config to personal (default):
```sh
git config --global user.name "Your Personal Name"
git config --global user.email "your_personal_email@example.com"
```

Then, for work repositories, override the config locally:
Navigate to your work repository and run:

```sh
git config user.name "Your Work Name"
git config user.email "your_work_email@company.com"
```

This affects only that repo and avoids identity leaks.

## Updating Existing Repositories (Optional)
If your remote URLs are using HTTPS, you'll need to change them to SSH:

### For Bitbucket repositories:
```sh
git remote set-url origin git@bitbucket.org:company/repo.git
```

### For GitHub repositories:
```sh
git remote set-url origin git@github.com:username/repo.git
```

## Bonus: Verify Active Identity Per Repo
Run this inside a repo:

```sh
git config user.name
git config user.email
```
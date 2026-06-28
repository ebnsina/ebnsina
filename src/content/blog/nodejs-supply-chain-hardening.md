---
title: "Hardening Your Node.js Supply Chain: A Practical Playbook"
description: "Migrating package managers, enabling supply-chain guards, and building a security baseline that survives real-world threats."
date: 2026-05-12
tags: ["security", "nodejs", "supply-chain", "pnpm"]
minutesRead: 13
---

<script>
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## Introduction

The JavaScript ecosystem moves fast — and so do the people trying to exploit it. Between typosquatted packages, hijacked maintainer accounts, malicious `postinstall` scripts, and leaked CI secrets, a modern Node.js project carries far more risk than its `package.json` suggests.

This guide walks through two complementary upgrades every serious project should consider:

1. **Migrating from npm to pnpm**, with the new `minimum-release-age` setting acting as a supply-chain circuit breaker.
2. **A full security hardening checklist** spanning dependencies, secrets, CI/CD, runtime code, build artifacts, and repository hygiene.

The advice is framework-agnostic and applies equally to libraries, applications, and monorepos.

<Mermaid
	title="Supply-chain checkpoints"
	code={`
graph LR
  D["Developer"] --> LF["pnpm install<br/>lockfile + release-age guard"]
  LF --> A["Audit<br/>provenance · advisories"]
  A --> CI["CI<br/>pinned · no postinstall"]
  CI --> REG["Registry<br/>signed publish"]
  REG --> P["Production"]
`}
/>

---

## Part 1 — Migrating from npm to pnpm

pnpm offers three things npm doesn't: a content-addressable global store (faster installs, less disk), a strict non-flattened `node_modules` (catches phantom dependencies early), and — as of version 10 — a built-in **release-age supply-chain guard**.

### 1.1 Install pnpm

The recommended path is Corepack, which ships with Node.js 16.10+ and pins the package manager version per project:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

If Corepack is unavailable, a global install works fine:

```bash
npm install -g pnpm
```

Either way, confirm the version:

```bash
pnpm --version   # must be >= 10 for minimum-release-age
```

### 1.2 Clean npm artifacts

Before switching, remove npm's working state:

```bash
rm -rf node_modules package-lock.json
```

Keep `package.json`. If a `pnpm-lock.yaml` already exists in the repo, leave it alone.

### 1.3 Optionally import the existing lockfile

To preserve the exact resolved versions npm chose, run:

```bash
pnpm import
rm package-lock.json
```

Skip this step if you'd prefer pnpm resolve everything from scratch.

### 1.4 Install dependencies

```bash
pnpm install
```

This produces `pnpm-lock.yaml` and a symlinked `node_modules` directory backed by pnpm's global content-addressable store.

### 1.5 Pin the package manager version

In `package.json`:

```json
{
  "packageManager": "pnpm@10.0.0",
  "engines": {
    "node": ">=18",
    "pnpm": ">=10"
  }
}
```

The `packageManager` field is honored by Corepack, ensuring every contributor and CI runner uses the same pnpm version automatically.

### 1.6 Configure `minimum-release-age`

This is the single most impactful supply-chain setting available today. It blocks installation of any package version published within the last *N* minutes — long enough for security researchers and the npm registry's own scanners to flag malicious releases before they land in your build.

Create a `.npmrc` at the repo root:

```ini
# Block packages published less than 7 days ago
# Value is in minutes: 7 * 24 * 60 = 10080
minimum-release-age=10080

# Comma-separated package names exempt from the gate
# Use sparingly, only for trusted first-party packages
minimum-release-age-exclude=my-internal-pkg,another-trusted-pkg
```

Common values:

| Window  | Minutes |
| ------- | ------- |
| 1 day   | 1440    |
| 3 days  | 4320    |
| 7 days  | 10080   |
| 14 days | 20160   |
| 30 days | 43200   |

Seven days is a reasonable starting point for most teams: long enough to catch the vast majority of compromised releases, short enough to avoid blocking legitimate security patches.

### 1.7 Update CI

Three small changes:

- Replace `npm ci` with `pnpm install --frozen-lockfile`.
- Replace `npm run X` with `pnpm run X` (or `pnpm X`).
- In GitHub Actions, install pnpm **before** Node so caching works:

```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 10
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: pnpm
- run: pnpm install --frozen-lockfile
```

### 1.8 Update hooks, scripts, and Docker

Anywhere your tooling invokes `npx`, switch to `pnpm exec` or `pnpm dlx`. Husky pre-commit and pre-push hooks should call `pnpm test`, `pnpm run lint`, etc. Dockerfiles need pnpm installed (typically via Corepack) before running `pnpm install --frozen-lockfile`.

### 1.9 Commit the migration

```bash
git rm package-lock.json
git add package.json pnpm-lock.yaml .npmrc
git commit -m "migrate npm to pnpm with minimum-release-age gate"
```

### 1.10 Verify

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
```

If everything passes, the migration is complete.

### 1.11 Common Pitfalls

A few rough edges to watch for:

- **Strict `node_modules`.** pnpm doesn't flatten dependencies, so any package you import without declaring in `package.json` (a "phantom dependency") will fail to resolve. Add them explicitly.
- **Peer dependencies.** pnpm warns about unmet peers. Either install them explicitly or set `auto-install-peers=true` in `.npmrc`.
- **Fresh upgrades blocked by the age gate.** Bumping a dependency to a brand-new release will fail until the threshold passes. Either wait, or temporarily add the package to `minimum-release-age-exclude`.
- **`postinstall` scripts.** pnpm 10 disables them by default for non-allowlisted packages. Approve trusted ones via `pnpm approve-builds` or list them under `pnpm.onlyBuiltDependencies` in `package.json`.
- **Monorepos.** Replace the `workspaces` field in `package.json` with `pnpm-workspace.yaml`:

  ```yaml
  packages:
    - "packages/*"
    - "apps/*"
  ```

- **CI cache keys.** Any cache keyed on `package-lock.json` must be re-keyed to hash `pnpm-lock.yaml`.

### 1.12 Useful `.npmrc` Extras

```ini
# Auto-install peer deps (pnpm <10 default behavior)
auto-install-peers=true

# Stricter peer resolution
strict-peer-dependencies=true

# Use a single shared store across projects
store-dir=~/.pnpm-store

# Hoist nothing (max strictness, catches phantom deps early)
hoist=false
```

### 1.13 Allowing build scripts

pnpm 10+ blocks `preinstall` / `install` / `postinstall` scripts by default. Native modules like `esbuild`, `sharp`, `better-sqlite3`, and `node-sass` need their build scripts to function — you must explicitly allowlist them. **Where** that allowlist lives depends on whether your repo is a single package or a workspace. Get this wrong and `pnpm install` fails with confusing errors.

#### Single-package repo (no monorepo)

There is **no `pnpm-workspace.yaml`**. Put the allowlist in `package.json`:

```json
{
  "name": "my-app",
  "pnpm": {
    "onlyBuiltDependencies": [
      "esbuild",
      "sharp"
    ]
  }
}
```

An empty array opts in to the strict default — no scripts run at all:

```json
{
  "pnpm": {
    "onlyBuiltDependencies": []
  }
}
```

Add packages only when an install fails with `ERR_PNPM_IGNORED_BUILDS` and you've verified the package is trusted.

> **Gotcha:** Do not create an empty `pnpm-workspace.yaml` just to hold this setting. pnpm requires a `packages:` field in any workspace file and will fail with `packages field missing or empty` otherwise. For a single-package repo, the file should not exist at all.

#### Monorepo (workspace) repo

Here `pnpm-workspace.yaml` is mandatory — it declares the workspace itself. The same allowlist setting moves into it alongside `packages:`:

```yaml
packages:
  - "apps/*"
  - "packages/*"

onlyBuiltDependencies:
  - esbuild
  - sharp
```

`packages:` accepts glob patterns and `!negations` for exclusions. For a flat repo with no nested packages, the bare-minimum workspace file uses `"."`:

```yaml
packages:
  - "."
```

In a monorepo, do **not** also set `pnpm.onlyBuiltDependencies` in any individual `package.json`. The workspace file wins; the package.json copy is dead config.

#### Approving builds interactively

Whichever mode you're in, pnpm provides a CLI to triage pending build-script approvals:

```bash
pnpm approve-builds          # interactive picker (recommended)
pnpm approve-builds --all    # approve every pending package (use with caution)
```

The approval writes back into the correct file for your mode (`package.json` for single-package, `pnpm-workspace.yaml` for workspace).

#### Companion settings

- **`neverBuiltDependencies`** — packages whose scripts must *never* run, even if they'd otherwise be allowed.
- **`ignoredBuiltDependencies`** — silently skip without prompting (use when a package's `postinstall` is purely cosmetic, e.g. funding messages).
- **`dangerouslyAllowAllBuilds`** — escape hatch to disable the gate entirely. Don't use it.

Pair `onlyBuiltDependencies` with `minimum-release-age` and you've closed the two largest install-time supply-chain holes: malicious *code* (release-age gate) and malicious *side effects* (lifecycle scripts).

---

## Part 2 — Security Hardening

Switching package managers is necessary but nowhere near sufficient. Below is a layered hardening checklist that addresses the most common attack vectors against modern Node projects.

### 2.1 Dependency & Package Attacks

#### Install-time defenses

- **`minimum-release-age`** (covered above) blocks freshly-published malicious versions before researchers flag them.
- **Disable lifecycle scripts by default.** pnpm 10+ blocks `postinstall` for non-allowlisted packages. Allowlist via `pnpm.onlyBuiltDependencies` in `package.json` and audit `pnpm approve-builds` output before approving anything.
- **Frozen lockfile in CI.** Always use `pnpm install --frozen-lockfile` (or `npm ci`, `yarn install --immutable`). CI must never mutate the lockfile.
- **Lockfile review discipline.** Inspect every PR diff to the lockfile. Unexpected new transitive dependencies are a red flag worth investigating.

#### Version pinning

- Avoid `latest` and floating ranges (`*`, `>=x.y.z`) on critical dependencies. Prefer exact versions or tight `~` ranges.
- Use `overrides` (npm), `pnpm.overrides`, or `resolutions` (yarn) to pin known-good versions of transitive dependencies when CVEs surface, without waiting for upstream fixes.
- Prefer **scoped packages** (`@scope/pkg`) — harder to typosquat than unscoped names.

#### Typosquat and namespace protection

- Visually verify package names before adding (`react-dom` vs `reactdom`, `lodash` vs `lodahs`).
- For internal packages, publish under your own scope and reserve common typo variants.
- Consider tools like `npq` (`npx npq install pkg`) that audit packages before installation.

#### Registry and toolchain integrity

- **Pin the registry** in `.npmrc`: `registry=https://registry.npmjs.org/`. Reject untrusted mirrors.
- **Pin the package manager** via `packageManager` + Corepack. This prevents an attacker from swapping pnpm/npm/yarn for a backdoored fork in CI.
- **Verify provenance.** For packages published with `--provenance`, run `npm audit signatures` (or `pnpm audit`) to verify the signed attestation linking the package to its source commit and CI workflow.

### 2.2 Secrets and Credentials

- **Never commit `.env`.** Add it to `.gitignore` and ship a `.env.example` with empty values.
- **Pre-commit secret scanning.** Install one of `gitleaks` (recommended), `trufflehog`, or `git-secrets`, and wire it into a Husky pre-commit hook.
- **CI secrets** belong in the platform's secret manager (GitHub Actions Secrets, GitLab CI Variables) — never inline in workflow YAML.
- **Granular npm tokens.** Use npmjs.com's "Granular access tokens" scoped to a single package, with an expiry. Rotate quarterly.
- **Two-factor authentication everywhere** — npm publish, GitHub, GitLab, deployment dashboards.
- **Signed commits.** Run `git config commit.gpgsign true` (or use SSH signing) and enforce signing via branch protection.

### 2.3 CI/CD Pipeline Security

- **Pin GitHub Actions to commit SHAs**, not tags. Tags are mutable and have been hijacked in the wild:

  ```yaml
  # Bad
  - uses: actions/checkout@v4
  # Good
  - uses: actions/checkout@a5ac7e51b41094c92402da3b24376905380afc29
  ```

  Renovate or Dependabot can keep SHAs updated automatically.

- **Explicit `permissions:` block** in every workflow. Default to `contents: read` and escalate per-job:

  ```yaml
  permissions:
    contents: read
  jobs:
    publish:
      permissions:
        contents: read
        id-token: write   # only where needed
  ```

- **Avoid `pull_request_target`.** It runs with secrets but can check out untrusted PR code — only use it when you fully understand the risk.
- **OIDC for cloud auth.** Use GitHub OIDC to obtain short-lived AWS/GCP/Azure tokens instead of storing long-lived access keys.
- **Branch protection on `main` and release branches:**
  - Require PR review (at least one approver)
  - Require status checks to pass (lint, test, audit)
  - Require signed commits
  - Block force-push and direct push
  - Restrict who can dismiss reviews
- **CODEOWNERS** for sensitive paths: `.github/`, `package.json`, `.npmrc`, deploy configs, security and auth code.
- **Dependabot or Renovate**, with auto-merge gated on CI **and** the release-age threshold — never on raw publish.

### 2.4 Runtime Code Defenses

#### Input handling

- **Sanitize all user input** before injecting into the DOM, SQL, shell, file paths, or templates. Use vetted libraries: `DOMPurify`, parameterized queries, `shell-quote`.
- **Validate at trust boundaries** — anywhere data crosses from untrusted (network, user, environment variables) into trusted code paths.
- **Avoid dynamic execution** of untrusted strings via `eval`, `new Function`, `setTimeout(string, ...)`, or `vm.runInNewContext`.
- **Path traversal.** Never join user input directly into file paths. Resolve and verify the result stays within an allowed directory.

#### Web and DOM

- **Strict Content Security Policy.** Disallow inline scripts where possible and restrict allowed sources.
- **Subresource Integrity** on any CDN-served `<script>` or `<link>`:

  ```html
  <script src="https://cdn.example.com/lib.js"
          integrity="sha384-..."
          crossorigin="anonymous"></script>
  ```

- **postMessage handlers.** Always verify `event.origin` against an allowlist. Cross-origin iframe attacks bypass everything if you don't.
- **CORS** with explicit allowlists — never `*` for authenticated endpoints.
- **Cookies.** Use `Secure`, `HttpOnly`, and `SameSite=Lax` (or `Strict`) for session cookies.

#### Authentication and cryptography

- **Never roll your own crypto.** Use `crypto.subtle`, `libsodium`, or platform primitives.
- **HMAC and signature verification.** Every authenticated network path must route through verification — one missed path is a silent bypass.
- **Constant-time comparison** for secrets via `crypto.timingSafeEqual`, not `===`.
- **Don't log secrets, tokens, license payloads, or PII** — even at debug level. Production builds should strip `console.*` (e.g., tsup's `drop: ["console"]`).

### 2.5 Build Artifact Integrity

- **Reproducible builds.** Pin Node version, lock all dependencies, commit the lockfile. Identical input producing identical output enables tamper detection.
- **Publish with `--provenance`** when releasing to npm:

  ```bash
  pnpm publish --provenance --access public
  ```

  This generates a signed attestation tying the package to its source commit and CI workflow.

- **Don't commit `dist/`** unless absolutely required (e.g., Git-installed packages). It's another tampering surface.
- **Restrict published contents** via `package.json`'s `files` field — explicitly list `dist/`, never publish source, tests, or configs.

### 2.6 Repository Hygiene

- **Enable platform security features.**
  - GitHub: Dependabot alerts, CodeQL code scanning, secret scanning with push protection.
  - GitLab: dependency scanning, SAST, secret detection.
- **Audit third-party apps and OAuth integrations** with repo access. Remove unused.
- **Review workflow permissions annually.**
- **Archive or delete stale branches.** Forgotten `hotfix/*` and `feature/*` branches become attack vectors.
- **Rotate deploy keys and SSH keys** when contributors leave.
- **Audit npm package collaborators** with `npm owner ls <pkg>`. Remove inactive maintainers.

### 2.7 Runtime Telemetry and Logging

- **Error reporters** like Sentry or Datadog must redact PII, tokens, auth headers, and license payloads before sending events.
- **Source maps**, if uploaded to error reporters, should be kept off public CDNs — they leak source code.
- **Log scrubbing.** Pre-deploy review log output for accidental secret leakage.

### 2.8 Audit Cadence

| Cadence    | Action                                                       |
| ---------- | ------------------------------------------------------------ |
| Per PR     | `pnpm audit` (fail CI on high/critical), lockfile diff review |
| Weekly     | Dependabot/Renovate review and merge                         |
| Monthly    | `pnpm outdated`, prune unused deps with `knip` or `depcheck` |
| Quarterly  | Rotate npm tokens and deploy keys, review CI permissions     |
| Annually   | Workflow permission audit, third-party app audit, full threat model review |

### 2.9 Threat Modeling Quick Reference

Before shipping any new feature, walk through **STRIDE**:

- **S**poofing — can someone impersonate a user or service?
- **T**ampering — can data be modified in transit or at rest?
- **R**epudiation — can actions be denied? Are there audit logs?
- **I**nformation disclosure — what leaks via errors, logs, or side channels?
- **D**enial of service — what's the rate limit or resource cap?
- **E**levation of privilege — can a low-trust caller reach high-trust code paths?

### 2.10 Day-One Starter Checklist

For a new project, do these on day one:

1. Create `.npmrc` with `minimum-release-age=10080`, registry pin, and `auto-install-peers=true`.
2. Add the `packageManager` field to `package.json`.
3. Ensure `.gitignore` covers `.env`, `node_modules/`, `dist/`, and `coverage/`.
4. Configure Husky pre-commit: `gitleaks`, lint, format check.
5. Configure Husky pre-push: tests, `pnpm audit`.
6. Enable branch protection on `main`: required reviews, status checks, signed commits, no force-push.
7. Add CODEOWNERS for `.github/`, `package.json`, `.npmrc`.
8. Pin all GitHub Actions to commit SHAs and add explicit `permissions: contents: read`.
9. Enable Dependabot alerts, secret scanning, and push protection.
10. Require 2FA on all maintainer accounts.

---

## Closing Thoughts

No single setting makes a project secure. What works is **defense in depth**: a release-age gate catches the malicious package that slipped past your audit, a frozen lockfile catches the version drift the gate missed, signed commits catch the compromised maintainer account that pushed both, and branch protection catches the rogue CI run that tried to publish without review.

Migrating to pnpm and enabling `minimum-release-age` is the highest-leverage starting point in 2026 — but treat it as the first move in a longer game, not the finish line. Revisit this checklist quarterly. The threats evolve; your defenses should too.

---

## Further Reading

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OpenSSF Scorecard](https://securityscorecards.dev/)
- [npm security best practices](https://docs.npmjs.com/security)
- [GitHub Actions hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [SLSA supply-chain framework](https://slsa.dev/)
- [pnpm settings reference](https://pnpm.io/settings)


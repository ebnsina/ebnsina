---
title: "Infrastructure as Code — Roadmap"
subtitle: "Ansible playbooks first, then Terraform against your own infrastructure."
chapter: 0
level: "beginner"
readingTime: "3 min"
topics: ["roadmap"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A recipe book for kitchens: instead of every chef improvising from memory, the team writes down every step, checks it into version control, and runs the same recipe in every kitchen. Infrastructure as Code is that recipe book — applied to servers.

</Callout>

## What you will learn

Manual infrastructure drifts, can't be reproduced, and leaves no audit trail. This track covers the full IaC stack: why the discipline exists, how Ansible configures servers without an agent, and how Terraform provisions cloud resources with a plan-then-apply workflow. The final chapter covers production patterns — module composition, secrets, drift detection, and the rules that keep large Terraform codebases from becoming unmaintainable.

## Chapters in this track

1. **Why Infrastructure as Code** — drift, snowflake servers, idempotency, the IaC landscape
2. **Ansible Fundamentals** — inventory, playbooks, templates, roles, handlers, Vault
3. **Terraform Fundamentals** — providers, resources, state, modules, the plan/apply workflow
4. **Terraform Patterns & Production** — module composition, environments, secrets, drift detection, refactoring


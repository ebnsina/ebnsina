---
title: 'Infrastructure as Code — রোডম্যাপ'
subtitle: 'আগে Ansible playbook, তারপর নিজের infrastructure-এর ওপর Terraform।'
chapter: 0
level: 'beginner'
readingTime: '3 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

রান্নাঘরের জন্য একটা রেসিপি বই: প্রতিটা শেফ যদি স্মৃতি থেকে নিজের মতো রান্না করে, তার বদলে টিম প্রতিটা ধাপ লিখে রাখে, version control-এ commit করে, আর প্রতিটা রান্নাঘরে একই রেসিপি চালায়। Infrastructure as Code হলো সেই রেসিপি বই — server-এর ক্ষেত্রে প্রয়োগ করা।

</Callout>

## আপনি কী শিখবেন

Manual infrastructure drift করে, এটাকে হুবহু আবার বানানো যায় না, আর কোনো audit trail থাকে না। এই track পুরো IaC stack কভার করে: এই discipline কেন দরকার, কীভাবে Ansible কোনো agent ছাড়াই server configure করে, আর কীভাবে Terraform plan-then-apply workflow দিয়ে cloud resource provision করে। শেষ chapter production pattern নিয়ে — module composition, secrets, drift detection, আর যেসব নিয়ম বড় Terraform codebase-কে অচল হয়ে পড়া থেকে বাঁচায়।

## এই track-এর chapter-গুলো

1. **Why Infrastructure as Code** — drift, snowflake server, idempotency, IaC-এর landscape
2. **Ansible Fundamentals** — inventory, playbook, template, role, handler, Vault
3. **Terraform Fundamentals** — provider, resource, state, module, plan/apply workflow
4. **Terraform Patterns & Production** — module composition, environment, secrets, drift detection, refactoring

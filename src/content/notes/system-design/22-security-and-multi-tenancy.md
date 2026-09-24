---
title: 'সিকিউরিটি ও মাল্টি-টেন্যান্সি'
subtitle: 'একই সিস্টেমে বহু tenant রেখে কীভাবে isolation, authorization, key management আর audit log এমনভাবে ডিজাইন করবেন যাতে একজনের ভুল আরেকজনকে ডোবায় না।'
chapter: 22
level: 'mastery'
readingTime: '২৫ মিনিট'
topics:
  [
    'multi-tenancy',
    'tenant isolation',
    'authorization',
    'encryption',
    'secrets management',
    'audit log'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা শেয়ার্ড গুদাম, যেখানে বহু বণিকের মাল একসাথে থাকে। প্রশ্ন কখনোই "মাল রাখা যাবে কি না" নয় — প্রশ্ন হলো, দেয়াল কোথায় টানব, চাবি কার হাতে থাকবে, আর কে কখন কী নিল সেটা কোন খাতায় লেখা থাকবে।

</Callout>

## গল্পে বুঝি

কায়রোর পুরনো বাজারের পাশে ফাতিমার একটা বিশাল caravanserai — নিচতলায় গুদাম, উপরে বণিকদের থাকার ঘর। বছর দশেক আগে যখন সে ব্যবসাটা শুরু করে, গুদাম ছিল একটাই বড় হলঘর। মেঝেতে চুন দিয়ে দাগ কেটে ভাগ করা — এই কোণটা সিনার রেশমের, ওই কোণটা খোয়ারিজমির তামার বাসনের, মাঝখানটা বিরুনির শুকনো ফলের। সস্তা ব্যবস্থা, একটাই ঝাড়ুদার, একটাই তালা, একটাই ছাদ মেরামতের খরচ — সবাই মিলে ভাগ করে। কিন্তু ব্যবস্থাটার একটা কঠিন শর্ত আছে: প্রতিবার কেউ মাল আনতে ঢুকলে তাকে দাগের ভেতরেই থাকতে হবে। একদিন এক নতুন কর্মচারী তাড়াহুড়োয় দাগ না দেখে পাশের স্তূপ থেকে বস্তা তুলে দিল, আর সিনার রেশম চলে গেল বিরুনির গাড়িতে। কেউ চুরি করেনি, শুধু দাগটা মনে রাখেনি — কিন্তু ক্ষতিটা চুরির সমানই। ফাতিমা তখন নিয়ম করল, ঝাড়ুদার-কুলি কেউই নিজের বিবেচনায় মাল তুলবে না; গুদামের দরজাতেই একটা রেজিস্ট্রি-বাবু বসবে, যে প্রতিটা "মাল তোলো" হুকুমের সাথে বণিকের নাম জুড়ে দেবে, আর নাম ছাড়া কোনো হুকুম ভেতরেই ঢুকবে না।

ব্যবসা বাড়তে বাড়তে দুই ধরনের বণিক এল। কর্ডোবার কিন্দি বলল, চুনের দাগে তার ভরসা নেই — সে চায় নিজের তালাবদ্ধ আলাদা কামরা, একই ছাদের নিচে হলেও দেয়াল দিয়ে ঘেরা। আর সমরকন্দের মরিয়ম, যার মাল রাজদরবারের, সে আরও কড়া — তার জন্য ফাতিমাকে বাজারের অন্য মাথায় আস্ত একটা আলাদা বাড়ি ভাড়া নিতে হলো, নিজস্ব দারোয়ান, নিজস্ব চাবি, নিজস্ব খাতা। খরচ আকাশছোঁয়া, কিন্তু মরিয়মের শর্তই ছিল তাই। এখন ফাতিমার তিন রকম ব্যবস্থা একসাথে চলে, আর সে হাড়ে হাড়ে বোঝে ট্রেডঅফটা: চুনের দাগে খরচ কম কিন্তু একটা ভুলে সবাই ভেজে; আলাদা কামরায় খরচ মাঝারি, ভুলের সীমানা কামরার দেয়াল পর্যন্ত; আর আলাদা বাড়িতে খরচ সবচেয়ে বেশি, কিন্তু আগুন লাগলে পোড়ে শুধু একটাই বাড়ি। উল্টোদিকে, ছাদ মেরামতের নতুন নিয়ম চালু করতে গেলে হলঘরে লাগে এক দিন, আর ত্রিশটা আলাদা বাড়িতে লাগে ত্রিশ দিন।

গেটে বসে থাকে বৃদ্ধ রাজি, দুটো আলাদা কাজ যে কখনো গুলিয়ে ফেলে না। প্রথম কাজ — তুমি আসলে কে। সিলমোহর দেখাও, নামটা মেলাও, ব্যস। দ্বিতীয় কাজ — তুমি কোন কোন দরজা খুলতে পারো। এই দুটো একই প্রশ্ন নয়, আর রাজির সবচেয়ে বড় গুণ হলো সে দ্বিতীয়টার উত্তর নিজের স্মৃতি থেকে দেয় না; তার পাশে একটা তালিকা-খাতা থাকে যেখানে লেখা "সিনার কামরায় সিনা মালিক", "খোয়ারিজমি ওই কামরার হিসাবরক্ষক", "হিসাবরক্ষক দেখতে পারে, বের করতে পারে না"। কেউ যদি বলে "আমাকে সিনা পাঠিয়েছে", রাজি অনুমান করে না — খাতায় সেই সম্পর্কটা লেখা আছে কি না দেখে। সমস্যা একটাই: লাইন লম্বা হলে প্রতিবার খাতা ঘেঁটে দেখতে দেরি হয়, আর ব্যস্ত সকালে গেটের সামনে গাড়ির জট লেগে যায়। তাই রাজি ঘনঘন আসা মুখগুলোর উত্তর একটা ছোট চিরকুটে টুকে রাখে — কিন্তু চিরকুট বেশিদিন রাখে না, কারণ কারও অধিকার কেড়ে নেওয়া হলে পুরনো চিরকুট তাকে ঢুকিয়ে দেবে।

গুদামের পেছনের ঘরে বসে চাবিওয়ালা হাইসাম। প্রতিটা কামরার তালা তার বানানো, আর প্রতি তিন মাস অন্তর সে সব তালার ভেতরের কলকব্জা বদলে নতুন চাবি কেটে দেয় — পুরনো চাবি কারও পকেটে থেকে গেলেও যেন কাজে না লাগে। তার আসল কৌশলটা আরও সূক্ষ্ম: প্রতিটা সিন্দুকের নিজস্ব একটা ছোট চাবি থাকে, আর সেই ছোট চাবিগুলো রাখা থাকে বণিকের নামে বরাদ্দ একটা মাস্টার-বাক্সে, যার চাবি শুধু হাইসামের কাছে। কোনো বণিক চিরতরে চলে গেলে সে সিন্দুক ভাঙে না — শুধু ওই বণিকের মাস্টার-বাক্সটা গলিয়ে ফেলে। সিন্দুক পড়ে থাকে, কিন্তু ভেতরের জিনিস আর কেউ কোনোদিন বের করতে পারে না। আর গেটের পাশে ঝোলে দারোয়ানের রেজিস্টার — কালি দিয়ে লেখা, পাতা সেলাই করা, প্রতি পাতার শেষে আগের পাতার সিলমোহরের ছাপ, যাতে মাঝখান থেকে একটা পাতা ছিঁড়ে ফেললে পুরো বাঁধাই বেমানান হয়ে ধরা পড়ে। ওদিকে লোডিং ডকে রোজ ঝগড়া — দামেস্কের ফারাবির গাড়ি এসে সারা সকাল ডক আটকে রাখে, বাকি সাত বণিকের মাল রোদে পড়ে থাকে। ফাতিমা শেষমেশ প্রতি বণিকের জন্য দিনে নির্দিষ্ট সময়ের স্লট বেঁধে দিল, আর বণিকদের ছোট ছোট দলে ভাগ করে আলাদা ডক বরাদ্দ করল — একজন বেয়াড়া বণিক থাকলে তার দলটাই ভোগে, গোটা caravanserai নয়।

মিলিয়ে নিই: চুনের দাগ দেওয়া হলঘর হলো **shared schema** (এক টেবিলে সবার ডেটা, আলাদা করে শুধু tenant_id), তালাবদ্ধ আলাদা কামরা হলো **schema-per-tenant**, আর বাজারের ওপাশের আলাদা বাড়ি হলো **database-per-tenant**; আগুন লাগলে কতটুকু পোড়ে সেটাই **blast radius**, আর ত্রিশ বাড়িতে ত্রিশ দিন ছাদ মেরামত হলো **migration pain**। রেজিস্ট্রি-বাবুর প্রতিটা হুকুমে বণিকের নাম জুড়ে দেওয়া হলো **tenant context** আর ডেটাবেসের **row-level security** — অ্যাপ যেন ভুল করেও দাগ পেরোতে না পারে। রাজির সিলমোহর মেলানো **authn**, তালিকা-খাতা দেখে দরজা ঠিক করা **authz**, খাতায় লেখা সম্পর্কগুলো **relationship tuple** (ReBAC), আর গেটে গাড়ির জট হলো **check latency** — যার ওষুধ ছোট চিরকুট, অর্থাৎ **authorization cache**, স্বল্পায়ু রাখতেই হবে বলে চিরকুটও ক্ষণস্থায়ী। হাইসামের তিন মাস অন্তর তালা বদলানো **key rotation**, সিন্দুকের ছোট চাবি **DEK**, বণিকের মাস্টার-বাক্স **per-tenant KEK**, গোটা ব্যবস্থাটা **envelope encryption**, আর বাক্স গলিয়ে ফেলা **crypto-shredding**। ডক দখল করা ফারাবি হলো **noisy neighbour**, সময়ের স্লট **per-tenant quota**, ছোট দলে ভাগ করা **cell-based isolation**, আর সেলাই করা রেজিস্টার **tamper-evident audit log**।

## কেন এই অধ্যায়টা mastery-ব্যান্ডে

এতক্ষণ পর্যন্ত প্রতিটা অধ্যায়ে ধরে নেওয়া হয়েছে সিস্টেমটা একদল ব্যবহারকারীর — এক অর্থে "এক tenant"। বাস্তবে প্রায় প্রতিটা B2B সিস্টেমেই বহু প্রতিষ্ঠান একই কোড, একই ডেটাবেস, একই queue, একই cache শেয়ার করে। এতে আগের সব অধ্যায়ের সিদ্ধান্তগুলো নতুন করে প্রশ্নের মুখে পড়ে: cache key-তে tenant না থাকলে একজনের ডেটা আরেকজনের কাছে সার্ভ হয়; hash-based partition যদি tenant-নিরপেক্ষ হয়, তবে একটা বিশাল tenant একটা shard-কে গরম করে ফেলে; rate limiting যদি শুধু global হয়, তবে একজনের burst-এ সবার SLO ভাঙে; আর event-driven pipeline-এর কোনো একটা consumer যদি tenant_id ফেলে দেয়, তাহলে ভুল জায়গায় ডেটা লিখে বসে।

সিকিউরিটি এখানে আলাদা কোনো ফিচার নয় — এটা প্রতিটা লেয়ারে বসানো একটা invariant। আর মাল্টি-টেন্যান্সি হলো সেই invariant-এর সবচেয়ে কঠিন পরীক্ষা, কারণ এখানে ভুলের খরচ latency নয়, বরং অন্য কারও ডেটা।

<Mermaid
title="Where Tenant Identity Must Flow"
code={`graph TD
  R["Request<br/>Host + Token"] --> A["Auth Layer<br/>Verify token, extract tenant"]
  A --> C["Tenant Context<br/>Immutable, request-scoped"]
  C --> Q["Quota Check<br/>Per-tenant token bucket"]
  Q --> Z["Authz Check<br/>Relation lookup"]
  Z --> S["Service Logic<br/>Never reads raw tenant param"]
  S --> D["Data Layer<br/>RLS session variable"]
  S --> K["Cache Layer<br/>Key prefixed by tenant"]
  S --> E["Event Bus<br/>tenant_id in envelope"]
  S --> L["Audit Log<br/>Append-only, hash chained"]`}
/>

## ১. Tenant isolation model

তিনটা মডেল, একই স্পেকট্রামের তিনটা বিন্দু। প্রশ্নটা "কোনটা সবচেয়ে নিরাপদ" নয় — সবচেয়ে নিরাপদটা সবচেয়ে দামি এবং সবচেয়ে অচল। প্রশ্নটা হলো, কোন tenant-এর জন্য কোন বিন্দুটা যুক্তিসঙ্গত।

### Shared schema — tenant_id কলাম আর row-level security

সব tenant-এর row একই টেবিলে, আলাদা করে দেয় একটা `tenant_id` কলাম। প্রতিটা index এই কলাম দিয়ে শুরু হয়, প্রতিটা query-তে এই কলামের predicate থাকতে হয়। এখানে সবচেয়ে বড় বিপদটা কারিগরি নয়, মানবিক — কোনো একদিন কেউ একটা query লিখবে যেখানে `WHERE tenant_id = ...` লিখতে ভুলে গেছে, আর সেটা code review-তে ধরা পড়বে না।

তাই shared schema-তে অ্যাপ্লিকেশন লেয়ারের শৃঙ্খলার উপর ভরসা করা যায় না। ভরসাটা রাখতে হয় ডেটাবেসের **row-level security**-র উপর: টেবিলে একটা policy বসানো থাকে যা সেশন ভ্যারিয়েবল থেকে tenant পড়ে, আর অ্যাপ প্রতিটা transaction-এর শুরুতে সেই ভ্যারিয়েবল সেট করে। এরপর কেউ predicate ভুলে গেলেও ডেটাবেস নিজেই row ফিল্টার করে দেয় — ভুলটা silent data leak না হয়ে empty result হয়ে যায়।

```sql
-- Enable RLS and force it even for the table owner
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

-- Policy reads the tenant from a session variable set per transaction
CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Every hot index leads with tenant_id
CREATE INDEX documents_tenant_updated_idx
  ON documents (tenant_id, updated_at DESC);

-- The application connects as a role that cannot bypass RLS
CREATE ROLE app_runtime NOLOGIN NOBYPASSRLS;
```

<Callout type="warning">

`FORCE ROW LEVEL SECURITY` না দিলে টেবিলের owner role নিজে থেকেই policy bypass করে — আর বেশিরভাগ টিমেই migration আর runtime একই role ব্যবহার করে বসে থাকে। RLS বসিয়েছি ভেবে নিশ্চিন্ত থাকা, অথচ runtime role-এর `BYPASSRLS` আছে — এটা প্রোডাকশনে সবচেয়ে বেশি দেখা ভুলগুলোর একটা।

</Callout>

### Schema-per-tenant

প্রতি tenant-এর নিজস্ব schema, টেবিলের গঠন এক কিন্তু namespace আলাদা। isolation ভালো — একটা ভুল query অন্য schema ছুঁতে পারে না, আর per-tenant restore করা তুলনামূলক সহজ, কারণ একটা schema আলাদা করে dump/restore করা যায়। খরচও শেয়ার্ড ইনস্ট্যান্সেই থাকে।

দাম দিতে হয় দুই জায়গায়। এক, connection pool — প্রতিটা schema-র জন্য আলাদা search_path মানে হয় pool ভাগ করতে হবে, নয়তো প্রতি checkout-এ search_path রিসেট করতে হবে। দুই, migration — হাজার schema-তে একই DDL চালানো মানে হাজারটা lock, আর মাঝপথে একটা ফেল করলে সিস্টেম দুই ভাগে বিভক্ত হয়ে থাকে। এই কারণেই schema-per-tenant বাস্তবে ভালো কাজ করে যখন tenant সংখ্যা শ-খানেক, হাজার-লক্ষ নয়।

### Database-per-tenant

সম্পূর্ণ আলাদা ডেটাবেস, প্রায়ই আলাদা ইনস্ট্যান্স। blast radius সবচেয়ে ছোট, per-tenant restore তুচ্ছ ব্যাপার, per-tenant encryption key স্বাভাবিক, আর compliance auditor-এর কাছে ব্যাখ্যা করা সবচেয়ে সোজা — "ওদের ডেটা ওদের ডেটাবেসে, physically আলাদা"। ডেটা residency-র শর্ত (এই tenant-এর ডেটা কখনো ইউরোপের বাইরে যাবে না) এখানেই সবচেয়ে পরিষ্কারভাবে মেটে, কারণ multi-region অধ্যায়ে দেখা placement সিদ্ধান্তটা tenant-প্রতি নেওয়া যায়।

খরচ আর operational overhead-ই এর সীমা। ৫,০০০ tenant মানে ৫,০০০ ডেটাবেস, ৫,০০০ backup schedule, ৫,০০০ monitoring target, আর একটা schema পরিবর্তন মানে ৫,০০০টা ধাপে ধাপে চালানো migration — যা কার্যত একটা distributed rollout, তার নিজস্ব progress tracking আর rollback plan সহ।

| দিক                | Shared schema                          | Schema-per-tenant          | Database-per-tenant               |
| ------------------ | -------------------------------------- | -------------------------- | --------------------------------- |
| খরচ প্রতি tenant   | সবচেয়ে কম                             | কম-মাঝারি                  | সবচেয়ে বেশি                      |
| Blast radius       | পুরো টেবিল, সব tenant                  | এক schema                  | এক ডেটাবেস                        |
| Migration pain     | একবার চালালেই শেষ                      | প্রতি schema-তে চালাতে হয় | রীতিমতো একটা rollout প্রোগ্রাম    |
| Per-tenant restore | কঠিন, row বাছাই করে ফেরাতে হয়         | মোটামুটি সহজ               | তুচ্ছ, শুধু ওই ডেটাবেস restore    |
| Noisy neighbour    | সবচেয়ে বেশি ঝুঁকি                     | মাঝারি                     | কার্যত নেই                        |
| Per-tenant key     | field-level ছাড়া কঠিন                 | সম্ভব, কিছুটা কষ্ট করে     | স্বাভাবিক                         |
| উপযুক্ত কখন        | হাজার-লক্ষ ছোট tenant, self-serve SaaS | শ-খানেক মাঝারি tenant      | কয়েক ডজন বড় বা regulated tenant |

<Callout type="tip">

বাস্তবে বেশিরভাগ পরিণত SaaS একটাই মডেল বেছে নেয় না — তারা **hybrid** চালায়। ডিফল্ট হলো shared schema, আর enterprise চুক্তিতে যে tenant আলাদা isolation কিনেছে তাকে নিজের ডেটাবেসে সরিয়ে দেওয়া হয়। এর পূর্বশর্ত একটাই: অ্যাপ্লিকেশন কোড কখনো সরাসরি connection string ধরবে না, সবসময় tenant context থেকে routing নেবে। এই একটা শৃঙ্খলা থাকলে পরে মডেল বদলানো একটা কনফিগ পরিবর্তন; না থাকলে সেটা ছয় মাসের রি-রাইট।

</Callout>

## ২. Tenant context — যেখানে সব ভুল ধরা পড়ে

Isolation model যেটাই হোক, প্রতিটা রিকোয়েস্টের শুরুতে একটাই কাজ ঠিকভাবে করতে হয়: tenant কে, সেটা নির্ভরযোগ্যভাবে বের করা, এবং সেই পরিচয়টা এমনভাবে বাঁধা যাতে নিচের কোনো লেয়ার তা override করতে না পারে। tenant কখনোই request body বা query param থেকে আসবে না — আসবে verified token-এর claim থেকে, আর সর্বোচ্চ cross-check হিসেবে host header থেকে।

নিচের middleware-টা তিনটা কাজ একসাথে করে: token যাচাই করে tenant বের করা, per-tenant quota প্রয়োগ করা (rate limiting অধ্যায়ের token bucket, কিন্তু key-টা tenant), আর ডেটাবেস transaction-এ RLS-এর session variable বসানো যাতে অ্যাপের কোনো query দাগ পেরোতে না পারে।

<CodeTabs tsFile="tenant-context.ts" goFile="tenant-context.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';
import crypto from 'node:crypto';
import { Pool, PoolClient } from 'pg';

// 1. TYPES
type Plan = 'free' | 'growth' | 'enterprise';

interface TenantContext {
	readonly tenantId: string;
	readonly subjectId: string;
	readonly plan: Plan;
	readonly requestId: string;
	readonly issuedAt: number;
	readonly expiresAt: number;
}

interface QuotaPolicy {
	requestsPerSecond: number;
	burst: number;
	maxConcurrent: number;
}

const PLAN_QUOTAS: Record<Plan, QuotaPolicy> = {
	free: { requestsPerSecond: 5, burst: 20, maxConcurrent: 4 },
	growth: { requestsPerSecond: 50, burst: 200, maxConcurrent: 32 },
	enterprise: { requestsPerSecond: 400, burst: 1200, maxConcurrent: 128 }
};

class AuthError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

// 2. TOKEN VERIFICATION (short-lived access tokens)
// Access tokens live 5 minutes. Refresh happens out of band against
// the identity service; this path never touches a long-lived credential.
const ACCESS_TOKEN_MAX_AGE_MS = 5 * 60 * 1000;

interface TokenClaims {
	sub: string;
	tid: string;
	plan: Plan;
	iat: number;
	exp: number;
}

function base64urlDecode(input: string): Buffer {
	return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function verifyAccessToken(token: string, secret: string): TokenClaims {
	const parts = token.split('.');
	if (parts.length !== 3) throw new AuthError('malformed token', 401);

	const [headerB64, payloadB64, signatureB64] = parts;
	const expected = crypto
		.createHmac('sha256', secret)
		.update(`${headerB64}.${payloadB64}`)
		.digest();
	const provided = base64urlDecode(signatureB64);

	if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
		throw new AuthError('bad signature', 401);
	}

	const claims = JSON.parse(base64urlDecode(payloadB64).toString('utf-8')) as TokenClaims;
	const now = Date.now();

	if (!claims.tid || !claims.sub) throw new AuthError('missing tenant claim', 401);
	if (now >= claims.exp * 1000) throw new AuthError('token expired', 401);
	if (now - claims.iat * 1000 > ACCESS_TOKEN_MAX_AGE_MS) {
		// Defence in depth: reject tokens minted with an over-long lifetime,
		// even if their own exp says they are still valid.
		throw new AuthError('token lifetime exceeds policy', 401);
	}

	return claims;
}

// 3. PER-TENANT QUOTA (token bucket + concurrency gate)
interface Bucket {
	tokens: number;
	lastRefillMs: number;
	inFlight: number;
}

class TenantQuotaManager {
	private buckets = new Map<string, Bucket>();

	private bucketFor(tenantId: string, policy: QuotaPolicy): Bucket {
		let bucket = this.buckets.get(tenantId);
		if (!bucket) {
			bucket = { tokens: policy.burst, lastRefillMs: Date.now(), inFlight: 0 };
			this.buckets.set(tenantId, bucket);
		}
		return bucket;
	}

	acquire(
		tenantId: string,
		plan: Plan
	): { ok: true } | { ok: false; reason: string; retryAfter: number } {
		const policy = PLAN_QUOTAS[plan];
		const bucket = this.bucketFor(tenantId, policy);

		const now = Date.now();
		const elapsedSec = (now - bucket.lastRefillMs) / 1000;
		bucket.tokens = Math.min(policy.burst, bucket.tokens + elapsedSec * policy.requestsPerSecond);
		bucket.lastRefillMs = now;

		if (bucket.inFlight >= policy.maxConcurrent) {
			return { ok: false, reason: 'concurrency limit reached', retryAfter: 1 };
		}
		if (bucket.tokens < 1) {
			const waitSec = (1 - bucket.tokens) / policy.requestsPerSecond;
			return { ok: false, reason: 'rate limit exceeded', retryAfter: Math.ceil(waitSec) };
		}

		bucket.tokens -= 1;
		bucket.inFlight += 1;
		return { ok: true };
	}

	release(tenantId: string): void {
		const bucket = this.buckets.get(tenantId);
		if (bucket && bucket.inFlight > 0) bucket.inFlight -= 1;
	}

	// Drop idle buckets so a churny tenant population does not leak memory.
	sweep(idleMs = 10 * 60 * 1000): void {
		const cutoff = Date.now() - idleMs;
		for (const [tenantId, bucket] of this.buckets) {
			if (bucket.inFlight === 0 && bucket.lastRefillMs < cutoff) {
				this.buckets.delete(tenantId);
			}
		}
	}
}

// 4. TENANT-SCOPED DATA ACCESS
// Nothing in the service layer receives a raw pool. It receives this,
// which cannot issue a query outside the tenant's rows: every transaction
// sets the session variable that the RLS policy reads.
class TenantScopedDb {
	constructor(
		private pool: Pool,
		private ctx: TenantContext
	) {}

	async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
		const client = await this.pool.connect();
		try {
			await client.query('BEGIN');
			// set_config with is_local = true scopes the setting to this transaction,
			// so a pooled connection can never carry a stale tenant into the next request.
			await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', this.ctx.tenantId]);
			const result = await fn(client);
			await client.query('COMMIT');
			return result;
		} catch (err) {
			await client.query('ROLLBACK');
			throw err;
		} finally {
			client.release();
		}
	}

	// Cache keys are always namespaced. A missing prefix is a cross-tenant leak.
	cacheKey(...segments: string[]): string {
		return ['t', this.ctx.tenantId, ...segments].join(':');
	}
}

// 5. MIDDLEWARE
const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET || 'change-me-in-production';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const quotas = new TenantQuotaManager();
setInterval(() => quotas.sweep(), 60_000).unref();

// Host header is a cross-check only, never the source of truth.
const HOST_TO_TENANT: Record<string, string> = {
	'cordoba.example.com': 'tenant_cordoba',
	'samarkand.example.com': 'tenant_samarkand',
	'bukhara.example.com': 'tenant_bukhara'
};

function buildContext(req: http.IncomingMessage): TenantContext {
	const header = req.headers.authorization;
	if (!header || !header.startsWith('Bearer ')) {
		throw new AuthError('missing bearer token', 401);
	}

	const claims = verifyAccessToken(header.slice(7), ACCESS_SECRET);

	const host = (req.headers.host || '').split(':')[0];
	const hostTenant = HOST_TO_TENANT[host];
	if (hostTenant && hostTenant !== claims.tid) {
		// A valid token for tenant A arriving on tenant B's hostname is either a
		// misconfigured client or an attack. Never guess which.
		throw new AuthError('tenant mismatch between host and token', 403);
	}

	return Object.freeze({
		tenantId: claims.tid,
		subjectId: claims.sub,
		plan: claims.plan,
		requestId: crypto.randomUUID(),
		issuedAt: claims.iat,
		expiresAt: claims.exp
	});
}

type Handler = (
	req: http.IncomingMessage,
	res: http.ServerResponse,
	ctx: TenantContext,
	db: TenantScopedDb
) => Promise<void>;

function withTenant(handler: Handler): http.RequestListener {
	return async (req, res) => {
		let ctx: TenantContext | null = null;
		try {
			ctx = buildContext(req);

			const gate = quotas.acquire(ctx.tenantId, ctx.plan);
			if (!gate.ok) {
				res.writeHead(429, {
					'Content-Type': 'application/json',
					'Retry-After': String(gate.retryAfter)
				});
				res.end(JSON.stringify({ error: gate.reason, tenant: ctx.tenantId }));
				return;
			}

			res.setHeader('X-Request-Id', ctx.requestId);
			await handler(req, res, ctx, new TenantScopedDb(pool, ctx));
		} catch (err) {
			const status = err instanceof AuthError ? err.status : 500;
			// Never echo the reason back on a 500; log it with tenant + request id instead.
			console.error(
				JSON.stringify({
					level: 'error',
					tenant: ctx?.tenantId ?? 'unknown',
					requestId: ctx?.requestId ?? 'unknown',
					message: (err as Error).message
				})
			);
			res.writeHead(status, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({ error: status === 500 ? 'internal error' : (err as Error).message })
			);
		} finally {
			if (ctx) quotas.release(ctx.tenantId);
		}
	};
}

// 6. EXAMPLE HANDLER
const listDocuments: Handler = async (_req, res, ctx, db) => {
	const rows = await db.withTransaction(async (client) => {
		// No tenant_id predicate here on purpose — RLS supplies it.
		// If the policy is missing, this returns everything and the
		// integration test below is what catches it, not a reviewer.
		const result = await client.query(
			'SELECT id, title, updated_at FROM documents ORDER BY updated_at DESC LIMIT 50'
		);
		return result.rows;
	});

	res.writeHead(200, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify({ tenant: ctx.tenantId, documents: rows }));
};

const server = http.createServer(withTenant(listDocuments));
const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, () => console.log(`tenant-scoped API on http://localhost:${PORT}`));
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

// 1. TYPES
type Plan string

const (
	PlanFree       Plan = "free"
	PlanGrowth     Plan = "growth"
	PlanEnterprise Plan = "enterprise"
)

type TenantContext struct {
	TenantID  string
	SubjectID string
	Plan      Plan
	RequestID string
	IssuedAt  int64
	ExpiresAt int64
}

type QuotaPolicy struct {
	RequestsPerSecond float64
	Burst             float64
	MaxConcurrent     int
}

var planQuotas = map[Plan]QuotaPolicy{
	PlanFree:       {RequestsPerSecond: 5, Burst: 20, MaxConcurrent: 4},
	PlanGrowth:     {RequestsPerSecond: 50, Burst: 200, MaxConcurrent: 32},
	PlanEnterprise: {RequestsPerSecond: 400, Burst: 1200, MaxConcurrent: 128},
}

type AuthError struct {
	Message string
	Status  int
}

func (e *AuthError) Error() string { return e.Message }

type ctxKey string

const tenantCtxKey ctxKey = "tenant"

// 2. TOKEN VERIFICATION (short-lived access tokens)
const accessTokenMaxAge = 5 * time.Minute

type TokenClaims struct {
	Sub  string `json:"sub"`
	Tid  string `json:"tid"`
	Plan Plan   `json:"plan"`
	Iat  int64  `json:"iat"`
	Exp  int64  `json:"exp"`
}

func verifyAccessToken(token, secret string) (*TokenClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, &AuthError{"malformed token", http.StatusUnauthorized}
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(parts[0] + "." + parts[1]))
	expected := mac.Sum(nil)

	provided, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(expected, provided) {
		return nil, &AuthError{"bad signature", http.StatusUnauthorized}
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, &AuthError{"malformed payload", http.StatusUnauthorized}
	}

	var claims TokenClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, &AuthError{"malformed payload", http.StatusUnauthorized}
	}

	now := time.Now()
	if claims.Tid == "" || claims.Sub == "" {
		return nil, &AuthError{"missing tenant claim", http.StatusUnauthorized}
	}
	if now.Unix() >= claims.Exp {
		return nil, &AuthError{"token expired", http.StatusUnauthorized}
	}
	// Defence in depth: reject tokens minted with an over-long lifetime.
	if now.Sub(time.Unix(claims.Iat, 0)) > accessTokenMaxAge {
		return nil, &AuthError{"token lifetime exceeds policy", http.StatusUnauthorized}
	}

	return &claims, nil
}

// 3. PER-TENANT QUOTA (token bucket + concurrency gate)
type bucket struct {
	tokens     float64
	lastRefill time.Time
	inFlight   int
}

type TenantQuotaManager struct {
	mu      sync.Mutex
	buckets map[string]*bucket
}

func NewQuotaManager() *TenantQuotaManager {
	qm := &TenantQuotaManager{buckets: make(map[string]*bucket)}
	go qm.sweepLoop()
	return qm
}

func (qm *TenantQuotaManager) Acquire(tenantID string, plan Plan) (bool, string, int) {
	policy, ok := planQuotas[plan]
	if !ok {
		policy = planQuotas[PlanFree]
	}

	qm.mu.Lock()
	defer qm.mu.Unlock()

	b, exists := qm.buckets[tenantID]
	if !exists {
		b = &bucket{tokens: policy.Burst, lastRefill: time.Now()}
		qm.buckets[tenantID] = b
	}

	now := time.Now()
	elapsed := now.Sub(b.lastRefill).Seconds()
	b.tokens = min(policy.Burst, b.tokens+elapsed*policy.RequestsPerSecond)
	b.lastRefill = now

	if b.inFlight >= policy.MaxConcurrent {
		return false, "concurrency limit reached", 1
	}
	if b.tokens < 1 {
		wait := int((1-b.tokens)/policy.RequestsPerSecond) + 1
		return false, "rate limit exceeded", wait
	}

	b.tokens--
	b.inFlight++
	return true, "", 0
}

func (qm *TenantQuotaManager) Release(tenantID string) {
	qm.mu.Lock()
	defer qm.mu.Unlock()
	if b, ok := qm.buckets[tenantID]; ok && b.inFlight > 0 {
		b.inFlight--
	}
}

func (qm *TenantQuotaManager) sweepLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-10 * time.Minute)
		qm.mu.Lock()
		for id, b := range qm.buckets {
			if b.inFlight == 0 && b.lastRefill.Before(cutoff) {
				delete(qm.buckets, id)
			}
		}
		qm.mu.Unlock()
	}
}

// 4. TENANT-SCOPED DATA ACCESS
type TenantScopedDB struct {
	pool *sql.DB
	ctx  *TenantContext
}

func (t *TenantScopedDB) WithTransaction(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := t.pool.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// is_local = true scopes the setting to this transaction, so a pooled
	// connection can never carry a stale tenant into the next request.
	if _, err := tx.ExecContext(ctx, "SELECT set_config('app.tenant_id', $1, true)", t.ctx.TenantID); err != nil {
		return err
	}

	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

// Cache keys are always namespaced. A missing prefix is a cross-tenant leak.
func (t *TenantScopedDB) CacheKey(segments ...string) string {
	return "t:" + t.ctx.TenantID + ":" + strings.Join(segments, ":")
}

// 5. MIDDLEWARE
// Host header is a cross-check only, never the source of truth.
var hostToTenant = map[string]string{
	"cordoba.example.com":   "tenant_cordoba",
	"samarkand.example.com": "tenant_samarkand",
	"bukhara.example.com":   "tenant_bukhara",
}

func buildContext(r *http.Request, secret string) (*TenantContext, error) {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return nil, &AuthError{"missing bearer token", http.StatusUnauthorized}
	}

	claims, err := verifyAccessToken(strings.TrimPrefix(header, "Bearer "), secret)
	if err != nil {
		return nil, err
	}

	host := strings.Split(r.Host, ":")[0]
	if hostTenant, ok := hostToTenant[host]; ok && hostTenant != claims.Tid {
		// A valid token for tenant A on tenant B's hostname is either a
		// misconfigured client or an attack. Never guess which.
		return nil, &AuthError{"tenant mismatch between host and token", http.StatusForbidden}
	}

	return &TenantContext{
		TenantID:  claims.Tid,
		SubjectID: claims.Sub,
		Plan:      claims.Plan,
		RequestID: fmt.Sprintf("req_%d", time.Now().UnixNano()),
		IssuedAt:  claims.Iat,
		ExpiresAt: claims.Exp,
	}, nil
}

type TenantHandler func(http.ResponseWriter, *http.Request, *TenantContext, *TenantScopedDB)

func WithTenant(pool *sql.DB, quotas *TenantQuotaManager, secret string, h TenantHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tc, err := buildContext(r, secret)
		if err != nil {
			var authErr *AuthError
			status := http.StatusInternalServerError
			if errors.As(err, &authErr) {
				status = authErr.Status
			}
			writeJSON(w, status, map[string]string{"error": err.Error()})
			return
		}

		ok, reason, retryAfter := quotas.Acquire(tc.TenantID, tc.Plan)
		if !ok {
			w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
			writeJSON(w, http.StatusTooManyRequests, map[string]string{
				"error": reason, "tenant": tc.TenantID,
			})
			return
		}
		defer quotas.Release(tc.TenantID)

		w.Header().Set("X-Request-Id", tc.RequestID)
		ctx := context.WithValue(r.Context(), tenantCtxKey, tc)
		h(w, r.WithContext(ctx), tc, &TenantScopedDB{pool: pool, ctx: tc})
	}
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// 6. EXAMPLE HANDLER
type Document struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func listDocuments(w http.ResponseWriter, r *http.Request, tc *TenantContext, db *TenantScopedDB) {
	var docs []Document

	err := db.WithTransaction(r.Context(), func(tx *sql.Tx) error {
		// No tenant_id predicate here on purpose — RLS supplies it.
		rows, err := tx.QueryContext(r.Context(),
			"SELECT id, title, updated_at FROM documents ORDER BY updated_at DESC LIMIT 50")
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var d Document
			if err := rows.Scan(&d.ID, &d.Title, &d.UpdatedAt); err != nil {
				return err
			}
			docs = append(docs, d)
		}
		return rows.Err()
	})

	if err != nil {
		log.Printf(`{"level":"error","tenant":"%s","requestId":"%s","message":"%v"}`,
			tc.TenantID, tc.RequestID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"tenant": tc.TenantID, "documents": docs})
}

func main() {
	pool, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	secret := os.Getenv("ACCESS_TOKEN_SECRET")
	if secret == "" {
		secret = "change-me-in-production"
	}

	quotas := NewQuotaManager()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/documents", WithTenant(pool, quotas, secret, listDocuments))

	srv := &http.Server{
		Addr:         ":3000",
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
	}
	log.Println("tenant-scoped API on http://localhost:3000")
	log.Fatal(srv.ListenAndServe())
}
```

</div>
</CodeTabs>

<Callout type="tip">

Isolation-এর সবচেয়ে দামি টেস্টটা লেখা সবচেয়ে সহজ: একটা integration test যেখানে tenant A-র context নিয়ে B-র একটা পরিচিত row-এর id ধরে query করা হয়, এবং assertion হলো "empty"। প্রতিটা নতুন টেবিল যোগ হওয়ার সাথে এই টেস্টটা যেন স্বয়ংক্রিয়ভাবে সেই টেবিলটাও ঢেকে ফেলে — schema থেকে টেবিলের তালিকা পড়ে টেস্ট generate করুন। মানুষের মনে রাখার উপর isolation ছেড়ে দেবেন না।

</Callout>

## ৩. Authn আর authz — একই শব্দ নয়

**Authn** (authentication) উত্তর দেয় "তুমি কে"। **Authz** (authorization) উত্তর দেয় "তুমি এটা করতে পারো কি না"। এই দুটো আলাদা সিস্টেম, আলাদা failure mode, আলাদা latency budget। এক জায়গায় গুলিয়ে ফেললে যা হয়: টোকেনের ভেতরে permission-এর তালিকা ঢুকিয়ে দেওয়া, আর তারপর কারও access কেড়ে নিলে সেটা কার্যকর হতে টোকেনের বাকি আয়ুটুকু অপেক্ষা করা।

### Token কৌশল

- **Access token স্বল্পায়ু রাখুন** — ৫ থেকে ১৫ মিনিট। এতে revocation-এর জন্য কোনো global blocklist না রেখেও ক্ষতির জানালা ছোট থাকে।
- **Refresh token দীর্ঘায়ু, কিন্তু stateful** — সার্ভারে সংরক্ষিত, একবার ব্যবহারে rotate হয়, আর একই refresh token দুইবার এলে সেটাকে চুরির সংকেত ধরে ওই পুরো token family বাতিল করে দিন।
- **Session বনাম token** — first-party ব্রাউজার অ্যাপে httpOnly cookie-ভিত্তিক session প্রায় সবসময়ই ভালো, কারণ storage-এ টোকেন থাকে না। Token লাগে যখন client আপনার নিয়ন্ত্রণের বাইরে (mobile, third-party integration, service-to-service)।
- **Token-এ permission নয়, পরিচয় রাখুন** — `sub`, `tid`, `plan`, `exp`। permission বদলায় ঘনঘন, পরিচয় বদলায় না।

### Service-to-service identity

ভেতরের সার্ভিসগুলোর মধ্যে "কে কল করছে" প্রশ্নের উত্তরে shared secret বা static API key যথেষ্ট নয় — সেগুলো লিক হয়, rotate করা কঠিন, আর কোন সার্ভিস কোনটা ব্যবহার করছে তা কেউ জানে না। এর জায়গায় **mTLS**: প্রতিটা workload-এর নিজস্ব short-lived certificate, যেখানে identity-টা certificate-এর SAN-এ এনকোড করা, আর issuing করে একটা internal CA যা workload-এর platform identity যাচাই করে। Service mesh থাকলে এটা sidecar-এই হয়, অ্যাপ কোড ছুঁতে হয় না।

এখানে একটা সূক্ষ্ম কিন্তু গুরুত্বপূর্ণ পার্থক্য আছে: mTLS বলে _কোন সার্ভিস_ কল করছে, কিন্তু _কোন ব্যবহারকারীর হয়ে_ করছে তা বলে না। ওই দ্বিতীয় তথ্যটা আলাদাভাবে বইতে হয় — একটা signed internal token হিসেবে, যেটা edge-এ ইস্যু হয় এবং পুরো call chain-এ propagate করে। কেবল "caller service trusted" দেখে ডেটা দিয়ে দিলে confused deputy সমস্যা তৈরি হয়: বিশ্বস্ত সার্ভিসটাকে দিয়ে আক্রমণকারী নিজের কাজ করিয়ে নেয়।

<Mermaid
title="Authn and Authz Are Separate Paths"
code={`graph TD
  U["User Request"] --> ED["Edge Gateway<br/>Verify token, mint internal identity"]
  ED --> SV["Service A<br/>mTLS peer identity + user identity"]
  SV --> PDP["Policy Decision Point<br/>Relation lookup"]
  PDP --> RS["Relation Store<br/>Append-only tuples"]
  PDP --> CH["Decision Cache<br/>Short TTL, version stamped"]
  SV --> DATA["Data<br/>Served only after allow"]
  RS --> INV["Change Feed<br/>Invalidate affected cache entries"]
  INV --> CH`}
/>

### RBAC → ABAC → ReBAC

**RBAC** — ব্যবহারকারীর role আছে, role-এর permission আছে। সহজ, দ্রুত, বোঝা যায়। ভেঙে পড়ে যখন প্রশ্নটা রিসোর্স-নির্দিষ্ট হয়ে যায়: "খোয়ারিজমি editor" যথেষ্ট নয় যদি জানতে হয় সে _কোন_ ডকুমেন্টের editor। এই জায়গায় টিমগুলো role নাম বানাতে শুরু করে — `editor_project_42` — আর কয়েক মাসে হাজারো role জন্ম নিয়ে সিস্টেমটা অচল হয়ে যায়।

**ABAC** — সিদ্ধান্ত নেওয়া হয় attribute দেখে: subject-এর attribute, resource-এর attribute, পরিবেশের attribute। "clearance level ≥ resource-এর classification, এবং অনুরোধ office hours-এর মধ্যে, এবং একই region"। খুব শক্তিশালী, বিশেষ করে compliance নিয়মের জন্য। দুর্বলতা হলো ব্যাখ্যাযোগ্যতা — "আমি কেন এটা দেখতে পাচ্ছি না" প্রশ্নের উত্তর দিতে হলে policy engine-টাকে সিমুলেট করতে হয়। আর "এই ডকুমেন্টটা কারা দেখতে পায়" — এই উল্টো প্রশ্নটার উত্তর ABAC-এ কার্যত অসম্ভব, কারণ তার জন্য সব ব্যবহারকারীর উপর policy চালাতে হবে।

**ReBAC** — সিদ্ধান্ত নেওয়া হয় সম্পর্ক দেখে, যা Google-এর Zanzibar পেপার জনপ্রিয় করেছে। ডেটা মডেলটা একটাই জিনিস: **relationship tuple**, অর্থাৎ "object#relation@subject" আকারের একটা ছোট সত্য।

```text
document:ibn-sina-notes#owner@user:ibn_sina
document:ibn-sina-notes#parent@folder:cordoba-research
folder:cordoba-research#viewer@group:baghdad-scholars#member
group:baghdad-scholars#member@user:al_khwarizmi
```

এর সাথে একটা namespace কনফিগ থাকে যা বলে relation কীভাবে অন্য relation থেকে উদ্ভূত হয় — যেমন "viewer = direct viewer, অথবা editor, অথবা parent folder-এর viewer"। চেক মানে এই গ্রাফে একটা সীমিত-গভীরতার traversal। এর সবচেয়ে বড় সুবিধা: sharing, nesting, group, inheritance — সবই একই মডেলে ধরা যায়, আর "এই ডকুমেন্টটা কারা দেখতে পায়" প্রশ্নটার উত্তরও একই গ্রাফ থেকে বেরোয়।

<Callout type="warning">

ReBAC আপনার সব সমস্যার সমাধান নয়, এবং তাড়াতাড়ি নেওয়া সিদ্ধান্তও নয়। ছোট সিস্টেমে RBAC-ই যথেষ্ট এবং debug করা সহজ। ReBAC-এ যাবেন তখনই যখন sharing, nested group বা folder inheritance আপনার প্রোডাক্টের কেন্দ্রীয় ফিচার — অর্থাৎ যখন permission নিজেই ব্যবহারকারীর তৈরি ডেটা, admin-এর কনফিগ নয়।

</Callout>

### Authorization check কোথায় বসবে, আর check latency-র সমস্যা

চেকটা **সার্ভিসের ভেতরে, ডেটা পড়ার ঠিক আগে** বসতে হবে — gateway-তে নয়। Gateway জানে না কোন object-এ হাত পড়ছে; সে কেবল route চেনে। Gateway-তে coarse চেক (এই token বৈধ, এই tenant এই API কিনেছে) রাখা ঠিক আছে, কিন্তু object-লেভেলের সিদ্ধান্ত সেখানে নেওয়া মানে ভুল জায়গায় নেওয়া।

তাতেই আসল সমস্যাটা তৈরি হয়। যদি প্রতিটা object-এর জন্য একটা নেটওয়ার্ক কল করে permission জিজ্ঞেস করতে হয়, তবে ৫০টা আইটেমের একটা লিস্ট পেজে ৫০টা চেক লাগে, আর p99 SLO-টা ধসে পড়ে। Zanzibar-ধাঁচের সিস্টেমগুলো এই সমস্যাটা চারটে উপায়ে সামলায়:

1. **Batch check** — এক রাউন্ড-ট্রিপে বহু object, ভেতরে সমান্তরাল traversal।
2. **আক্রমণাত্মক caching** — traversal-এর মাঝপথের ফলাফলসহ। বিশেষ করে group membership, কারণ একই group বারবার লাগে।
3. **Consistency token** — ক্লায়েন্ট বলে দেয় "অন্তত এই সংস্করণটা দেখতে হবে"; না বললে সিস্টেম দ্রুত কিন্তু কিছুটা পুরনো উত্তর দেয়। consistency অধ্যায়ে দেখা read-your-writes ঠিক এখানেই ফিরে আসে — permission বদলানোর পর ব্যবহারকারী যেন নিজের করা পরিবর্তনটা সাথে সাথে দেখে।
4. **Reverse index** — লিস্ট পেজের জন্য প্রতি আইটেমে চেক না করে বরং "এই ব্যবহারকারী কোন কোন id দেখতে পায়" বের করে সেটাকেই query-র predicate বানানো।

আর একটা কঠিন সত্য: cache মানেই stale permission-এর ঝুঁকি। কারও access কেড়ে নেওয়ার পর সে যদি আরও ৩০ সেকেন্ড ডেটা দেখে, সেটা কি গ্রহণযোগ্য? উত্তরটা প্রোডাক্ট-নির্ভর, কিন্তু উত্তরটা লিখে রাখতে হবে — এবং negative decision (deny) সবসময় positive decision-এর চেয়ে কম সময় cache করা উচিত নয়, বরং উল্টোটা: revoke হলে invalidate করার একটা change feed থাকতে হবে।

<CodeTabs tsFile="rebac-check.ts" goFile="rebac-check.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
// A Zanzibar-flavoured relationship checker: tuples, namespace rewrite rules,
// bounded-depth traversal, batch checks, and a short-TTL decision cache that a
// change feed can invalidate.

// 1. TUPLE MODEL
interface ObjectRef {
	namespace: string; // "document", "folder", "group"
	id: string;
}

interface SubjectRef {
	namespace: string;
	id: string;
	relation?: string; // userset: group:baghdad-scholars#member
}

interface RelationTuple {
	object: ObjectRef;
	relation: string;
	subject: SubjectRef;
}

function objectKey(o: ObjectRef): string {
	return `${o.namespace}:${o.id}`;
}

function subjectKey(s: SubjectRef): string {
	return s.relation ? `${s.namespace}:${s.id}#${s.relation}` : `${s.namespace}:${s.id}`;
}

// 2. NAMESPACE CONFIG (rewrite rules)
type Rewrite =
	| { kind: 'this' }
	| { kind: 'computed'; relation: string }
	| { kind: 'tupleToUserset'; tupleset: string; computed: string };

interface NamespaceConfig {
	relations: Record<string, Rewrite[]>;
}

const NAMESPACES: Record<string, NamespaceConfig> = {
	document: {
		relations: {
			owner: [{ kind: 'this' }],
			editor: [{ kind: 'this' }, { kind: 'computed', relation: 'owner' }],
			viewer: [
				{ kind: 'this' },
				{ kind: 'computed', relation: 'editor' },
				// Anyone who can view the parent folder can view the document.
				{ kind: 'tupleToUserset', tupleset: 'parent', computed: 'viewer' }
			]
		}
	},
	folder: {
		relations: {
			owner: [{ kind: 'this' }],
			viewer: [
				{ kind: 'this' },
				{ kind: 'computed', relation: 'owner' },
				{ kind: 'tupleToUserset', tupleset: 'parent', computed: 'viewer' }
			],
			parent: [{ kind: 'this' }]
		}
	},
	group: {
		relations: {
			member: [{ kind: 'this' }]
		}
	}
};

// 3. TUPLE STORE (append-only, versioned)
class TupleStore {
	private byObjectRelation = new Map<string, Set<string>>();
	private version = 0;
	private listeners: Array<(objectKey: string) => void> = [];

	private indexKey(object: ObjectRef, relation: string): string {
		return `${objectKey(object)}#${relation}`;
	}

	write(tuple: RelationTuple): number {
		const key = this.indexKey(tuple.object, tuple.relation);
		let set = this.byObjectRelation.get(key);
		if (!set) {
			set = new Set();
			this.byObjectRelation.set(key, set);
		}
		set.add(subjectKey(tuple.subject));
		this.version += 1;
		for (const listener of this.listeners) listener(objectKey(tuple.object));
		return this.version;
	}

	delete(tuple: RelationTuple): number {
		const key = this.indexKey(tuple.object, tuple.relation);
		this.byObjectRelation.get(key)?.delete(subjectKey(tuple.subject));
		this.version += 1;
		for (const listener of this.listeners) listener(objectKey(tuple.object));
		return this.version;
	}

	subjects(object: ObjectRef, relation: string): string[] {
		return [...(this.byObjectRelation.get(this.indexKey(object, relation)) ?? [])];
	}

	currentVersion(): number {
		return this.version;
	}

	onChange(listener: (objectKey: string) => void): void {
		this.listeners.push(listener);
	}
}

// 4. DECISION CACHE (short TTL + version stamped + feed invalidated)
interface CachedDecision {
	allowed: boolean;
	version: number;
	expiresAtMs: number;
}

class DecisionCache {
	private entries = new Map<string, CachedDecision>();
	private byObject = new Map<string, Set<string>>();

	constructor(
		store: TupleStore,
		private ttlMs = 10_000
	) {
		// A revoke must not wait out the TTL: the change feed drops
		// every decision that touched the mutated object.
		store.onChange((changedObject) => this.invalidateObject(changedObject));
	}

	get(key: string, minVersion: number): boolean | null {
		const entry = this.entries.get(key);
		if (!entry) return null;
		if (Date.now() > entry.expiresAtMs) {
			this.entries.delete(key);
			return null;
		}
		// Read-your-writes: a caller that just mutated tuples passes the
		// version it wrote, and stale decisions are skipped.
		if (entry.version < minVersion) return null;
		return entry.allowed;
	}

	set(key: string, allowed: boolean, version: number, touchedObjects: string[]): void {
		this.entries.set(key, { allowed, version, expiresAtMs: Date.now() + this.ttlMs });
		for (const obj of touchedObjects) {
			let set = this.byObject.get(obj);
			if (!set) {
				set = new Set();
				this.byObject.set(obj, set);
			}
			set.add(key);
		}
	}

	private invalidateObject(changedObject: string): void {
		const keys = this.byObject.get(changedObject);
		if (!keys) return;
		for (const key of keys) this.entries.delete(key);
		this.byObject.delete(changedObject);
	}
}

// 5. CHECKER
const MAX_DEPTH = 8;

class PermissionChecker {
	private cache: DecisionCache;

	constructor(private store: TupleStore) {
		this.cache = new DecisionCache(store);
	}

	check(object: ObjectRef, relation: string, user: SubjectRef, minVersion = 0): boolean {
		const cacheKey = `${objectKey(object)}#${relation}@${subjectKey(user)}`;
		const cached = this.cache.get(cacheKey, minVersion);
		if (cached !== null) return cached;

		const touched: string[] = [];
		const allowed = this.expand(object, relation, subjectKey(user), 0, new Set(), touched);
		this.cache.set(cacheKey, allowed, this.store.currentVersion(), touched);
		return allowed;
	}

	// One round trip, many objects — this is what keeps a list page inside its SLO.
	batchCheck(
		objects: ObjectRef[],
		relation: string,
		user: SubjectRef,
		minVersion = 0
	): Record<string, boolean> {
		const out: Record<string, boolean> = {};
		for (const object of objects) {
			out[objectKey(object)] = this.check(object, relation, user, minVersion);
		}
		return out;
	}

	private expand(
		object: ObjectRef,
		relation: string,
		userKey: string,
		depth: number,
		seen: Set<string>,
		touched: string[]
	): boolean {
		if (depth > MAX_DEPTH) return false;

		const node = `${objectKey(object)}#${relation}`;
		if (seen.has(node)) return false; // cycle guard: folders can be misparented
		seen.add(node);
		touched.push(objectKey(object));

		const rewrites = NAMESPACES[object.namespace]?.relations[relation];
		if (!rewrites) return false;

		for (const rewrite of rewrites) {
			if (rewrite.kind === 'this') {
				for (const subject of this.store.subjects(object, relation)) {
					if (subject === userKey) return true;

					// Userset: group:baghdad-scholars#member — recurse into the group.
					const hash = subject.indexOf('#');
					if (hash !== -1) {
						const [ns, id] = subject.slice(0, hash).split(':');
						const rel = subject.slice(hash + 1);
						if (this.expand({ namespace: ns, id }, rel, userKey, depth + 1, seen, touched)) {
							return true;
						}
					}
				}
			} else if (rewrite.kind === 'computed') {
				if (this.expand(object, rewrite.relation, userKey, depth + 1, seen, touched)) return true;
			} else {
				// tupleToUserset: walk to the parent, then evaluate there.
				for (const parent of this.store.subjects(object, rewrite.tupleset)) {
					const [ns, id] = parent.split(':');
					if (
						this.expand({ namespace: ns, id }, rewrite.computed, userKey, depth + 1, seen, touched)
					) {
						return true;
					}
				}
			}
		}

		return false;
	}
}

// 6. USAGE
const store = new TupleStore();
store.write({
	object: { namespace: 'document', id: 'optics-treatise' },
	relation: 'owner',
	subject: { namespace: 'user', id: 'ibn_al_haytham' }
});
store.write({
	object: { namespace: 'document', id: 'optics-treatise' },
	relation: 'parent',
	subject: { namespace: 'folder', id: 'cairo-library' }
});
store.write({
	object: { namespace: 'folder', id: 'cairo-library' },
	relation: 'viewer',
	subject: { namespace: 'group', id: 'baghdad-scholars', relation: 'member' }
});
const writeVersion = store.write({
	object: { namespace: 'group', id: 'baghdad-scholars' },
	relation: 'member',
	subject: { namespace: 'user', id: 'al_khwarizmi' }
});

const checker = new PermissionChecker(store);

// true — via folder viewer, via group membership
console.log(
	checker.check(
		{ namespace: 'document', id: 'optics-treatise' },
		'viewer',
		{ namespace: 'user', id: 'al_khwarizmi' },
		writeVersion
	)
);

// false — al-Biruni is in no group and holds no direct tuple
console.log(
	checker.check({ namespace: 'document', id: 'optics-treatise' }, 'viewer', {
		namespace: 'user',
		id: 'al_biruni'
	})
);
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

// A Zanzibar-flavoured relationship checker: tuples, namespace rewrite rules,
// bounded-depth traversal, batch checks, and a short-TTL decision cache that a
// change feed can invalidate.

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

// 1. TUPLE MODEL
type ObjectRef struct {
	Namespace string
	ID        string
}

type SubjectRef struct {
	Namespace string
	ID        string
	Relation  string // userset: group:baghdad-scholars#member
}

type RelationTuple struct {
	Object   ObjectRef
	Relation string
	Subject  SubjectRef
}

func (o ObjectRef) Key() string { return o.Namespace + ":" + o.ID }

func (s SubjectRef) Key() string {
	if s.Relation != "" {
		return s.Namespace + ":" + s.ID + "#" + s.Relation
	}
	return s.Namespace + ":" + s.ID
}

// 2. NAMESPACE CONFIG (rewrite rules)
type RewriteKind int

const (
	RewriteThis RewriteKind = iota
	RewriteComputed
	RewriteTupleToUserset
)

type Rewrite struct {
	Kind     RewriteKind
	Relation string // for computed
	Tupleset string // for tupleToUserset
	Computed string // for tupleToUserset
}

var namespaces = map[string]map[string][]Rewrite{
	"document": {
		"owner":  {{Kind: RewriteThis}},
		"editor": {{Kind: RewriteThis}, {Kind: RewriteComputed, Relation: "owner"}},
		"viewer": {
			{Kind: RewriteThis},
			{Kind: RewriteComputed, Relation: "editor"},
			// Anyone who can view the parent folder can view the document.
			{Kind: RewriteTupleToUserset, Tupleset: "parent", Computed: "viewer"},
		},
		"parent": {{Kind: RewriteThis}},
	},
	"folder": {
		"owner": {{Kind: RewriteThis}},
		"viewer": {
			{Kind: RewriteThis},
			{Kind: RewriteComputed, Relation: "owner"},
			{Kind: RewriteTupleToUserset, Tupleset: "parent", Computed: "viewer"},
		},
		"parent": {{Kind: RewriteThis}},
	},
	"group": {
		"member": {{Kind: RewriteThis}},
	},
}

// 3. TUPLE STORE (append-only, versioned)
type TupleStore struct {
	mu        sync.RWMutex
	index     map[string]map[string]bool
	version   uint64
	listeners []func(objectKey string)
}

func NewTupleStore() *TupleStore {
	return &TupleStore{index: make(map[string]map[string]bool)}
}

func indexKey(o ObjectRef, relation string) string { return o.Key() + "#" + relation }

func (ts *TupleStore) Write(t RelationTuple) uint64 {
	ts.mu.Lock()
	key := indexKey(t.Object, t.Relation)
	if ts.index[key] == nil {
		ts.index[key] = make(map[string]bool)
	}
	ts.index[key][t.Subject.Key()] = true
	ts.version++
	v := ts.version
	listeners := append([]func(string){}, ts.listeners...)
	ts.mu.Unlock()

	for _, l := range listeners {
		l(t.Object.Key())
	}
	return v
}

func (ts *TupleStore) Delete(t RelationTuple) uint64 {
	ts.mu.Lock()
	if set, ok := ts.index[indexKey(t.Object, t.Relation)]; ok {
		delete(set, t.Subject.Key())
	}
	ts.version++
	v := ts.version
	listeners := append([]func(string){}, ts.listeners...)
	ts.mu.Unlock()

	for _, l := range listeners {
		l(t.Object.Key())
	}
	return v
}

func (ts *TupleStore) Subjects(o ObjectRef, relation string) []string {
	ts.mu.RLock()
	defer ts.mu.RUnlock()
	var out []string
	for s := range ts.index[indexKey(o, relation)] {
		out = append(out, s)
	}
	return out
}

func (ts *TupleStore) Version() uint64 {
	ts.mu.RLock()
	defer ts.mu.RUnlock()
	return ts.version
}

func (ts *TupleStore) OnChange(fn func(objectKey string)) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	ts.listeners = append(ts.listeners, fn)
}

// 4. DECISION CACHE
type cachedDecision struct {
	allowed   bool
	version   uint64
	expiresAt time.Time
}

type DecisionCache struct {
	mu       sync.Mutex
	entries  map[string]cachedDecision
	byObject map[string]map[string]bool
	ttl      time.Duration
}

func NewDecisionCache(store *TupleStore, ttl time.Duration) *DecisionCache {
	dc := &DecisionCache{
		entries:  make(map[string]cachedDecision),
		byObject: make(map[string]map[string]bool),
		ttl:      ttl,
	}
	// A revoke must not wait out the TTL.
	store.OnChange(dc.invalidateObject)
	return dc
}

func (dc *DecisionCache) Get(key string, minVersion uint64) (bool, bool) {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	entry, ok := dc.entries[key]
	if !ok {
		return false, false
	}
	if time.Now().After(entry.expiresAt) {
		delete(dc.entries, key)
		return false, false
	}
	// Read-your-writes: skip decisions older than the caller's own write.
	if entry.version < minVersion {
		return false, false
	}
	return entry.allowed, true
}

func (dc *DecisionCache) Set(key string, allowed bool, version uint64, touched []string) {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	dc.entries[key] = cachedDecision{allowed: allowed, version: version, expiresAt: time.Now().Add(dc.ttl)}
	for _, obj := range touched {
		if dc.byObject[obj] == nil {
			dc.byObject[obj] = make(map[string]bool)
		}
		dc.byObject[obj][key] = true
	}
}

func (dc *DecisionCache) invalidateObject(changedObject string) {
	dc.mu.Lock()
	defer dc.mu.Unlock()
	for key := range dc.byObject[changedObject] {
		delete(dc.entries, key)
	}
	delete(dc.byObject, changedObject)
}

// 5. CHECKER
const maxDepth = 8

type PermissionChecker struct {
	store *TupleStore
	cache *DecisionCache
}

func NewPermissionChecker(store *TupleStore) *PermissionChecker {
	return &PermissionChecker{store: store, cache: NewDecisionCache(store, 10*time.Second)}
}

func (pc *PermissionChecker) Check(obj ObjectRef, relation string, user SubjectRef, minVersion uint64) bool {
	cacheKey := obj.Key() + "#" + relation + "@" + user.Key()
	if allowed, hit := pc.cache.Get(cacheKey, minVersion); hit {
		return allowed
	}

	touched := []string{}
	allowed := pc.expand(obj, relation, user.Key(), 0, map[string]bool{}, &touched)
	pc.cache.Set(cacheKey, allowed, pc.store.Version(), touched)
	return allowed
}

// One round trip, many objects — this is what keeps a list page inside its SLO.
func (pc *PermissionChecker) BatchCheck(objects []ObjectRef, relation string, user SubjectRef, minVersion uint64) map[string]bool {
	out := make(map[string]bool, len(objects))
	for _, obj := range objects {
		out[obj.Key()] = pc.Check(obj, relation, user, minVersion)
	}
	return out
}

func (pc *PermissionChecker) expand(obj ObjectRef, relation, userKey string, depth int, seen map[string]bool, touched *[]string) bool {
	if depth > maxDepth {
		return false
	}

	node := obj.Key() + "#" + relation
	if seen[node] {
		return false // cycle guard: folders can be misparented
	}
	seen[node] = true
	*touched = append(*touched, obj.Key())

	rewrites, ok := namespaces[obj.Namespace][relation]
	if !ok {
		return false
	}

	for _, rw := range rewrites {
		switch rw.Kind {
		case RewriteThis:
			for _, subject := range pc.store.Subjects(obj, relation) {
				if subject == userKey {
					return true
				}
				// Userset: group:baghdad-scholars#member — recurse into the group.
				if hash := strings.Index(subject, "#"); hash != -1 {
					parts := strings.SplitN(subject[:hash], ":", 2)
					if len(parts) != 2 {
						continue
					}
					child := ObjectRef{Namespace: parts[0], ID: parts[1]}
					if pc.expand(child, subject[hash+1:], userKey, depth+1, seen, touched) {
						return true
					}
				}
			}
		case RewriteComputed:
			if pc.expand(obj, rw.Relation, userKey, depth+1, seen, touched) {
				return true
			}
		case RewriteTupleToUserset:
			for _, parent := range pc.store.Subjects(obj, rw.Tupleset) {
				parts := strings.SplitN(parent, ":", 2)
				if len(parts) != 2 {
					continue
				}
				p := ObjectRef{Namespace: parts[0], ID: parts[1]}
				if pc.expand(p, rw.Computed, userKey, depth+1, seen, touched) {
					return true
				}
			}
		}
	}

	return false
}

// 6. USAGE
func main() {
	store := NewTupleStore()

	store.Write(RelationTuple{
		Object:   ObjectRef{"document", "optics-treatise"},
		Relation: "owner",
		Subject:  SubjectRef{Namespace: "user", ID: "ibn_al_haytham"},
	})
	store.Write(RelationTuple{
		Object:   ObjectRef{"document", "optics-treatise"},
		Relation: "parent",
		Subject:  SubjectRef{Namespace: "folder", ID: "cairo-library"},
	})
	store.Write(RelationTuple{
		Object:   ObjectRef{"folder", "cairo-library"},
		Relation: "viewer",
		Subject:  SubjectRef{Namespace: "group", ID: "baghdad-scholars", Relation: "member"},
	})
	writeVersion := store.Write(RelationTuple{
		Object:   ObjectRef{"group", "baghdad-scholars"},
		Relation: "member",
		Subject:  SubjectRef{Namespace: "user", ID: "al_khwarizmi"},
	})

	checker := NewPermissionChecker(store)

	// true — via folder viewer, via group membership
	fmt.Println(checker.Check(
		ObjectRef{"document", "optics-treatise"}, "viewer",
		SubjectRef{Namespace: "user", ID: "al_khwarizmi"}, writeVersion))

	// false — al-Biruni is in no group and holds no direct tuple
	fmt.Println(checker.Check(
		ObjectRef{"document", "optics-treatise"}, "viewer",
		SubjectRef{Namespace: "user", ID: "al_biruni"}, 0))
}
```

</div>
</CodeTabs>

## ৪. Secrets আর key management

Secret-এর সবচেয়ে বড় সমস্যা তার জন্ম নয়, তার আয়ু। একটা secret যতদিন বাঁচে, তত বেশি জায়গায় ছড়ায় — CI লগে, ডেভেলপারের ল্যাপটপে, পুরনো container image-এ, কারও Slack DM-এ। তাই ভালো design-এর মূল প্রশ্নটা হলো: এই secret-টার আয়ু কত, আর rotate করতে কতজন মানুষের হস্তক্ষেপ লাগে।

### Rotation যেভাবে আসলে কাজ করে

Rotation-এর কঠিন অংশটা নতুন secret বানানো নয় — পুরনোটা বাতিল করা। যেকোনো মুহূর্তে অন্তত দুটো ভার্সন বৈধ থাকতে হবে, নইলে rotate করার মুহূর্তে চালু connection ভেঙে যাবে। কাজেই প্রতিটা secret-এ একটা version identifier থাকা চাই, verifier একাধিক version গ্রহণ করবে, কিন্তু signer সবসময় সর্বশেষটাই ব্যবহার করবে। এরপর পুরনো version-এর ব্যবহার শূন্য হয়েছে কি না সেটা metric দিয়ে দেখে তবেই সেটা মোছা হবে — অনুমান করে নয়।

```text
Rotation sequence (never fewer than two live versions):
  1. Generate v2, publish to the secret store
  2. Verifiers accept v1 and v2; signers still use v1
  3. Flip signers to v2 (config change, no deploy)
  4. Watch "verified with v1" counter fall to zero
  5. Revoke v1 only after the counter has been zero for one full TTL window
```

### Envelope encryption — KMS, KEK, DEK

ডেটা সরাসরি KMS-এর key দিয়ে এনক্রিপ্ট করা হয় না — কারণ তাহলে প্রতিটা encrypt/decrypt-এ একটা নেটওয়ার্ক কল লাগবে, আর KMS-এর payload সীমাও ছোট। বদলে **envelope encryption** ব্যবহার হয়:

- **DEK** (data encryption key) — এলোমেলো একটা symmetric key, যা দিয়ে আসল ডেটা এনক্রিপ্ট হয়। এটা প্লেইনটেক্সট আকারে শুধু মেমরিতে, ব্যবহারের সময়টুকুতেই থাকে।
- **KEK** (key encryption key) — KMS-এর ভেতরে থাকা master key, যা কখনো KMS ছেড়ে বেরোয় না। DEK-কে এটা দিয়ে wrap করা হয়।
- ডিস্কে জমা থাকে ciphertext আর তার পাশে wrapped DEK। পড়ার সময় একবার KMS-এ গিয়ে DEK unwrap করা হয়, তারপর সব কাজ লোকালি।

<Mermaid
title="Envelope Encryption with Per-Tenant Keys"
code={`graph TD
  P["Plaintext record"] --> DEK["Random DEK<br/>AES-256-GCM, per record"]
  DEK --> CT["Ciphertext<br/>stored in the row"]
  DEK --> W["Wrap DEK<br/>with tenant KEK"]
  W --> KMS["KMS<br/>Tenant KEK never leaves"]
  W --> WD["Wrapped DEK<br/>stored beside ciphertext"]
  KMS --> SHRED["Destroy tenant KEK<br/>= crypto-shredding"]
  SHRED --> DEAD["Every wrapped DEK<br/>becomes unrecoverable"]`}
/>

### Per-tenant key আর crypto-shredding

KEK যদি tenant-প্রতি আলাদা হয়, তবে দুটো জিনিস প্রায় বিনা খরচে পাওয়া যায়। এক, blast radius: একটা KEK আপস হলে শুধু একটা tenant-এর ডেটা ঝুঁকিতে পড়ে। দুই, **crypto-shredding** — কোনো tenant যদি চুক্তি শেষে বা GDPR-এর erasure অনুরোধে ডেটা মুছে ফেলতে বলে, তখন প্রতিটা backup, প্রতিটা replica, প্রতিটা archive থেকে row খুঁজে খুঁজে মোছার বদলে শুধু ওই tenant-এর KEK ধ্বংস করা হয়। যা পড়ে থাকে তা গাণিতিকভাবে অর্থহীন byte।

<Callout type="warning">

Crypto-shredding কাজ করে শুধু তখনই যখন ওই tenant-এর সব ডেটা সত্যিই ওই key দিয়ে এনক্রিপ্ট করা — analytics warehouse-এর কপি, search index-এর document, লগে ছাপা প্লেইনটেক্সট ফিল্ড, সব সহ। একটা derived system যদি নিজের মতো করে প্লেইনটেক্সট রেখে দেয়, তাহলে key ধ্বংস করেও কিছু মোছা হয়নি। মুছে ফেলার প্রতিশ্রুতি দেওয়ার আগে ডেটার প্রতিটা downstream কপির তালিকা করুন।

</Callout>

নিচের helper-টা একটা রেকর্ড-প্রতি DEK বানায়, AAD দিয়ে ciphertext-কে তার নিজের জায়গার সাথে বেঁধে দেয় (সেই সিল করা মান অন্য row-তে সরালে decrypt ফেল করবে, নীরবে কাজ করবে না), DEK-টা tenant KEK দিয়ে wrap করে, আর rotation-এর পর শুধু ছোট wrapped DEK-টা নতুন করে লেখে — বিশাল টেবিল rotate করাও তাই সস্তা থাকে।

```typescript
import crypto from 'node:crypto';

// In production this is AWS KMS / Cloud KMS / Vault Transit. The contract is
// identical everywhere: the KEK never leaves the service, only wrap/unwrap
// cross the boundary, and every KEK carries a version.
interface KmsClient {
	wrap(tenantId: string, dek: Buffer): Promise<{ wrapped: Buffer; keyVersion: number }>;
	unwrap(tenantId: string, wrapped: Buffer, keyVersion: number): Promise<Buffer>;
	rotate(tenantId: string): Promise<number>;
	destroy(tenantId: string): Promise<void>; // crypto-shredding
}

interface SealedField {
	ciphertext: string;
	iv: string;
	authTag: string;
	wrappedDek: string;
	keyVersion: number;
	aad: string;
}

export class EnvelopeCipher {
	constructor(private kms: KmsClient) {}

	// AAD binds the ciphertext to its logical location, so a sealed value moved
	// from one row to another fails to decrypt instead of silently working.
	private aadFor(tenantId: string, recordId: string, field: string): string {
		return `${tenantId}|${recordId}|${field}`;
	}

	async seal(
		tenantId: string,
		recordId: string,
		field: string,
		plaintext: string
	): Promise<SealedField> {
		const dek = crypto.randomBytes(32);
		const iv = crypto.randomBytes(12);
		const aad = this.aadFor(tenantId, recordId, field);

		const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
		cipher.setAAD(Buffer.from(aad, 'utf-8'));
		const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
		const authTag = cipher.getAuthTag();

		const { wrapped, keyVersion } = await this.kms.wrap(tenantId, dek);
		dek.fill(0); // do not leave the DEK sitting on the heap

		return {
			ciphertext: ciphertext.toString('base64'),
			iv: iv.toString('base64'),
			authTag: authTag.toString('base64'),
			wrappedDek: wrapped.toString('base64'),
			keyVersion,
			aad
		};
	}

	async open(tenantId: string, sealed: SealedField): Promise<string> {
		const dek = await this.kms.unwrap(
			tenantId,
			Buffer.from(sealed.wrappedDek, 'base64'),
			sealed.keyVersion
		);
		try {
			const decipher = crypto.createDecipheriv(
				'aes-256-gcm',
				dek,
				Buffer.from(sealed.iv, 'base64')
			);
			decipher.setAAD(Buffer.from(sealed.aad, 'utf-8'));
			decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
			return Buffer.concat([
				decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
				decipher.final()
			]).toString('utf-8');
		} finally {
			dek.fill(0);
		}
	}

	// Re-wrap after a KEK rotation: the data is untouched, only the small
	// wrapped DEK is rewritten, so rotating a huge table stays cheap.
	async rewrap(tenantId: string, sealed: SealedField): Promise<SealedField> {
		const dek = await this.kms.unwrap(
			tenantId,
			Buffer.from(sealed.wrappedDek, 'base64'),
			sealed.keyVersion
		);
		const { wrapped, keyVersion } = await this.kms.wrap(tenantId, dek);
		dek.fill(0);
		return { ...sealed, wrappedDek: wrapped.toString('base64'), keyVersion };
	}
}

// After kms.destroy('tenant_samarkand') every wrapped DEK for that tenant is
// dead weight: open() throws, and no backup or replica can bring it back.
const sealed = await cipher.seal(
	'tenant_samarkand',
	'patient_4471',
	'national_id',
	'MRY-ASTRULABI-1099'
);
```

## ৫. Encryption in transit আর at rest

### Transit — TLS termination কোথায়

প্রশ্নটা "TLS আছে কি না" নয়, "কোথায় গিয়ে TLS খোলে"। সাধারণত তিনটে জায়গা:

- **Edge/CDN-এ termination** — সবচেয়ে সাধারণ, কিন্তু এর মানে edge আর origin-এর মধ্যকার hop আলাদাভাবে সুরক্ষিত করতে হবে, নয়তো ওই অংশটা প্লেইনটেক্সট।
- **Load balancer-এ termination** — এরপর LB থেকে সার্ভিস পর্যন্ত আবার TLS (re-encryption)। এটাই বেশিরভাগ ক্ষেত্রে যুক্তিসঙ্গত ডিফল্ট।
- **সার্ভিসেই termination (passthrough)** — সর্বোচ্চ সুরক্ষা, কিন্তু তখন LB আর HTTP-লেভেল routing করতে পারে না, শুধু TCP forward করে।

মেশের ভেতরে সার্ভিস-থেকে-সার্ভিস কলে **mTLS** চালু থাকলে দুটো জিনিস একসাথে মেলে: গোপনীয়তা, আর caller-এর যাচাইযোগ্য পরিচয়। "ভেতরের নেটওয়ার্ক তো বিশ্বস্ত" — এই ধারণাটাই আজকের architecture-এ সবচেয়ে বিপজ্জনক অনুমান, কারণ একটা compromised pod-ও ওই "ভেতরে"ই থাকে।

### At rest — এটা আসলে কী থেকে বাঁচায়

**Full-disk বা storage-level encryption** (যেমন ক্লাউড ডিস্কের ডিফল্ট এনক্রিপশন) বাঁচায় শুধু একটা জিনিস থেকে: ফিজিক্যাল মিডিয়া হারানো বা ডিকমিশন করা ডিস্ক থেকে ডেটা উদ্ধার। এটা SQL injection, চুরি যাওয়া credential, বা ভুল authz থেকে কিছুই বাঁচায় না — কারণ সেসব ক্ষেত্রে আক্রমণকারী ডেটাবেসের মধ্য দিয়েই পড়ছে, আর ডেটাবেস তো নিজেই decrypt করে দিচ্ছে। এটা একটা compliance checkbox, একটা threat model নয়।

**Field-level encryption** তখনই আসে যখন সত্যিই সংবেদনশীল কিছু (national ID, স্বাস্থ্য তথ্য, ব্যাংক অ্যাকাউন্ট) ডেটাবেসের ভেতরেও ciphertext হিসেবে থাকা দরকার। এর দাম আছে, এবং দামটা মূলত query-তে: এনক্রিপ্টেড ফিল্ডে `LIKE` চলে না, range query চলে না, আর equality চাইলে deterministic encryption লাগে যা নিজেই frequency analysis-এর দরজা খুলে দেয়। তাই field-level encryption বাছাই করে প্রয়োগ করুন, ঢালাওভাবে নয় — এবং যে ফিল্ডে এটা বসছে, সেটার উপর কোনো search index থাকতে পারবে না, এই সিদ্ধান্তটা আগে নিয়ে নিন।

<Callout type="info">

একটা সহজ পরীক্ষা: "এই এনক্রিপশনটা কোন আক্রমণকারীকে থামায়?" — এই প্রশ্নের উত্তরে যদি একটা নির্দিষ্ট চরিত্র (ডেটাসেন্টারের ডিস্ক-চোর, backup ফাইল পাওয়া তৃতীয় পক্ষ, চাকরি ছেড়ে যাওয়া DBA) মনে না পড়ে, তবে এনক্রিপশনটা সুরক্ষা নয়, শুধু জটিলতা।

</Callout>

## ৬. Noisy neighbour

Multi-tenant সিস্টেমে সবচেয়ে ঘন ঘন ঘটা outage-টা কোনো আক্রমণ নয় — একজন tenant-এর একটা ভুল লেখা loop, একটা ভুল import, বা একটা অস্বাভাবিক বড় account যা বাকি সবার জন্য সিস্টেমটা ধীর করে দেয়। এটাকে সিকিউরিটির সমস্যা হিসেবে ভাবা দরকার, কারণ প্রভাবটা availability-র উপর, আর ইচ্ছাকৃত হলে এটাই DoS।

তিনটে স্তরে প্রতিরোধ:

**Per-tenant quota আর rate limiting।** আগের অধ্যায়ের token bucket, কিন্তু bucket-এর key হবে tenant, এবং সীমাটা plan থেকে আসবে। শুধু requests-per-second যথেষ্ট নয় — একই সাথে concurrency (একসাথে কতগুলো রিকোয়েস্ট চলতে পারে) আর cost (একটা রিপোর্ট query একটা key lookup-এর চেয়ে হাজার গুণ দামি) হিসেবে নিতে হয়। বাস্তবে সবচেয়ে কার্যকর হলো একটা "concurrency + weighted cost" জোড়া, কারণ একটা ধীর query দশ হাজার দ্রুত query-র চেয়ে বেশি ক্ষতি করে।

**Resource pool আলাদা করা।** একই worker pool যদি সব tenant-এর background job চালায়, তবে একটা tenant-এর দশ লক্ষ job পুরো queue আটকে দেবে। সমাধান হলো আলাদা queue বা অন্তত fair scheduling — round-robin করে tenant বেছে নেওয়া, FIFO নয়। ভারী tenant-দের জন্য আলাদা dedicated pool রাখা যায়, আর ছোটদের জন্য শেয়ার্ড pool।

**Cell-based architecture আর shuffle sharding।** পুরো fleet-টাকে একাধিক স্বাধীন cell-এ ভাগ করা হয়, প্রতিটা cell-এ নিজস্ব সম্পূর্ণ stack, আর প্রতিটা tenant একটা cell-এ থাকে। এতে যেকোনো ব্যর্থতার সীমা একটা cell। **Shuffle sharding** এটাকে আরেক ধাপ এগিয়ে নেয়: প্রতিটা tenant-কে একটা cell নয়, বরং cell-এর একটা এলোমেলো ছোট উপসেট দেওয়া হয় — ধরুন ২০টা node থেকে ২টো। দুটো tenant-এর উপসেট হুবহু মিলে যাওয়ার সম্ভাবনা তখন খুবই কম, ফলে একটা বেয়াড়া tenant যত node ছোঁয় তার বাইরের প্রায় সবাই অক্ষত থাকে।

<Mermaid
title="Shuffle Sharding Limits the Blast Radius"
code={`graph TD
  T1["Tenant Cordoba"] --> N1["Node 1"]
  T1 --> N4["Node 4"]
  T2["Tenant Bukhara"] --> N2["Node 2"]
  T2 --> N5["Node 5"]
  T3["Tenant Damascus<br/>runaway workload"] --> N3["Node 3"]
  T3 --> N4
  N4 --> DEG["Node 4 degraded<br/>Cordoba retries onto Node 1"]
  N3 --> DEG2["Node 3 degraded<br/>Bukhara untouched"]`}
/>

<Callout type="tip">

Quota reject করার সময় ভুল status code দিলে ক্লায়েন্ট ভুল আচরণ করে। `429` মানে "পরে আবার চেষ্টা করো", আর `Retry-After` header-টা অবশ্যই দিন — নইলে ভালো ক্লায়েন্টও tight loop-এ retry করে সমস্যাটা বাড়াবে। আর quota-র সিদ্ধান্তগুলো metric হিসেবে বের করুন (tenant, reason, plan সহ) — support টিমকে "আপনার লিমিট শেষ" বলতে পারার জন্য এটাই একমাত্র প্রমাণ।

</Callout>

## ৭. Auditability

Audit log আর application log এক জিনিস নয়। Application log ডিবাগিংয়ের জন্য, নমুনা হিসেবে রাখা যায়, হারালেও চলে। Audit log হলো প্রমাণ — কে, কখন, কী করল, কার হয়ে, কোন IP থেকে, আর সিদ্ধান্তটা allow ছিল না deny। এটা হারানো যাবে না, বদলানো যাবে না, এবং বদলানোর চেষ্টা হলে সেটা ধরা পড়তে হবে।

### Tamper-evident করা

সম্পূর্ণ tamper-_proof_ করা প্রায় অসম্ভব (যার root access আছে সে সবই মুছতে পারে), কিন্তু tamper-_evident_ করা সহজ এবং যথেষ্ট। কৌশলটা event-driven অধ্যায়ের append-only log-এর সাথেই মেলে: প্রতিটা এন্ট্রিতে আগের এন্ট্রির hash রাখুন, ফলে একটা hash chain তৈরি হয়। মাঝখানের কোনো এন্ট্রি বদলালে বা মুছলে তার পরের প্রতিটা hash বেমানান হয়ে যায়।

```text
entry_n = {
  seq, timestamp, tenant_id, actor, action, resource,
  decision, reason, request_id, prev_hash
}
prev_hash = SHA-256(canonical_json(entry_{n-1}))
```

এর সাথে দুটো জিনিস যোগ করলে ব্যবস্থাটা বাস্তবে দাঁড়ায়। এক, পর্যায়ক্রমিক **checkpoint** — প্রতি ঘণ্টায় chain-এর মাথার hash-টা আলাদা একটা সিস্টেমে (ভিন্ন account, ভিন্ন credential, append-only object store যেখানে object lock চালু) লিখে রাখুন। দুই, **write path আলাদা করা** — অ্যাপ্লিকেশনের যে role audit log লেখে, তার শুধু append করার অধিকার থাকবে, update বা delete নয়।

### কী রেকর্ড করবেন, কী করবেন না

রেকর্ড করুন: authentication ঘটনা (সফল ও ব্যর্থ), authorization সিদ্ধান্ত — বিশেষ করে **deny**, permission পরিবর্তন (কে কাকে কী দিল), সংবেদনশীল ডেটা পড়া, configuration পরিবর্তন, key rotation আর destroy, আর tenant-এর জীবনচক্রের ঘটনা (provision, suspend, delete)।

রেকর্ড করবেন না: টোকেন, password, secret, বা সংবেদনশীল ফিল্ডের মান নিজেই। Audit log-এ "কিন্দি patient_4471-এর national_id পড়েছে" লেখা থাকবে, মানটা নয় — নইলে audit log নিজেই সবচেয়ে বড় ডেটা লিকের উৎস হয়ে দাঁড়ায়, এবং crypto-shredding-ও তাকে ছোঁয় না।

### কে এটা পড়ে

তিন ধরনের পাঠক, তিন রকম চাহিদা। **Tenant-এর নিজের admin** নিজের প্রতিষ্ঠানের ঘটনাগুলো দেখতে চায় — অর্থাৎ audit log-ও tenant-scoped, এবং সেটাও RLS-এর আওতায়। **আপনার নিজের security টিম** সব tenant জুড়ে প্যাটার্ন খোঁজে (এক IP থেকে বহু tenant-এ ব্যর্থ login), তাই তাদের একটা আলাদা, বিস্তৃত অথচ নিয়ন্ত্রিত access লাগে — এবং তাদের পড়াটাও নিজেই audit হওয়া উচিত। **বাইরের auditor** নির্দিষ্ট সময়সীমার একটা অপরিবর্তনীয় export চায়, hash chain-এর checkpoint সহ, যাতে সে স্বাধীনভাবে যাচাই করতে পারে।

আর একটা কথা observability অধ্যায় থেকে ফিরিয়ে আনার মতো: audit log হলো নিম্ন-আয়তনের কিন্তু উচ্চ-মূল্যের ডেটা, আর metric হলো উচ্চ-আয়তনের কিন্তু নিম্ন-মূল্যের। এদের এক সিস্টেমে রাখবেন না — retention, cost model আর access control তিনটেই সম্পূর্ণ ভিন্ন।

<Callout type="warning">

Deny সিদ্ধান্ত log না করা সবচেয়ে সাধারণ ভুল। আক্রমণের সময় সবচেয়ে দামি সংকেতটাই হলো ব্যর্থ চেষ্টার ধরন — কোন actor হঠাৎ এমন সব resource ছুঁতে চাইছে যেগুলোতে তার কখনো অধিকার ছিল না। সফল কাজের log দিয়ে আক্রমণের আগের ঘণ্টাগুলো পুনর্গঠন করা যায় না।

</Callout>

<div class="takeaways">

### মূল শেখা

- Tenant isolation একটা স্পেকট্রাম — shared schema থেকে database-per-tenant; সঠিক উত্তর হলো hybrid, আর তার পূর্বশর্ত হলো অ্যাপ কখনো সরাসরি connection ধরবে না, সবসময় tenant context থেকে routing নেবে
- Tenant-এর পরিচয় কখনো request param থেকে নয়, verified token-এর claim থেকে আসবে, এবং সেটা RLS-এর session variable হয়ে ডেটাবেস পর্যন্ত পৌঁছাবে — শৃঙ্খলার বদলে যেন ইঞ্জিন isolation প্রয়োগ করে
- Authn আর authz আলাদা সিস্টেম; token-এ পরিচয় রাখুন, permission নয় — নইলে access কেড়ে নেওয়া token-এর আয়ুর কাছে জিম্মি হয়ে থাকে
- RBAC থেকে ReBAC-এ যাবেন তখনই যখন sharing আর nesting ব্যবহারকারীর তৈরি ডেটা; আর তখন check latency-র উত্তর হলো batch check, বাউন্ডেড traversal, স্বল্পায়ু cache আর change-feed invalidation
- Envelope encryption-এ DEK ডেটার সাথে থাকে, KEK কখনো KMS ছাড়ে না; per-tenant KEK দিলে blast radius ছোট হয় এবং crypto-shredding দিয়ে erasure বাস্তবসম্মত হয় — শর্ত হলো downstream কোনো কপিতে প্লেইনটেক্সট পড়ে থাকতে পারবে না
- Noisy neighbour একটা availability আক্রমণ; per-tenant quota, আলাদা resource pool আর shuffle sharding দিয়ে সীমা টানুন, আর audit log-কে append-only hash chain বানিয়ে deny সিদ্ধান্তসহ রাখুন

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Google Zanzibar** relationship tuple, namespace rewrite rule আর consistency token দিয়ে Drive, Calendar, YouTube-এর কোটি কোটি permission চেক করে — এই অধ্যায়ের ReBAC মডেলটার উৎস
- **Salesforce** দশকের পর দশক shared schema চালিয়েছে, isolation প্রয়োগ করেছে org id আর ইঞ্জিন-লেভেল ফিল্টারিং দিয়ে, আর বড় গ্রাহকদের জন্য আলাদা instance রেখেছে — hybrid মডেলের সবচেয়ে পুরনো বড় উদাহরণ
- **Slack** প্রতি workspace-কে একটা shard-এ বসায় এবং Enterprise Key Management-এ গ্রাহকের নিজের KMS key দিয়ে মেসেজ এনক্রিপ্ট করে, যাতে গ্রাহক নিজে key প্রত্যাহার করে access বন্ধ করতে পারে
- **AWS KMS** envelope encryption-এর ডিফল্ট রূপ — DEK লোকালি, KEK কখনো বেরোয় না, প্রতিটা wrap/unwrap CloudTrail-এ audit হয়; আর AWS-এর cell-based architecture আর shuffle sharding ব্যবহার হয় Route 53 ও অন্যান্য সার্ভিসে noisy neighbour সীমিত রাখতে
- **Stripe** স্বল্পায়ু restricted API key, per-account rate limit আর অপরিবর্তনীয় event log চালায়; আর data residency-র শর্তে ইউরোপীয় গ্রাহকদের ডেটা আলাদা region-এ রাখে — tenant-প্রতি placement সিদ্ধান্তের বাস্তব উদাহরণ

</div>

---
title: 'Cloud Networking'
subtitle: 'VPC, subnet, security group, load balancer — কীভাবে একটা secure cloud network architecture ডিজাইন করবেন।'
chapter: 6
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['VPC', 'subnets', 'security groups', 'load balancer']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা একটা পরিকল্পিত আবাসিক এস্টেট বানালেন — চারদিকে উঁচু দেয়াল, ভেতরে নিজস্ব রাস্তা, আর বাইরের শহরে যাওয়ার জন্য মাত্র একটাই বড় মেইন গেট। পুরো এস্টেটটা প্রাইভেট, বাইরের কেউ ইচ্ছেমতো ঢুকতে পারে না। ভেতরটা তিনি ভাগ করলেন কয়েকটা সেকশনে — সামনের সারিতে দোকানপাটের একটা শপফ্রন্ট, যেখানে বাইরের যে কেউ এসে কেনাকাটা করতে পারে; আর ভেতরের দিকে আবাসিক ব্লকগুলো, যেখানে বাসিন্দারা ছাড়া বাইরের লোক ঢোকা নিষেধ।

প্রতিটা ব্লকের গেটে ফাতিমা একজন করে দারোয়ান বসালেন, হাতে একটা লিস্ট — ঠিক কে ভেতরে ঢুকতে পারবে আর কে বেরোতে পারবে, তা ওই লিস্টেই লেখা। সিনা শপফ্রন্টে বসে অর্ডার নেন, কিন্তু আবাসিক ব্লকের গুদামঘরে ঢোকার অনুমতি শুধু খোয়ারিজমির, কারণ তার নামটাই দারোয়ানের লিস্টে আছে। বাইরের শহর থেকে কেউ ভেতরে আসতে চাইলে তাকে সেই একটামাত্র মেইন গেট দিয়েই ঢুকতে হয় — অন্য কোনো ফাঁক নেই।

গল্পটাই আসলে cloud networking। দেয়ালঘেরা পুরো এস্টেট হলো আপনার **VPC** (private network) — নিজের ভেতরে গোছানো, বাইরে থেকে আলাদা। শপফ্রন্টের সারি হলো **public subnet** (বাইরে থেকে ঢোকা যায়), আর ভেতরের আবাসিক ব্লকগুলো **private subnet** (সরাসরি বাইরের অ্যাক্সেস নেই)। প্রতি ব্লকের দারোয়ানের লিস্ট হলো **security group** বা **firewall rule** — কে ঢুকবে-বেরোবে তা ঠিক করে দেয়। আর শহরে যাওয়ার সেই একমাত্র মেইন গেট হলো **internet gateway**। বাস্তবে AWS-এ ঠিক এভাবেই একটা VPC-এর ভেতরে public ও private subnet কাটা হয়, প্রতিটা resource-এ security group লাগানো হয়, আর বাইরের ইন্টারনেটে পৌঁছাতে একটা internet gateway attach করা হয়।

## VPC: আপনার Private Cloud Network

একটা VPC (Virtual Private Cloud) হলো cloud provider-এর ভেতরে একটা isolated network। VPC-এর ভেতরের resource-গুলো একে অপরের সাথে যোগাযোগ করতে পারে, কিন্তু default অবস্থায় internet থেকে লুকানো থাকে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা শহরের সড়ক-ব্যবস্থার মতো — highway (backbone), মোড় (router), toll booth (firewall), আর on-ramp (load balancer)। যতক্ষণ কিছু ভেঙে না পড়ে ততক্ষণ অদৃশ্য, তারপর সবকিছু থমকে যায়।

</Callout>

```typescript
// VPC design for a typical web application
interface VPCDesign {
	cidr: '10.0.0.0/16'; // 65,536 IP addresses

	subnets: {
		// Public subnets — internet-accessible (load balancers, bastion hosts)
		publicA: '10.0.1.0/24'; // 256 IPs in AZ-a
		publicB: '10.0.2.0/24'; // 256 IPs in AZ-b

		// Private subnets — no direct internet access (app servers)
		privateA: '10.0.10.0/24'; // 256 IPs in AZ-a
		privateB: '10.0.11.0/24'; // 256 IPs in AZ-b

		// Data subnets — most restricted (databases)
		dataA: '10.0.20.0/24'; // 256 IPs in AZ-a
		dataB: '10.0.21.0/24'; // 256 IPs in AZ-b
	};
}

// Traffic flow:
// Internet → Load Balancer (public subnet)
//         → App Server (private subnet)
//         → Database (data subnet)
// Database cannot reach the internet directly
```

## Security Groups (Firewall Rules)

```typescript
// Security groups act as virtual firewalls
// Default: deny all inbound, allow all outbound

const securityGroups = {
	loadBalancer: {
		inbound: [
			{ port: 443, source: '0.0.0.0/0' }, // HTTPS from anywhere
			{ port: 80, source: '0.0.0.0/0' } // HTTP (redirect to HTTPS)
		]
	},

	appServer: {
		inbound: [
			{ port: 3000, source: 'sg-loadbalancer' } // only from LB
		]
	},

	database: {
		inbound: [
			{ port: 5432, source: 'sg-appserver' } // only from app
		]
		// No internet access at all
	}
};
```

<Callout type="tip">

**IP address নয়, security group reference করুন।** Database-এ access দেওয়ার জন্য `10.0.10.0/24`-কে allow করার বদলে `sg-appserver`-কে allow করুন। এভাবে, যদি আপনি নতুন server যোগ করেন, সেগুলো স্বয়ংক্রিয়ভাবে access পেয়ে যায়।

</Callout>

## Load Balancers

```typescript
// Application Load Balancer (Layer 7 — HTTP)
// - Routes by path, hostname, headers
// - TLS termination
// - Health checks
// - WebSocket support

interface ALBConfig {
	listeners: [
		{
			port: 443;
			protocol: 'HTTPS';
			certificate: 'arn:aws:acm:...:cert/abc';
			rules: [
				{ pathPattern: '/api/*'; targetGroup: 'api-servers' },
				{ pathPattern: '/*'; targetGroup: 'web-servers' }
			];
		}
	];
	targetGroups: {
		'api-servers': {
			port: 3000;
			healthCheck: { path: '/health'; interval: 30 };
			targets: ['i-abc', 'i-def', 'i-ghi'];
		};
	};
}
```

## NAT Gateway

Private subnet internet-এ পৌঁছাতে পারে না (ডিজাইন অনুযায়ীই), কিন্তু কখনো কখনো দরকার হয় — Docker image টানা, external API কল করা। Public subnet-এ থাকা একটা **NAT Gateway** কেবল outbound internet access সামলায়।

```typescript
// Private subnet route table:
// 10.0.0.0/16 → local (VPC traffic)
// 0.0.0.0/0   → nat-gateway (internet via NAT)

// Public subnet route table:
// 10.0.0.0/16 → local
// 0.0.0.0/0   → internet-gateway (direct internet)

// Key difference:
// NAT: outbound only (server can call APIs, can't be reached from internet)
// IGW: bidirectional (load balancer can receive AND send)
```

<Callout type="info">

**Production-এর জন্য Multi-AZ নিয়ে আপস চলে না।** Resource-গুলো অন্তত ২টি availability zone-এ রাখুন। যখন একটা AZ down হয়ে যায় (এটা হয়েই থাকে), আপনার service চালু থাকে। এটা সবকিছুর ক্ষেত্রেই প্রযোজ্য: load balancer, app server, database।

</Callout>

## মূল কথা

1. **VPC আপনার infrastructure-কে isolate করে** — public/private/data subnet tier ব্যবহার করুন
2. **Security group হলো আপনার firewall** — default deny, security group reference দিয়ে স্পষ্টভাবে allow করুন
3. **Load balancer TLS আর routing সামলায়** — app server কখনো সরাসরি expose করবেন না
4. **সবকিছুতে Multi-AZ** — single-AZ মানে single point of failure

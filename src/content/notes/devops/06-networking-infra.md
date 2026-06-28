---
title: 'Cloud Networking'
subtitle: 'VPCs, subnets, security groups, load balancers — how to design a secure cloud network architecture.'
chapter: 6
level: 'intermediate'
readingTime: '13 min'
topics: ['VPC', 'subnets', 'security groups', 'load balancer']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## VPC: Your Private Cloud Network

A VPC (Virtual Private Cloud) is an isolated network within a cloud provider. Resources inside a VPC can communicate with each other but are hidden from the internet by default.

<Callout type="info">

**Real-World Analogy**

Like a city's road system — highways (backbone), intersections (routers), toll booths (firewalls), and on-ramps (load balancers). Invisible until something breaks, then everything grinds to a halt.

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

**Reference security groups, not IP addresses.** Instead of allowing `10.0.10.0/24` to access the database, allow `sg-appserver`. This way, if you add servers, they automatically get access.

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

Private subnets can't reach the internet (by design), but sometimes they need to — pulling Docker images, calling external APIs. A **NAT Gateway** in the public subnet handles outbound-only internet access.

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

**Multi-AZ is non-negotiable for production.** Place resources in at least 2 availability zones. When an AZ goes down (it happens), your service stays up. This applies to everything: load balancers, app servers, databases.

</Callout>

## Key Takeaways

1. **VPCs isolate your infrastructure** — use public/private/data subnet tiers
2. **Security groups are your firewall** — default deny, explicitly allow by security group reference
3. **Load balancers handle TLS and routing** — never expose app servers directly
4. **Multi-AZ everything** — single-AZ is a single point of failure

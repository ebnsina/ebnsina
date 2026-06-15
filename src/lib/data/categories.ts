export interface CategoryMeta {
	label: string;
	description: string;
	group: string;
}

export const CATEGORIES: Record<string, CategoryMeta> = {
	chapters: { label: 'System Design', description: 'Core system design concepts and case studies', group: 'Foundations' },
	dsa: { label: 'DSA', description: 'Data structures and algorithms', group: 'Foundations' },
	networking: { label: 'Networking', description: 'How the internet works, TCP/IP, DNS, HTTP', group: 'Foundations' },
	'db-internals': { label: 'DB Internals', description: 'Storage engines, B-trees, WAL, MVCC', group: 'Foundations' },
	golang: { label: 'Go', description: 'Go from fundamentals to production', group: 'Languages' },
	frontend: { label: 'Frontend', description: 'Rendering patterns, state management, performance', group: 'Languages' },
	'api-design': { label: 'API Design', description: 'REST, pagination, versioning, rate limiting', group: 'APIs' },
	graphql: { label: 'GraphQL', description: 'Schema design, resolvers, subscriptions', group: 'APIs' },
	grpc: { label: 'gRPC', description: 'Protobuf, streaming, interceptors, TLS', group: 'APIs' },
	websockets: { label: 'WebSockets', description: 'Real-time, pub/sub, presence, backpressure', group: 'APIs' },
	webhooks: { label: 'Webhooks', description: 'Sending, signing, retries, idempotency', group: 'APIs' },
	'linux-vps': { label: 'Linux / VPS', description: 'SSH, systemd, firewall, processes', group: 'Infrastructure' },
	'web-server': { label: 'Web Servers', description: 'Nginx, reverse proxy, edge caching', group: 'Infrastructure' },
	'tls-certs': { label: 'TLS & Certs', description: "Let's Encrypt, ACME, certificate management", group: 'Infrastructure' },
	devops: { label: 'DevOps', description: 'Containers, Kubernetes, CI/CD, IaC', group: 'Infrastructure' },
	containers: { label: 'Containers', description: 'Docker fundamentals and patterns', group: 'Infrastructure' },
	orchestration: { label: 'Orchestration', description: 'Kubernetes and container orchestration', group: 'Infrastructure' },
	iac: { label: 'IaC', description: 'Infrastructure as code, Terraform', group: 'Infrastructure' },
	'data-modeling': { label: 'Data Modeling', description: 'Entities, normalization, schema evolution', group: 'Data' },
	'auth-security': { label: 'Auth & Security', description: 'Authentication, authorization, security patterns', group: 'Data' },
	'api-gateway': { label: 'API Gateway', description: 'Gateway patterns, routing, aggregation', group: 'Data' },
	caching: { label: 'Caching', description: 'Cache strategies, Redis, CDN', group: 'Data' },
	'background-jobs': { label: 'Background Jobs', description: 'Job queues, workers, scheduling', group: 'Data' },
	messaging: { label: 'Messaging', description: 'Message queues, Kafka, RabbitMQ', group: 'Data' },
	'event-driven': { label: 'Event-Driven', description: 'Event sourcing, CQRS, Saga pattern', group: 'Data' },
	storage: { label: 'Storage', description: 'Object storage, block storage, file systems', group: 'Data' },
	search: { label: 'Search', description: 'Full-text search, Elasticsearch, indexing', group: 'Data' },
	'load-balancing': { label: 'Load Balancing', description: 'Algorithms, health checks, session affinity', group: 'Scaling' },
	'horizontal-scaling': { label: 'Horizontal Scaling', description: 'Stateless services, auto-scaling', group: 'Scaling' },
	'replication-sharding': { label: 'Replication & Sharding', description: 'Database scaling strategies', group: 'Scaling' },
	observability: { label: 'Observability', description: 'Metrics, logging, tracing, alerting', group: 'Reliability' },
	sre: { label: 'SRE', description: 'SLIs, SLOs, incident response, chaos engineering', group: 'Reliability' },
	testing: { label: 'Testing', description: 'Unit, integration, E2E, contract testing', group: 'Reliability' },
	performance: { label: 'Performance', description: 'Profiling, optimization, benchmarking', group: 'Reliability' },
	'disaster-recovery': { label: 'Disaster Recovery', description: 'RTO, RPO, backup strategies', group: 'Reliability' },
	'capacity-cost': { label: 'Capacity & Cost', description: 'FinOps, capacity planning, cost optimization', group: 'Reliability' },
	microservices: { label: 'Microservices', description: 'Service boundaries, communication, patterns', group: 'Reliability' },
	'chaos-resilience': { label: 'Chaos & Resilience', description: 'Fault injection, circuit breakers, bulkheads', group: 'Reliability' },
	'ethical-hacking': { label: 'Ethical Hacking', description: 'Penetration testing, OSINT, exploitation, CTF — zero to professional', group: 'Security' }
};

export const GROUP_ORDER = [
	'Foundations',
	'Languages',
	'APIs',
	'Infrastructure',
	'Data',
	'Scaling',
	'Reliability',
	'Security'
];

export function getCategoryGroups() {
	const groups: Record<string, Array<{ key: string; meta: CategoryMeta }>> = {};
	for (const [key, meta] of Object.entries(CATEGORIES)) {
		(groups[meta.group] ??= []).push({ key, meta });
	}
	return groups;
}

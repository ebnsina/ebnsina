// The notes "path": 8 content groups arranged into 4 progressive levels,
// modelled on the Laracasts learning-path structure (Fundamentals → Mastery).
// Each level pulls in whole tracks (categories) by their group.

export interface RoadmapLevel {
	n: number;
	title: string;
	level: 'beginner' | 'intermediate' | 'advanced' | 'mastery';
	blurb: string;
	outcomes: string[];
	groups: string[];
}

export const ROADMAP: RoadmapLevel[] = [
	{
		n: 1,
		title: 'Fundamentals',
		level: 'beginner',
		blurb: 'How systems talk, store data, and move bits across the network — the bedrock everything else builds on.',
		outcomes: ['How clients and servers talk', 'Storing and modelling data', 'Networking and protocol basics'],
		groups: ['Foundations']
	},
	{
		n: 2,
		title: 'Build & Ship',
		level: 'intermediate',
		blurb: 'Write the services and interfaces people actually use — languages, and the APIs that connect them.',
		outcomes: ['Backend languages in practice', 'Designing clean REST & GraphQL APIs', 'Real-time, event-driven interfaces'],
		groups: ['Languages', 'APIs']
	},
	{
		n: 3,
		title: 'Operate & Scale',
		level: 'advanced',
		blurb: 'Run it in production: infrastructure, data at scale, and growing horizontally without falling over.',
		outcomes: ['Running infrastructure in production', 'Scaling data and traffic horizontally', 'Caching, queues and load balancing'],
		groups: ['Infrastructure', 'Data', 'Scaling']
	},
	{
		n: 4,
		title: 'Mastery',
		level: 'mastery',
		blurb: 'Keep it reliable and secure under real-world pressure — the work that separates seniors from the rest.',
		outcomes: ['Observability and reliability under load', 'Security and auth at scale', 'Staying resilient when things break'],
		groups: ['Reliability', 'Security']
	}
];

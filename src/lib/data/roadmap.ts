// The notes "path": 8 content groups arranged into 4 progressive levels,
// modelled on the Laracasts learning-path structure (Fundamentals → Mastery).
// Each level pulls in whole tracks (categories) by their group.

export interface RoadmapLevel {
	n: number;
	title: string;
	level: 'beginner' | 'intermediate' | 'advanced' | 'mastery';
	blurb: string;
	groups: string[];
}

export const ROADMAP: RoadmapLevel[] = [
	{
		n: 1,
		title: 'Fundamentals',
		level: 'beginner',
		blurb: 'How systems talk, store data, and move bits across the network — the bedrock everything else builds on.',
		groups: ['Foundations']
	},
	{
		n: 2,
		title: 'Build & Ship',
		level: 'intermediate',
		blurb: 'Write the services and interfaces people actually use — languages, and the APIs that connect them.',
		groups: ['Languages', 'APIs']
	},
	{
		n: 3,
		title: 'Operate & Scale',
		level: 'advanced',
		blurb: 'Run it in production: infrastructure, data at scale, and growing horizontally without falling over.',
		groups: ['Infrastructure', 'Data', 'Scaling']
	},
	{
		n: 4,
		title: 'Mastery',
		level: 'mastery',
		blurb: 'Keep it reliable and secure under real-world pressure — the work that separates seniors from the rest.',
		groups: ['Reliability', 'Security']
	}
];

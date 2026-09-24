<script module lang="ts">
	/**
	 * The site's icon set — Hugeicons (free, stroke-rounded). Every icon the UI uses
	 * is registered in the map below, so call sites stay terse (`<Icon name="check" />`)
	 * and swapping the concrete glyph for a role happens in exactly one place.
	 *
	 * Never use emoji or hand-rolled inline <svg> for UI icons — add a role here.
	 */
	import {
		Alert02Icon,
		ApertureIcon,
		ArrowDown01Icon,
		ArrowLeft02Icon,
		ArrowRight02Icon,
		ArrowUp02Icon,
		ArrowUpRight01Icon,
		Award01Icon,
		BankIcon,
		Book02Icon,
		BookOpen01Icon,
		BulbIcon,
		Call02Icon,
		Cancel01Icon,
		ChartIncreaseIcon,
		ChartLineData01Icon,
		CheckListIcon,
		Clock01Icon,
		Copy01Icon,
		Film01Icon,
		GithubIcon,
		HierarchySquare01Icon,
		Image01Icon,
		InformationCircleIcon,
		Link01Icon,
		Linkedin01Icon,
		LiveStreaming02Icon,
		LockIcon,
		Mail01Icon,
		Menu01Icon,
		Moon02Icon,
		NewTwitterIcon,
		RssIcon,
		Search01Icon,
		Settings02Icon,
		SparklesIcon,
		Store01Icon,
		Sun03Icon,
		Tag01Icon,
		TeacherIcon,
		Tick02Icon,
		ToolboxIcon,
		Wallet01Icon,
		WhatsappIcon,
		Wrench01Icon
	} from '@hugeicons/core-free-icons';

	const ICONS = {
		phone: Call02Icon,
		whatsapp: WhatsappIcon,
		github: GithubIcon,
		linkedin: Linkedin01Icon,
		x: NewTwitterIcon,
		rss: RssIcon,
		aperture: ApertureIcon,
		broadcast: LiveStreaming02Icon,
		chalkboard: TeacherIcon,
		chart: ChartLineData01Icon,
		film: Film01Icon,
		image: Image01Icon,
		link: Link01Icon,
		storefront: Store01Icon,
		toolbox: ToolboxIcon,
		trendUp: ChartIncreaseIcon,
		wallet: Wallet01Icon,
		wrench: Wrench01Icon,
		bookText: BookOpen01Icon,
		arrowLeft: ArrowLeft02Icon,
		arrowRight: ArrowRight02Icon,
		arrowUp: ArrowUp02Icon,
		arrowUpRight: ArrowUpRight01Icon,
		caretDown: ArrowDown01Icon,
		copy: Copy01Icon,
		diagram: HierarchySquare01Icon,
		info: InformationCircleIcon,
		lightbulb: BulbIcon,
		menu: Menu01Icon,
		moon: Moon02Icon,
		sun: Sun03Icon,
		warning: Alert02Icon,
		book: Book02Icon,
		check: Tick02Icon,
		close: Cancel01Icon,
		clock: Clock01Icon,
		landmark: BankIcon,
		listChecks: CheckListIcon,
		lock: LockIcon,
		mail: Mail01Icon,
		search: Search01Icon,
		settings: Settings02Icon,
		sparkles: SparklesIcon,
		tag: Tag01Icon,
		trophy: Award01Icon
	};

	export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';

	let {
		name,
		size = 16,
		weight = 'regular',
		color = 'currentColor',
		class: klass = ''
	}: {
		name: IconName;
		size?: number;
		weight?: 'regular' | 'bold';
		color?: string;
		class?: string;
	} = $props();
</script>

<HugeiconsIcon
	icon={ICONS[name]}
	{size}
	{color}
	strokeWidth={weight === 'bold' ? 2 : 1.5}
	class="icon {klass}"
	aria-hidden="true"
/>

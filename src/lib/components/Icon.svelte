<script lang="ts">
	/**
	 * The site's icon set — Hugeicons, rendered through their single
	 * `HugeiconsIcon` wrapper. Every icon the UI uses is registered in the map
	 * below, so call sites stay terse (`<Icon name="check" />`) and swapping the
	 * concrete glyph for a role happens in exactly one place.
	 *
	 * Never use emoji or hand-rolled inline <svg> for UI icons — add a role here.
	 */
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		ArrowRight02Icon,
		ArrowUpRight01Icon,
		Tick02Icon,
		Clock01Icon,
		BankIcon,
		TranslateIcon,
		CheckListIcon,
		LockIcon,
		Mail01Icon,
		Settings01Icon,
		SparklesIcon,
		ChampionIcon
	} from '@hugeicons/core-free-icons';

	const ICONS = {
		arrowRight: ArrowRight02Icon,
		arrowUpRight: ArrowUpRight01Icon,
		check: Tick02Icon,
		clock: Clock01Icon,
		landmark: BankIcon,
		languages: TranslateIcon,
		listChecks: CheckListIcon,
		lock: LockIcon,
		mail: Mail01Icon,
		settings: Settings01Icon,
		sparkles: SparklesIcon,
		trophy: ChampionIcon
	};

	type IconName = keyof typeof ICONS;

	let {
		name,
		size = 16,
		strokeWidth = 1.8,
		color = 'currentColor',
		class: klass = ''
	}: {
		name: IconName;
		size?: number;
		strokeWidth?: number;
		color?: string;
		class?: string;
	} = $props();
</script>

<HugeiconsIcon icon={ICONS[name]} {size} {color} {strokeWidth} class={klass} />

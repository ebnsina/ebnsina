<script module lang="ts">
	/**
	 * The site's icon set — Phosphor. Every icon the UI uses is registered in the
	 * map below, so call sites stay terse (`<Icon name="check" />`) and swapping the
	 * concrete glyph for a role happens in exactly one place.
	 *
	 * Never use emoji or hand-rolled inline <svg> for UI icons — add a role here.
	 */
	import GithubLogoIcon from 'phosphor-svelte/lib/GithubLogoIcon';
	import LinkedinLogoIcon from 'phosphor-svelte/lib/LinkedinLogoIcon';
	import XLogoIcon from 'phosphor-svelte/lib/XLogoIcon';
	import RssIcon from 'phosphor-svelte/lib/RssIcon';
	import PhoneIcon from 'phosphor-svelte/lib/PhoneIcon';
	import WhatsappLogoIcon from 'phosphor-svelte/lib/WhatsappLogoIcon';
	import ApertureIcon from 'phosphor-svelte/lib/ApertureIcon';
	import BroadcastIcon from 'phosphor-svelte/lib/BroadcastIcon';
	import ChalkboardTeacherIcon from 'phosphor-svelte/lib/ChalkboardTeacherIcon';
	import ChartLineIcon from 'phosphor-svelte/lib/ChartLineIcon';
	import FilmStripIcon from 'phosphor-svelte/lib/FilmStripIcon';
	import ImageIcon from 'phosphor-svelte/lib/ImageIcon';
	import LinkSimpleIcon from 'phosphor-svelte/lib/LinkSimpleIcon';
	import StorefrontIcon from 'phosphor-svelte/lib/StorefrontIcon';
	import ToolboxIcon from 'phosphor-svelte/lib/ToolboxIcon';
	import TrendUpIcon from 'phosphor-svelte/lib/TrendUpIcon';
	import WalletIcon from 'phosphor-svelte/lib/WalletIcon';
	import WrenchIcon from 'phosphor-svelte/lib/WrenchIcon';
	import BookOpenTextIcon from 'phosphor-svelte/lib/BookOpenTextIcon';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUpIcon';
	import ArrowUpRightIcon from 'phosphor-svelte/lib/ArrowUpRightIcon';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import CopyIcon from 'phosphor-svelte/lib/CopyIcon';
	import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
	import LightbulbIcon from 'phosphor-svelte/lib/LightbulbIcon';
	import ListIcon from 'phosphor-svelte/lib/ListIcon';
	import MoonIcon from 'phosphor-svelte/lib/MoonIcon';
	import SunIcon from 'phosphor-svelte/lib/SunIcon';
	import TreeStructureIcon from 'phosphor-svelte/lib/TreeStructureIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import BookOpenIcon from 'phosphor-svelte/lib/BookOpenIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import ClockIcon from 'phosphor-svelte/lib/ClockIcon';
	import BankIcon from 'phosphor-svelte/lib/BankIcon';
	import ListChecksIcon from 'phosphor-svelte/lib/ListChecksIcon';
	import LockIcon from 'phosphor-svelte/lib/LockIcon';
	import EnvelopeSimpleIcon from 'phosphor-svelte/lib/EnvelopeSimpleIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import GearIcon from 'phosphor-svelte/lib/GearIcon';
	import SparkleIcon from 'phosphor-svelte/lib/SparkleIcon';
	import TrophyIcon from 'phosphor-svelte/lib/TrophyIcon';
	import TagIcon from 'phosphor-svelte/lib/TagIcon';

	const ICONS = {
		phone: PhoneIcon,
		whatsapp: WhatsappLogoIcon,
		github: GithubLogoIcon,
		linkedin: LinkedinLogoIcon,
		x: XLogoIcon,
		rss: RssIcon,
		aperture: ApertureIcon,
		broadcast: BroadcastIcon,
		chalkboard: ChalkboardTeacherIcon,
		chart: ChartLineIcon,
		film: FilmStripIcon,
		image: ImageIcon,
		link: LinkSimpleIcon,
		storefront: StorefrontIcon,
		toolbox: ToolboxIcon,
		trendUp: TrendUpIcon,
		wallet: WalletIcon,
		wrench: WrenchIcon,
		bookText: BookOpenTextIcon,
		arrowLeft: ArrowLeftIcon,
		arrowRight: ArrowRightIcon,
		arrowUp: ArrowUpIcon,
		arrowUpRight: ArrowUpRightIcon,
		caretDown: CaretDownIcon,
		copy: CopyIcon,
		diagram: TreeStructureIcon,
		info: InfoIcon,
		lightbulb: LightbulbIcon,
		menu: ListIcon,
		moon: MoonIcon,
		sun: SunIcon,
		warning: WarningIcon,
		book: BookOpenIcon,
		check: CheckIcon,
		close: XIcon,
		clock: ClockIcon,
		landmark: BankIcon,
		listChecks: ListChecksIcon,
		lock: LockIcon,
		mail: EnvelopeSimpleIcon,
		search: MagnifyingGlassIcon,
		settings: GearIcon,
		sparkles: SparkleIcon,
		tag: TagIcon,
		trophy: TrophyIcon
	};

	export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">

	let {
		name,
		size = 16,
		weight = 'regular',
		color = 'currentColor',
		class: klass = ''
	}: {
		name: IconName;
		size?: number;
		weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
		color?: string;
		class?: string;
	} = $props();

	const Glyph = $derived(ICONS[name]);
</script>

<Glyph {size} {weight} {color} class="icon {klass}" aria-hidden="true" />

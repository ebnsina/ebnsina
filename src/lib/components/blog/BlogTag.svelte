<script>
	export let label = 'interface';
	export let color = 'bg-green-50 text-green-700';

	const rotation = -4 + Math.random() * 8;
</script>

<a class="block hover:underline underline-offset-2" href={`/blog/tag/${encodeURIComponent(label)}`}>
	<span
		class={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs ${color} transition-all transform`}
		style="
    transform: rotate({rotation}deg);
    box-shadow:
      inset 0 2px 4px rgba(255, 255, 255, 0.6),   
      inset 0 -2px 4px rgba(0, 0, 0, 0.08);
  "
	>
		{label}
	</span>
</a>

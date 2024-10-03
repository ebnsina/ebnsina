<script lang="ts">
	export let tag: string;
</script>

<a
	href={`/blog/tag/${encodeURIComponent(tag)}`}
	class="inline-block px-4 py-1 text-[12px] border border-slate-300 rounded-md hover:underline"
>
	#{tag}
</a>

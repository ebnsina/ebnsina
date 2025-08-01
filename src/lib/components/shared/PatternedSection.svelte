<script lang="ts">
	export let title: string;
	export let description: string;
</script>

<div
	class="py-20 border-b border-slate-200 px-6"
	style="
    background-image: 
      repeating-linear-gradient(0deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px),
      repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px);
  "
>
	<h1 class="text-xl md:text-3xl xl:text-4xl font-bold mb-4">{title}</h1>
	<p class="text-sm md:text-base text-slate-600">{description}</p>
</div>

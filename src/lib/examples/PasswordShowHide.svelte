<script lang="ts">
	let value = '';
	let showPassword = false;

	$: type = showPassword ? 'text' : 'password';

	function onInput(event) {
		value = event.target.value;
	}
</script>

<section class="bg-slate-800 p-4 mt-8 flex gap-8 justify-between items-center">
	<div class="w-full">
		<label class="block text-sm text-slate-300 mb-1" for="password">Password</label>
		<input
			class="w-full px-4 py-2 bg-slate-700 border border-transparent focus:outline-none focus:border-primary"
			id="password"
			{type}
			{value}
			{...$$restProps}
			on:input={onInput}
		/>
	</div>

	<div class="mt-6">
		<button
			class="bg-slate-900 px-4 py-2"
			type="button"
			on:click={() => (showPassword = !showPassword)}>{showPassword ? 'Hide' : 'Show'}</button
		>
	</div>
</section>

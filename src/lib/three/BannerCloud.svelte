<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { buildShape, type ShapeName } from './shapes';

	let { accent = '#9c2a45', shape = 'cubes' }: { accent?: string; shape?: ShapeName } = $props();

	let points = $state<THREE.Points>();
	let geom: THREE.BufferGeometry | undefined;
	let count = 0;
	let base: Float32Array = new Float32Array(0);
	let scatter: Float32Array = new Float32Array(0);
	let live: Float32Array = new Float32Array(0);
	let bright: Float32Array = new Float32Array(0);

	const pointer = { x: 0, y: 0 };
	let px = 0;
	let rotY = $state(0);
	let rotX = $state(0);
	let t = 0;
	let intro = 0;

	$effect(() => {
		if (!geom) return;
		const c = new THREE.Color(accent);
		const colors = new Float32Array(count * 3);
		for (let i = 0; i < count; i++) {
			const s = 0.32 + 0.68 * bright[i];
			colors[i * 3] = c.r * s;
			colors[i * 3 + 1] = c.g * s;
			colors[i * 3 + 2] = c.b * s;
		}
		geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	});

	onMount(() => {
		const onMove = (e: PointerEvent) => {
			pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
			pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
		};
		window.addEventListener('pointermove', onMove, { passive: true });

		const built = buildShape(shape);
		base = built.pos;
		bright = built.br;
		count = bright.length;
		scatter = new Float32Array(count * 3);
		for (let i = 0; i < count * 3; i += 3) {
			scatter[i] = (Math.random() - 0.5) * 12;
			scatter[i + 1] = (Math.random() - 0.5) * 10;
			scatter[i + 2] = (Math.random() - 0.5) * 8;
		}
		live = scatter.slice();

		geom = new THREE.BufferGeometry();
		geom.setAttribute('position', new THREE.BufferAttribute(live, 3));
		const c = new THREE.Color(accent);
		const colors = new Float32Array(count * 3);
		for (let i = 0; i < count; i++) {
			const s = 0.32 + 0.68 * bright[i];
			colors[i * 3] = c.r * s;
			colors[i * 3 + 1] = c.g * s;
			colors[i * 3 + 2] = c.b * s;
		}
		geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		points = new THREE.Points(
			geom,
			new THREE.PointsMaterial({
				size: 0.035,
				vertexColors: true,
				transparent: true,
				opacity: 0.95,
				sizeAttenuation: true,
				depthWrite: false
			})
		);

		return () => window.removeEventListener('pointermove', onMove);
	});

	useTask((delta) => {
		if (!geom || !count) return;
		t += delta;
		intro = Math.min(1, intro + delta * 0.6);
		const e = 1 - Math.pow(1 - intro, 3);
		px += (pointer.x - px) * Math.min(1, delta * 2);
		// gentle sway (never fully edge-on for flat objects) + cursor parallax
		rotY = Math.sin(t * 0.32) * 0.5 + px * 0.5;
		rotX += (pointer.y * 0.16 - rotX) * Math.min(1, delta * 2);

		const a = live;
		for (let idx = 0; idx < count; idx++) {
			const j = idx * 3;
			const dx = Math.sin(t * 0.8 + idx) * 0.01;
			const dy = Math.cos(t * 0.6 + idx * 1.3) * 0.01;
			a[j] = scatter[j] + (base[j] - scatter[j]) * e + dx;
			a[j + 1] = scatter[j + 1] + (base[j + 1] - scatter[j + 1]) * e + dy;
			a[j + 2] = scatter[j + 2] + (base[j + 2] - scatter[j + 2]) * e;
		}
		(geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
	});
</script>

<T.PerspectiveCamera makeDefault position={[0.5, 1.85, 4.7]} fov={42} oncreate={(r) => r.lookAt(0, 0, 0)} />

{#if points}
	<T.Group rotation.y={rotY} rotation.x={rotX}>
		<T is={points} />
	</T.Group>
{/if}

<script lang="ts">
	/**
	 * The hero object: a structure that keeps building itself.
	 *
	 * A handful of modular configurations — cube cluster, tower, slab, arch —
	 * are each derived from unit cells: shared corners become nodes, shared
	 * borders become struts. Every configuration is expressed with the SAME point
	 * budget, so the cloud can morph from one to the next per-point instead of
	 * cross-fading. The loop is: assemble → hold → loosen → re-form elsewhere.
	 *
	 * Points are deliberately crisp, not glowing: the structure should read as
	 * something made, and the brand has no neon in it. Brightness separates the
	 * two layers — nodes carry the light, struts recede.
	 */
	import { T, useTask } from '@threlte/core';
	import { onMount } from 'svelte';
	import * as THREE from 'three';

	let { accent = '#99a4f0' }: { accent?: string } = $props();

	type Vec = [number, number, number];
	type Config = { nodes: Vec[]; edges: Array<[Vec, Vec]> };

	const STRUTS = 5200;
	const NODES = 700;
	const COUNT = STRUTS + NODES;
	const SPAN = 1.8; // world size every configuration is normalised to
	const HOLD = 4.5; // seconds a finished structure stands before it loosens
	const MORPH = 2.6; // seconds to travel to the next one

	let struts = $state<THREE.Points>();
	let nodesPts = $state<THREE.Points>();
	let dark = $state(true);

	// per-point stable parameters, so a point keeps its identity across configs
	// (that's what makes the morph read as travel rather than a dissolve)
	const along = new Float32Array(COUNT); // position along its strut
	const side = new Float32Array(COUNT * 2); // perpendicular jitter
	const inNode = new Float32Array(COUNT * 3); // offset inside its node
	const away = new Float32Array(COUNT * 3); // loosen direction

	const from = new Float32Array(COUNT * 3);
	const to = new Float32Array(COUNT * 3);
	const live = new Float32Array(COUNT * 3);
	const bright = new Float32Array(COUNT);

	let configs: Config[] = [];
	let which = 0;
	let phase: 'hold' | 'morph' = 'morph';
	let clock = 0;
	let t = 0;

	let rotY = $state(-0.35);
	let rotX = $state(0);
	const pointer = { x: 0, y: 0 };

	let geomS: THREE.BufferGeometry | undefined;
	let geomN: THREE.BufferGeometry | undefined;
	let matS: THREE.PointsMaterial | undefined;
	let matN: THREE.PointsMaterial | undefined;

	/** Unit cells → a frame: deduped corners (nodes) and borders (struts). */
	function buildConfig(cells: Vec[]): Config {
		const key = (p: Vec) => `${p[0]},${p[1]},${p[2]}`;
		/* eslint-disable svelte/prefer-svelte-reactivity -- local dedupe, never read reactively */
		const nodeMap = new Map<string, Vec>();
		const edgeMap = new Map<string, [Vec, Vec]>();
		/* eslint-enable svelte/prefer-svelte-reactivity */

		for (const [cx, cy, cz] of cells) {
			const corners: Vec[] = [];
			for (let dx = 0; dx <= 1; dx++)
				for (let dy = 0; dy <= 1; dy++)
					for (let dz = 0; dz <= 1; dz++) corners.push([cx + dx, cy + dy, cz + dz]);
			for (const c of corners) nodeMap.set(key(c), c);
			for (const a of corners)
				for (const b of corners) {
					const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
					if (d !== 1) continue; // neighbours only — no diagonals
					const ka = key(a);
					const kb = key(b);
					edgeMap.set(ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`, ka < kb ? [a, b] : [b, a]);
				}
		}

		const nodes = [...nodeMap.values()];
		// normalise: centre on the origin and scale the longest axis to SPAN, so
		// the silhouette changes between configs but the mass never jumps
		const lo: Vec = [Infinity, Infinity, Infinity];
		const hi: Vec = [-Infinity, -Infinity, -Infinity];
		for (const n of nodes)
			for (let i = 0; i < 3; i++) {
				lo[i] = Math.min(lo[i], n[i]);
				hi[i] = Math.max(hi[i], n[i]);
			}
		const mid: Vec = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
		const scale = SPAN / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1);
		const fix = (p: Vec): Vec => [
			(p[0] - mid[0]) * scale,
			(p[1] - mid[1]) * scale,
			(p[2] - mid[2]) * scale
		];

		return {
			nodes: nodes.map(fix),
			edges: [...edgeMap.values()].map(([a, b]) => [fix(a), fix(b)] as [Vec, Vec])
		};
	}

	/** Lay the fixed point budget over a configuration. */
	function layout(cfg: Config, out: Float32Array) {
		const E = cfg.edges.length;
		const N = cfg.nodes.length;
		const per = Math.ceil(STRUTS / E); // points per strut
		for (let i = 0; i < STRUTS; i++) {
			const [a, b] = cfg.edges[i % E];
			// evenly spaced along the strut with only a whisper of jitter — random
			// placement clumps, and clumps read as fuzz instead of an edge
			const u = Math.min(1, (Math.floor(i / E) + 0.5 + (along[i] - 0.5) * 0.55) / per);
			const dx = b[0] - a[0];
			const dy = b[1] - a[1];
			const dz = b[2] - a[2];
			// jitter across the strut so it has thickness, not a hairline
			const len = Math.hypot(dx, dy, dz) || 1;
			const px = -dy / len;
			const py = dx / len;
			const j = i * 2;
			out[i * 3] = a[0] + dx * u + px * side[j] + side[j + 1] * 0.35;
			out[i * 3 + 1] = a[1] + dy * u + py * side[j];
			out[i * 3 + 2] = a[2] + dz * u + side[j + 1];
		}
		for (let i = 0; i < NODES; i++) {
			const n = cfg.nodes[i % N];
			const k = STRUTS + i;
			out[k * 3] = n[0] + inNode[k * 3];
			out[k * 3 + 1] = n[1] + inNode[k * 3 + 1];
			out[k * 3 + 2] = n[2] + inNode[k * 3 + 2];
		}
	}

	function paint() {
		const c = new THREE.Color(accent);
		// light theme: the bright end of the indigo ramp disappears on paper, so
		// pull the whole cloud down toward ink instead of up toward light
		const col = dark ? c : c.clone().lerp(new THREE.Color('#1b1d3a'), 0.62);
		for (const [geom, off, n] of [
			[geomS, 0, STRUTS],
			[geomN, STRUTS, NODES]
		] as Array<[THREE.BufferGeometry | undefined, number, number]>) {
			if (!geom) continue;
			const attr = geom.attributes.color as THREE.BufferAttribute;
			const arr = attr.array as Float32Array;
			for (let i = 0; i < n; i++) {
				const s = (dark ? 0.3 : 0.55) + (dark ? 0.7 : 0.45) * bright[off + i];
				arr[i * 3] = col.r * s;
				arr[i * 3 + 1] = col.g * s;
				arr[i * 3 + 2] = col.b * s;
			}
			attr.needsUpdate = true;
		}
		if (matS) matS.opacity = dark ? 0.92 : 0.8;
		if (matN) matN.opacity = dark ? 0.98 : 0.9;
	}

	$effect(() => {
		void accent;
		void dark;
		if (geomS) paint();
	});

	onMount(() => {
		const onMove = (e: PointerEvent) => {
			pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
			pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
		};
		const onTheme = () => (dark = document.documentElement.classList.contains('dark'));
		onTheme();
		window.addEventListener('pointermove', onMove, { passive: true });
		window.addEventListener('themechange', onTheme);

		for (let i = 0; i < COUNT; i++) {
			along[i] = Math.random();
			side[i * 2] = (Math.random() - 0.5) * 0.012;
			side[i * 2 + 1] = (Math.random() - 0.5) * 0.012;
			inNode[i * 3] = (Math.random() - 0.5) * 0.022;
			inNode[i * 3 + 1] = (Math.random() - 0.5) * 0.022;
			inNode[i * 3 + 2] = (Math.random() - 0.5) * 0.022;
			const th = Math.random() * Math.PI * 2;
			const ph = Math.acos(2 * Math.random() - 1);
			away[i * 3] = Math.sin(ph) * Math.cos(th);
			away[i * 3 + 1] = Math.sin(ph) * Math.sin(th);
			away[i * 3 + 2] = Math.cos(ph) * 0.7;
			bright[i] = i < STRUTS ? 0.44 + Math.random() * 0.14 : 0.9 + Math.random() * 0.1;
		}

		// four ways to arrange the same material — each keeps a legible void so the
		// silhouette reads as a built thing rather than a filled box
		configs = [
			buildConfig([
				// L block with one cell set back in depth
				[0, 0, 0],
				[1, 0, 0],
				[1, 1, 0],
				[0, 0, 1]
			]),
			buildConfig([
				// staircase
				[0, 0, 0],
				[0, 1, 0],
				[1, 1, 0],
				[1, 2, 0]
			]),
			buildConfig([
				// wide span with one cell above it
				[0, 0, 0],
				[1, 0, 0],
				[2, 0, 0],
				[1, 0, 1]
			]),
			buildConfig([
				// arch — an opening carried by two legs
				[0, 0, 0],
				[0, 1, 0],
				[1, 1, 0],
				[2, 1, 0],
				[2, 0, 0]
			])
		];

		// intro: start scattered, then assemble into the first configuration
		for (let i = 0; i < COUNT * 3; i += 3) {
			from[i] = (Math.random() - 0.5) * 15;
			from[i + 1] = (Math.random() - 0.5) * 11;
			from[i + 2] = (Math.random() - 0.5) * 8;
		}
		live.set(from);
		layout(configs[0], to);

		geomS = new THREE.BufferGeometry();
		geomS.setAttribute('position', new THREE.BufferAttribute(live.subarray(0, STRUTS * 3), 3));
		geomS.setAttribute('color', new THREE.BufferAttribute(new Float32Array(STRUTS * 3), 3));
		geomN = new THREE.BufferGeometry();
		geomN.setAttribute('position', new THREE.BufferAttribute(live.subarray(STRUTS * 3), 3));
		geomN.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NODES * 3), 3));

		const common = {
			vertexColors: true,
			transparent: true,
			sizeAttenuation: true,
			depthWrite: false
		} as const;
		matS = new THREE.PointsMaterial({ size: 0.02, ...common });
		matN = new THREE.PointsMaterial({ size: 0.045, ...common });
		struts = new THREE.Points(geomS, matS);
		nodesPts = new THREE.Points(geomN, matN);
		paint();

		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('themechange', onTheme);
			geomS?.dispose();
			geomN?.dispose();
			matS?.dispose();
			matN?.dispose();
		};
	});

	useTask((delta) => {
		if (!geomS || !geomN) return;
		t += delta;
		clock += delta;

		if (phase === 'morph' && clock >= MORPH) {
			phase = 'hold';
			clock = 0;
			from.set(to);
		} else if (phase === 'hold' && clock >= HOLD) {
			phase = 'morph';
			clock = 0;
			which = (which + 1) % configs.length;
			from.set(live);
			layout(configs[which], to);
		}

		const p = phase === 'morph' ? Math.min(1, clock / MORPH) : 1;
		const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; // easeInOutCubic
		// the structure loosens on the way over and settles again — peaks mid-morph
		const loose = phase === 'morph' ? Math.sin(Math.PI * p) * 0.42 : 0;

		const k = Math.min(1, delta * 2.2);
		rotY += (-0.6 + t * 0.045 + pointer.x * 0.3 - rotY) * k;
		rotX += (0.1 + pointer.y * 0.12 - rotX) * k;

		for (let i = 0; i < COUNT; i++) {
			const j = i * 3;
			const breathe = Math.sin(t * 0.6 + i) * 0.006;
			live[j] = from[j] + (to[j] - from[j]) * e + away[j] * loose + breathe;
			live[j + 1] = from[j + 1] + (to[j + 1] - from[j + 1]) * e + away[j + 1] * loose + breathe;
			live[j + 2] = from[j + 2] + (to[j + 2] - from[j + 2]) * e + away[j + 2] * loose;
		}
		(geomS.attributes.position as THREE.BufferAttribute).needsUpdate = true;
		(geomN.attributes.position as THREE.BufferAttribute).needsUpdate = true;
	});
</script>

<T.PerspectiveCamera
	makeDefault
	position={[0.4, 1.15, 6.1]}
	fov={40}
	oncreate={(r) => r.lookAt(0, 0.1, 0)}
/>

{#if struts && nodesPts}
	<T.Group position.x={1.55} position.y={0.18} rotation.y={rotY} rotation.x={rotX}>
		<T is={struts} />
		<T is={nodesPts} />
	</T.Group>
{/if}

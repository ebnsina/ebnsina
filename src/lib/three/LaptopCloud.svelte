<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
	import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

	let { accent = '#9c2a45' }: { accent?: string } = $props();

	let points = $state<THREE.Points>();
	let geom: THREE.BufferGeometry | undefined;
	let count = 0;
	let base = new Float32Array(0); // target (laptop shape)
	let scatter = new Float32Array(0); // intro start
	let live = new Float32Array(0); // current
	let bright = new Float32Array(0); // 0..1 per point

	const pointer = { x: 0, y: 0 };
	let rotY = $state(-0.5);
	let rotX = $state(0);
	let t = 0;
	let intro = 0;

	// Recolour (monochrome accent; brighter points = full accent, e.g. the screen).
	$effect(() => {
		if (!geom) return;
		const c = new THREE.Color(accent);
		const colors = new Float32Array(count * 3);
		for (let i = 0; i < count; i++) {
			const s = 0.3 + 0.7 * bright[i];
			colors[i * 3] = c.r * s;
			colors[i * 3 + 1] = c.g * s;
			colors[i * 3 + 2] = c.b * s;
		}
		geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	});

	function sampleInto(mesh: THREE.Mesh, n: number, b: number, pos: number[], br: number[]) {
		const sampler = new MeshSurfaceSampler(mesh).build();
		const v = new THREE.Vector3();
		for (let i = 0; i < n; i++) {
			sampler.sample(v);
			v.applyMatrix4(mesh.matrixWorld);
			pos.push(v.x, v.y, v.z);
			br.push(b);
		}
	}

	onMount(() => {
		const onMove = (e: PointerEvent) => {
			pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
			pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
		};
		window.addEventListener('pointermove', onMove, { passive: true });

		// Build the laptop as a transform hierarchy, then surface-sample it.
		const deckGeo = new RoundedBoxGeometry(2.8, 0.13, 1.9, 4, 0.06);
		const lidGeo = new RoundedBoxGeometry(2.8, 1.78, 0.09, 4, 0.05);
		const screenGeo = new THREE.PlaneGeometry(2.56, 1.54);
		const padGeo = new THREE.PlaneGeometry(0.92, 0.6);

		const root = new THREE.Group();
		const deck = new THREE.Mesh(deckGeo);
		root.add(deck);
		const pad = new THREE.Mesh(padGeo);
		pad.rotation.x = -Math.PI / 2;
		pad.position.set(0, 0.072, 0.74);
		root.add(pad);
		const lidGroup = new THREE.Group();
		lidGroup.position.set(0, 0.066, -0.92);
		lidGroup.rotation.x = -0.46;
		root.add(lidGroup);
		const lid = new THREE.Mesh(lidGeo);
		lid.position.set(0, 0.89, 0);
		lidGroup.add(lid);
		const screen = new THREE.Mesh(screenGeo);
		screen.position.set(0, 0.89, 0.05);
		lidGroup.add(screen);
		root.updateMatrixWorld(true);

		const pos: number[] = [];
		const br: number[] = [];
		// distinct brightness per part so each layer reads separately
		sampleInto(deck, 2200, 0.36, pos, br); // base slab — dimmest, recedes
		sampleInto(lid, 1900, 0.48, pos, br); // lid back — mid
		sampleInto(screen, 2400, 1.0, pos, br); // display — brightest
		sampleInto(pad, 460, 0.62, pos, br); // trackpad — bright

		// keyboard as a grid of individual keys (clearly reads as a keyboard)
		const kbX0 = -1.18;
		const kbX1 = 1.18;
		const kbZ0 = -0.36;
		const kbZ1 = 0.46;
		const cols = 14;
		const rows = 5;
		const kx = (kbX1 - kbX0) / cols;
		const kz = (kbZ1 - kbZ0) / rows;
		for (let r = 0; r < rows; r++) {
			for (let col = 0; col < cols; col++) {
				const isSpace = r === rows - 1 && col >= 4 && col <= 9;
				if (isSpace && col !== 4) continue;
				const cx = kbX0 + (col + 0.5) * kx;
				const cz = kbZ0 + (r + 0.5) * kz;
				const w = (isSpace ? kx * 6 : kx) * 0.62;
				const d = kz * 0.6;
				const n = isSpace ? 16 : 6;
				for (let i = 0; i < n; i++) {
					pos.push(cx + (Math.random() - 0.5) * w, 0.075, cz + (Math.random() - 0.5) * d);
					br.push(0.72); // keys pop above the deck
				}
			}
		}

		count = br.length;
		base = new Float32Array(pos);
		bright = new Float32Array(br);
		scatter = new Float32Array(count * 3);
		for (let i = 0; i < count * 3; i += 3) {
			scatter[i] = (Math.random() - 0.5) * 16;
			scatter[i + 1] = (Math.random() - 0.5) * 12;
			scatter[i + 2] = (Math.random() - 0.5) * 9;
		}
		live = scatter.slice();

		geom = new THREE.BufferGeometry();
		geom.setAttribute('position', new THREE.BufferAttribute(live, 3));
		const c = new THREE.Color(accent);
		const colors = new Float32Array(count * 3);
		for (let i = 0; i < count; i++) {
			const s = 0.3 + 0.7 * bright[i];
			colors[i * 3] = c.r * s;
			colors[i * 3 + 1] = c.g * s;
			colors[i * 3 + 2] = c.b * s;
		}
		geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		points = new THREE.Points(
			geom,
			new THREE.PointsMaterial({
				size: 0.027,
				vertexColors: true,
				transparent: true,
				opacity: 0.96,
				sizeAttenuation: true,
				depthWrite: false
			})
		);

		return () => window.removeEventListener('pointermove', onMove);
	});

	useTask((delta) => {
		if (!geom || !count) return;
		t += delta;
		intro = Math.min(1, intro + delta * 0.5);
		const e = 1 - Math.pow(1 - intro, 3);
		const k = Math.min(1, delta * 2.2);
		rotY += (-0.5 + pointer.x * 0.38 - rotY) * k;
		rotX += (pointer.y * 0.14 - rotX) * k;

		const a = live;
		for (let idx = 0; idx < count; idx++) {
			const j = idx * 3;
			const dx = Math.sin(t * 0.7 + idx) * 0.008;
			const dy = Math.cos(t * 0.55 + idx * 1.3) * 0.008;
			a[j] = scatter[j] + (base[j] - scatter[j]) * e + dx;
			a[j + 1] = scatter[j + 1] + (base[j + 1] - scatter[j + 1]) * e + dy;
			a[j + 2] = scatter[j + 2] + (base[j + 2] - scatter[j + 2]) * e;
		}
		(geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
	});
</script>

<T.PerspectiveCamera
	makeDefault
	position={[0.3, 2.4, 5.7]}
	fov={40}
	oncreate={(r) => r.lookAt(0, 0.55, 0)}
/>

{#if points}
	<T.Group position.x={1} position.y={0.15} rotation.y={rotY} rotation.x={rotX}>
		<T is={points} />
	</T.Group>
{/if}

import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

export type ShapeName = 'cubes' | 'mug' | 'keyboard' | 'ring' | 'pages' | 'graph';

type Pts = { pos: Float32Array; br: Float32Array };

function sampleMesh(mesh: THREE.Mesh, n: number, b: number, pos: number[], br: number[]) {
	mesh.updateMatrixWorld(true);
	const sampler = new MeshSurfaceSampler(mesh).build();
	const v = new THREE.Vector3();
	for (let i = 0; i < n; i++) {
		sampler.sample(v);
		v.applyMatrix4(mesh.matrixWorld);
		pos.push(v.x, v.y, v.z);
		br.push(b);
	}
}

/** Build a page-relevant object as a point cloud (centred at the origin). */
export function buildShape(name: ShapeName): Pts {
	const pos: number[] = [];
	const br: number[] = [];

	if (name === 'cubes') {
		// stacked / offset blocks → "projects"
		const g = new THREE.BoxGeometry(1.15, 1.15, 1.15);
		const places: Array<[number, number, number, number]> = [
			[-0.55, -0.55, 0.1, 0.5],
			[0.5, 0.05, -0.25, 0.72],
			[-0.05, 0.65, 0.3, 1.0]
		];
		for (const [x, y, z, b] of places) {
			const m = new THREE.Mesh(g);
			m.position.set(x, y, z);
			m.rotation.set(0.35, 0.6, 0.1);
			sampleMesh(m, 950, b, pos, br);
		}
	} else if (name === 'mug') {
		// coffee mug → "about" (coffee, craft)
		const body = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.62, 1.35, 40, 1, true));
		sampleMesh(body, 1700, 0.6, pos, br);
		const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.62, 28));
		bottom.rotation.x = -Math.PI / 2;
		bottom.position.y = -0.675;
		sampleMesh(bottom, 320, 0.5, pos, br);
		const handle = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 14, 28, Math.PI * 1.25));
		handle.position.set(0.78, 0, 0);
		handle.rotation.z = Math.PI / 2;
		sampleMesh(handle, 760, 0.82, pos, br);
		// rising steam
		for (let i = 0; i < 70; i++) {
			const s = i / 70;
			pos.push(Math.sin(s * 7) * 0.18, 0.8 + s * 1.15, Math.cos(s * 5) * 0.12);
			br.push(0.95);
		}
	} else if (name === 'keyboard') {
		// keyboard → "uses" (hardware / tools)
		const base = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.2, 1.25));
		sampleMesh(base, 1300, 0.4, pos, br);
		const cols = 12;
		const rows = 4;
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const x = -1.32 + c * 0.24;
				const z = -0.42 + r * 0.28;
				for (let i = 0; i < 7; i++) {
					pos.push(x + (Math.random() - 0.5) * 0.15, 0.13, z + (Math.random() - 0.5) * 0.18);
					br.push(0.88);
				}
			}
		}
	} else if (name === 'ring') {
		// orbiting ring → "now" (in motion / current focus)
		const t = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.3, 22, 90));
		t.rotation.x = 1.15;
		t.rotation.z = 0.2;
		sampleMesh(t, 2700, 0.58, pos, br);
		const node = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 18));
		node.position.set(1.35, 0, 0);
		sampleMesh(node, 360, 1.0, pos, br);
	} else if (name === 'pages') {
		// fanned sheets → "writing"
		const g = new THREE.BoxGeometry(1.7, 0.05, 2.2);
		for (let i = 0; i < 5; i++) {
			const m = new THREE.Mesh(g);
			m.position.set(i * 0.14 - 0.28, i * 0.17 - 0.34, i * 0.05);
			m.rotation.y = 0.18 + i * 0.06;
			m.rotation.z = -0.05;
			sampleMesh(m, 700, 0.45 + i * 0.11, pos, br);
		}
	} else {
		// node graph → "notes" (systems / connections)
		const nodes: THREE.Vector3[] = [];
		const N = 10;
		for (let i = 0; i < N; i++) {
			const a = (i / N) * Math.PI * 2;
			const r = 1.25 + (i % 3) * 0.32;
			nodes.push(
				new THREE.Vector3(Math.cos(a) * r, Math.sin(i * 1.9) * 0.85, Math.sin(a) * r * 0.65)
			);
		}
		const sg = new THREE.SphereGeometry(0.2, 16, 16);
		for (const n of nodes) {
			const m = new THREE.Mesh(sg);
			m.position.copy(n);
			sampleMesh(m, 200, 1.0, pos, br);
		}
		// edges as sampled line points
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				if ((i * 7 + j * 13) % 10 > 3) continue; // deterministic subset
				const a = nodes[i];
				const b = nodes[j];
				const steps = 26;
				for (let s = 0; s < steps; s++) {
					const tt = s / steps;
					pos.push(a.x + (b.x - a.x) * tt, a.y + (b.y - a.y) * tt, a.z + (b.z - a.z) * tt);
					br.push(0.4);
				}
			}
		}
	}

	return { pos: new Float32Array(pos), br: new Float32Array(br) };
}

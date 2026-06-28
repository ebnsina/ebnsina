<script>
	// @ts-nocheck
	// Self-contained vanilla-JS interactive demo, ported verbatim; runs client-side.
	import { onMount } from 'svelte';
	import './cdn-playground.css';

	onMount(() => {
		(function () {
			/* ── 1. Request Flow Visualizer ── */
			const packet = document.getElementById('packet');
			const popTTL = document.getElementById('pop-ttl');
			const latLabel = document.getElementById('latency-label');
			const statusBadge = document.getElementById('flow-status');
			const log = document.getElementById('flow-log');
			const nodePop = document.getElementById('node-pop');
			const popCache = { sg: null, de: null, us: null };
			const TTL_SEC = 60;
			let animating = false;

			function addFlowLog(msg, cls) {
				const emp = log.querySelector('.pg-log-empty');
				if (emp) emp.remove();
				const d = document.createElement('div');
				d.className = cls || '';
				d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
				log.appendChild(d);
				log.scrollTop = log.scrollHeight;
			}
			function updatePopDisplay(region) {
				const entry = popCache[region];
				if (!entry) {
					popTTL.textContent = 'cache: empty';
					nodePop.setAttribute('stroke', '#999');
				} else {
					const remaining = Math.max(0, Math.round((entry.exp - Date.now()) / 1000));
					popTTL.textContent = remaining > 0 ? 'cached — TTL ' + remaining + 's' : 'cache: expired';
					nodePop.setAttribute('stroke', remaining > 0 ? '#1e6b3a' : '#b31412');
				}
			}
			function animatePacket(x1, x2, y, duration, color) {
				return new Promise((resolve) => {
					packet.setAttribute('cx', x1);
					packet.setAttribute('cy', y);
					packet.setAttribute('fill', color);
					packet.setAttribute('opacity', '1');
					const start = performance.now();
					function step(now) {
						const t = Math.min((now - start) / duration, 1);
						packet.setAttribute('cx', x1 + (x2 - x1) * t);
						if (t < 1) requestAnimationFrame(step);
						else {
							packet.setAttribute('opacity', '0');
							resolve();
						}
					}
					requestAnimationFrame(step);
				});
			}
			function showLatency(text) {
				latLabel.textContent = text;
				latLabel.setAttribute('opacity', '1');
				setTimeout(() => latLabel.setAttribute('opacity', '0'), 1800);
			}
			function setFlowStatus(text, cls) {
				statusBadge.textContent = text;
				statusBadge.className = 'pg-badge ' + (cls || '');
			}
			async function sendRequest() {
				if (animating) return;
				animating = true;
				document.getElementById('btn-send').disabled = true;
				const region = document.getElementById('sel-region').value;
				const entry = popCache[region];
				const isHit = entry && entry.exp > Date.now();
				setFlowStatus(isHit ? 'HIT' : 'MISS', isHit ? 'hit' : 'miss');
				await animatePacket(70, 350, 95, 400, '#4a4a4a');
				if (isHit) {
					showLatency('~8ms  HIT');
					addFlowLog('GET /resource → PoP [' + region + '] — X-Cache: HIT (~8ms)', 'log-hit');
					await animatePacket(350, 70, 95, 350, '#1e6b3a');
				} else {
					await animatePacket(350, 630, 95, 500, '#b31412');
					showLatency('~180ms  MISS');
					await animatePacket(630, 350, 95, 500, '#555');
					popCache[region] = { exp: Date.now() + TTL_SEC * 1000 };
					addFlowLog(
						'GET /resource → PoP [' + region + '] → origin — X-Cache: MISS (~180ms)',
						'log-miss'
					);
					await animatePacket(350, 70, 95, 400, '#4a4a4a');
				}
				updatePopDisplay(region);
				animating = false;
				document.getElementById('btn-send').disabled = false;
			}
			document.getElementById('btn-send').addEventListener('click', sendRequest);
			document.getElementById('btn-purge').addEventListener('click', () => {
				const region = document.getElementById('sel-region').value;
				popCache[region] = null;
				updatePopDisplay(region);
				setFlowStatus('purged', '');
				addFlowLog('PURGE PoP [' + region + '] — cache cleared', 'log-info');
			});
			document.getElementById('sel-region').addEventListener('change', () => {
				updatePopDisplay(document.getElementById('sel-region').value);
			});
			setInterval(() => updatePopDisplay(document.getElementById('sel-region').value), 1000);
		})();

		(function () {
			/* ── 2. Cache-Control Header Builder ── */
			function build() {
				const vis = document.querySelector('input[name="vis"]:checked').value;
				const maxAge = parseInt(document.getElementById('max-age').value) || 0;
				const sMaxAge = document.getElementById('s-maxage').value;
				const immut = document.getElementById('immutable').checked;
				const swr = document.getElementById('swr').checked;
				const sie = document.getElementById('sie').checked;
				const mustRev = document.getElementById('must-rev').checked;
				const noStore = vis === 'no-store';
				document.getElementById('ttl-group').style.opacity = noStore ? '0.3' : '1';
				document.getElementById('smaxage-group').style.opacity =
					noStore || vis === 'private' ? '0.3' : '1';
				document.getElementById('extras-group').style.opacity = noStore ? '0.3' : '1';
				let parts = [];
				if (noStore) {
					parts = ['no-store'];
				} else {
					parts.push(vis);
					parts.push('max-age=' + maxAge);
					if (sMaxAge !== '' && vis === 'public') parts.push('s-maxage=' + sMaxAge);
					if (immut) parts.push('immutable');
					if (swr) parts.push('stale-while-revalidate=60');
					if (sie) parts.push('stale-if-error=86400');
					if (mustRev) parts.push('must-revalidate');
				}
				document.getElementById('cc-output').textContent = 'Cache-Control: ' + parts.join(', ');
				let html;
				if (noStore) {
					html =
						'<span class="tag tag-none">browser: skip</span><span class="tag tag-none">CDN: skip</span><p>Nothing is cached anywhere. Every request hits your origin. Use for sensitive data (auth tokens, bank statements).</p>';
				} else if (vis === 'private') {
					html =
						'<span class="tag tag-browser">browser: ' +
						fmt(maxAge) +
						'</span><span class="tag tag-none">CDN: skip</span><p>Only the browser may cache this. Shared caches (CDN, proxies) must not store it. Correct for authenticated pages — different users see different content.</p>';
				} else {
					const cdnTTL = sMaxAge !== '' ? parseInt(sMaxAge) : maxAge;
					html =
						'<span class="tag tag-browser">browser: ' +
						fmt(maxAge) +
						'</span><span class="tag tag-cdn">CDN: ' +
						fmt(cdnTTL) +
						'</span>';
					if (immut)
						html +=
							'<p><strong>immutable</strong>: browser will not revalidate even when TTL expires. Only safe with content-hashed filenames (e.g. <code>app.8a3f.js</code>).</p>';
					if (swr)
						html +=
							'<p><strong>stale-while-revalidate</strong>: serve the stale copy immediately, then fetch fresh in the background. Hit rate stays high during origin fetches.</p>';
					if (sie)
						html +=
							'<p><strong>stale-if-error</strong>: keep serving stale for 1 day if origin returns 5xx or is unreachable. Your site stays up during origin outages.</p>';
					if (mustRev)
						html +=
							'<p><strong>must-revalidate</strong>: once stale, must check origin first. Use when stale content would cause serious problems (e.g. expired prices).</p>';
					if (!immut && !swr && !sie && !mustRev)
						html +=
							'<p>Standard caching. CDN stores for ' +
							fmt(cdnTTL) +
							', browser for ' +
							fmt(maxAge) +
							'. On TTL expiry, CDN checks origin with <code>If-None-Match</code>. Origin returns 304 if unchanged.</p>';
				}
				document.getElementById('cc-interpret').innerHTML = html;
			}
			function fmt(s) {
				if (s >= 86400) return Math.round(s / 86400) + 'd';
				if (s >= 3600) return Math.round(s / 3600) + 'h';
				if (s >= 60) return Math.round(s / 60) + 'm';
				return s + 's';
			}
			document
				.querySelectorAll(
					'input[name="vis"], #max-age, #s-maxage, #immutable, #swr, #sie, #must-rev'
				)
				.forEach((el) => el.addEventListener('input', build));
			build();
		})();

		(function () {
			/* ── 3. Mini CDN Simulator ── */
			const pops = {
				sg: { hits: 0, misses: 0, cache: {} },
				de: { hits: 0, misses: 0, cache: {} },
				us: { hits: 0, misses: 0, cache: {} }
			};
			const TTL = 30;
			const log = document.getElementById('sim-log');
			function addSimLog(msg, cls) {
				const emp = log.querySelector('.pg-log-empty');
				if (emp) emp.remove();
				const d = document.createElement('div');
				d.className = cls || '';
				d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
				log.appendChild(d);
				log.scrollTop = log.scrollHeight;
			}
			function renderPop(region) {
				const pop = pops[region];
				const url = document.getElementById('sim-url').value || '/';
				const entry = pop.cache[url];
				const now = Date.now();
				const isHit = entry && entry.exp > now;
				const ttlRem = entry ? Math.max(0, Math.round((entry.exp - now) / 1000)) : 0;
				document.getElementById(region + '-status').textContent = isHit
					? 'HIT'
					: entry
						? 'EXPIRED'
						: 'empty';
				document.getElementById(region + '-status').className =
					'sim-pop-status' + (isHit ? ' hit' : entry ? ' miss' : '');
				document.getElementById(region + '-ttl').textContent = isHit ? 'TTL: ' + ttlRem + 's' : '—';
				document.getElementById(region + '-stats').innerHTML =
					'HIT: ' + pop.hits + ' &nbsp; MISS: ' + pop.misses;
			}
			function request(region) {
				const url = document.getElementById('sim-url').value || '/';
				const pop = pops[region];
				const entry = pop.cache[url];
				const now = Date.now();
				const isHit = entry && entry.exp > now;
				const labels = { sg: 'Singapore', de: 'Frankfurt', us: 'Virginia' };
				if (isHit) {
					pop.hits++;
					addSimLog(labels[region] + '  GET ' + url + '  →  X-Cache: HIT  (~6ms)', 'log-hit');
				} else {
					pop.misses++;
					pop.cache[url] = { exp: now + TTL * 1000 };
					addSimLog(
						labels[region] + '  GET ' + url + '  →  X-Cache: MISS  (~190ms, fetched from origin)',
						'log-miss'
					);
				}
				renderPop(region);
			}
			document.getElementById('sim-sg').addEventListener('click', () => request('sg'));
			document.getElementById('sim-de').addEventListener('click', () => request('de'));
			document.getElementById('sim-us').addEventListener('click', () => request('us'));
			document.getElementById('sim-purge-all').addEventListener('click', () => {
				['sg', 'de', 'us'].forEach((r) => {
					pops[r].cache = {};
					renderPop(r);
				});
				addSimLog('PURGE ALL — cache cleared across all PoPs', 'log-info');
			});
			document
				.getElementById('sim-url')
				.addEventListener('input', () => ['sg', 'de', 'us'].forEach((r) => renderPop(r)));
			setInterval(() => ['sg', 'de', 'us'].forEach((r) => renderPop(r)), 1000);
			['sg', 'de', 'us'].forEach((r) => renderPop(r));
		})();

		(function () {
			/* ── 4. Full CDN Stack Journey ── */
			const log = document.getElementById('stack-log');
			const badge = document.getElementById('stack-badge');
			let running = false;
			function sleep(ms) {
				return new Promise((r) => setTimeout(r, ms));
			}
			function addStackLog(msg, cls) {
				const emp = log.querySelector('.pg-log-empty');
				if (emp) emp.remove();
				const d = document.createElement('div');
				d.className = cls || 'log-info';
				d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
				log.appendChild(d);
				log.scrollTop = log.scrollHeight;
			}
			function layoutWires() {
				const wrap = document.querySelector('.stack-wrap');
				if (!wrap) return;
				const wrapRect = wrap.getBoundingClientRect();
				['sn-user', 'sn-gcore', 'sn-shield', 'sn-origin'].map((id) =>
					document.getElementById(id).getBoundingClientRect()
				);
				const rects = ['sn-user', 'sn-gcore', 'sn-shield', 'sn-origin'].map((id) =>
					document.getElementById(id).getBoundingClientRect()
				);
				[
					['wire-ug', 0, 1],
					['wire-gs', 1, 2],
					['wire-so', 2, 3]
				].forEach(([wid, a, b]) => {
					const w = document.getElementById(wid);
					const left = rects[a].right - wrapRect.left;
					const right = rects[b].left - wrapRect.left;
					w.style.left = left + 'px';
					w.style.width = Math.max(0, right - left) + 'px';
				});
			}
			function resetAll() {
				['sn-user', 'sn-gcore', 'sn-shield', 'sn-origin'].forEach((id) => {
					const n = document.getElementById(id);
					n.classList.remove('active');
					const ms = n.querySelector('.sn-ms');
					if (ms) ms.textContent = '';
				});
				['sl-ddos', 'sl-rules', 'sl-tls', 'sl-cdncache', 'sl-access', 'sl-ram', 'sl-disk'].forEach(
					(id) => {
						const el = document.getElementById(id);
						if (el) el.className = 'sn-layer';
					}
				);
				const pkt = document.getElementById('stack-pkt');
				pkt.style.opacity = '0';
				badge.textContent = '—';
				badge.className = 'pg-badge';
				layoutWires();
			}
			async function animPacket(fromId, toId, color) {
				const wrap = document.querySelector('.stack-wrap');
				const pkt = document.getElementById('stack-pkt');
				const wrapRect = wrap.getBoundingClientRect();
				const fromRect = document.getElementById(fromId).getBoundingClientRect();
				const toRect = document.getElementById(toId).getBoundingClientRect();
				pkt.style.transition = 'none';
				pkt.style.left = fromRect.right - wrapRect.left - 6 + 'px';
				pkt.style.background = color || '#4a4a4a';
				pkt.style.opacity = '1';
				await sleep(20);
				pkt.style.transition = 'left 0.45s cubic-bezier(.4,0,.2,1)';
				pkt.style.left = toRect.left - wrapRect.left - 6 + 'px';
				await sleep(480);
			}
			function lightLayer(id, cls) {
				const el = document.getElementById(id);
				if (el) el.className = 'sn-layer ' + cls;
			}
			function lightNode(id) {
				document.getElementById(id).classList.add('active');
			}
			function setMs(id, text) {
				const el = document.getElementById(id + '-ms');
				if (el) el.textContent = text;
			}
			function setBadge(text, cls) {
				badge.textContent = text;
				badge.className = 'pg-badge ' + (cls || '');
			}
			const scenarios = {
				'cdn-hit': async () => {
					setBadge('running…', '');
					addStackLog('GET /assets/logo.png  (Gcore CDN Cache HIT)', 'log-info');
					lightNode('sn-user');
					await animPacket('sn-user', 'sn-gcore', '#4a4a4a');
					lightNode('sn-gcore');
					lightLayer('sl-ddos', 'pass');
					await sleep(300);
					lightLayer('sl-tls', 'pass');
					await sleep(300);
					lightLayer('sl-rules', 'pass');
					await sleep(300);
					lightLayer('sl-cdncache', 'hit');
					await sleep(400);
					addStackLog('Gcore CDN Cache: HIT  (TTL 3580s remaining)', 'log-hit');
					setMs('sn-gcore', '~6ms');
					await animPacket('sn-gcore', 'sn-user', '#1e6b3a');
					setBadge('HIT — 6ms', 'hit');
					addStackLog('Response delivered. Origin never contacted.', 'log-hit');
				},
				'ram-hit': async () => {
					setBadge('running…', '');
					addStackLog('GET /api/products  (Gcore MISS → OpenResty RAM HIT)', 'log-info');
					lightNode('sn-user');
					await animPacket('sn-user', 'sn-gcore', '#4a4a4a');
					lightNode('sn-gcore');
					lightLayer('sl-ddos', 'pass');
					await sleep(250);
					lightLayer('sl-tls', 'pass');
					await sleep(250);
					lightLayer('sl-rules', 'pass');
					await sleep(250);
					lightLayer('sl-cdncache', 'miss');
					await sleep(350);
					addStackLog('Gcore CDN: MISS — forwarding to shield', 'log-miss');
					await animPacket('sn-gcore', 'sn-shield', '#4a4a4a');
					lightNode('sn-shield');
					lightLayer('sl-access', 'pass');
					await sleep(300);
					lightLayer('sl-ram', 'hit');
					await sleep(400);
					addStackLog('OpenResty RAM cache: HIT  (~0.1ms lookup)', 'log-hit');
					setMs('sn-shield', '~18ms');
					await animPacket('sn-shield', 'sn-user', '#1e6b3a');
					setBadge('RAM HIT — 18ms', 'hit');
				},
				'disk-hit': async () => {
					setBadge('running…', '');
					addStackLog('GET /static/data.json  (Gcore MISS → RAM MISS → Disk HIT)', 'log-info');
					lightNode('sn-user');
					await animPacket('sn-user', 'sn-gcore', '#4a4a4a');
					lightNode('sn-gcore');
					lightLayer('sl-ddos', 'pass');
					await sleep(200);
					lightLayer('sl-tls', 'pass');
					await sleep(200);
					lightLayer('sl-rules', 'pass');
					await sleep(200);
					lightLayer('sl-cdncache', 'miss');
					await sleep(300);
					await animPacket('sn-gcore', 'sn-shield', '#4a4a4a');
					lightNode('sn-shield');
					lightLayer('sl-access', 'pass');
					await sleep(250);
					lightLayer('sl-ram', 'miss');
					await sleep(300);
					lightLayer('sl-disk', 'hit');
					await sleep(400);
					addStackLog('Disk cache: HIT  (NVMe, ~1ms read)', 'log-hit');
					setMs('sn-shield', '~22ms');
					await animPacket('sn-shield', 'sn-user', '#1e6b3a');
					setBadge('Disk HIT — 22ms', 'hit');
				},
				'full-miss': async () => {
					setBadge('running…', '');
					addStackLog('GET /api/live-prices  (full MISS — all caches cold)', 'log-info');
					lightNode('sn-user');
					await animPacket('sn-user', 'sn-gcore', '#4a4a4a');
					lightNode('sn-gcore');
					lightLayer('sl-ddos', 'pass');
					await sleep(200);
					lightLayer('sl-tls', 'pass');
					await sleep(200);
					lightLayer('sl-rules', 'pass');
					await sleep(200);
					lightLayer('sl-cdncache', 'miss');
					await sleep(250);
					await animPacket('sn-gcore', 'sn-shield', '#4a4a4a');
					lightNode('sn-shield');
					lightLayer('sl-access', 'pass');
					await sleep(200);
					lightLayer('sl-ram', 'miss');
					await sleep(250);
					lightLayer('sl-disk', 'miss');
					await sleep(300);
					addStackLog('All caches cold. Fetching from origin…', 'log-miss');
					await animPacket('sn-shield', 'sn-origin', '#b31412');
					lightNode('sn-origin');
					setMs('sn-origin', '~140ms');
					await sleep(500);
					addStackLog('Origin responded 200 OK. Caching at disk → Gcore.', 'log-info');
					lightLayer('sl-disk', 'pass');
					await sleep(200);
					await animPacket('sn-origin', 'sn-shield', '#555');
					lightLayer('sl-cdncache', 'pass');
					await animPacket('sn-shield', 'sn-gcore', '#555');
					await animPacket('sn-gcore', 'sn-user', '#4a4a4a');
					setMs('sn-shield', '~160ms');
					setBadge('MISS — 160ms', 'miss');
					addStackLog('Next request to any PoP: HIT.', 'log-hit');
				},
				'waf-block': async () => {
					setBadge('running…', '');
					addStackLog("GET /?q=' OR 1=1--  (SQL injection attempt)", 'log-info');
					lightNode('sn-user');
					await animPacket('sn-user', 'sn-gcore', '#b31412');
					lightNode('sn-gcore');
					lightLayer('sl-ddos', 'pass');
					await sleep(300);
					lightLayer('sl-tls', 'pass');
					await sleep(300);
					lightLayer('sl-rules', 'block');
					await sleep(400);
					addStackLog('WAF rule matched: sqli-tautology → 403 Forbidden', 'log-miss');
					setMs('sn-gcore', '~2ms');
					await animPacket('sn-gcore', 'sn-user', '#b31412');
					setBadge('WAF BLOCK — 403', 'miss');
					addStackLog('Shield and origin never saw this request.', 'log-hit');
				},
				'rate-limit': async () => {
					setBadge('running…', '');
					addStackLog('GET /api/data  (IP over rate limit)', 'log-info');
					lightNode('sn-user');
					await animPacket('sn-user', 'sn-gcore', '#4a4a4a');
					lightNode('sn-gcore');
					lightLayer('sl-ddos', 'pass');
					await sleep(200);
					lightLayer('sl-tls', 'pass');
					await sleep(200);
					lightLayer('sl-rules', 'pass');
					await sleep(200);
					lightLayer('sl-cdncache', 'miss');
					await sleep(250);
					await animPacket('sn-gcore', 'sn-shield', '#4a4a4a');
					lightNode('sn-shield');
					lightLayer('sl-access', 'block');
					await sleep(400);
					addStackLog('access.lua: token bucket empty for this IP → 429', 'log-miss');
					setMs('sn-shield', '~5ms');
					await animPacket('sn-shield', 'sn-user', '#b31412');
					setBadge('RATE LIMITED — 429', 'miss');
				},
				'origin-down': async () => {
					setBadge('running…', '');
					addStackLog('GET /index.html  (origin is down, serving stale)', 'log-info');
					lightNode('sn-user');
					await animPacket('sn-user', 'sn-gcore', '#4a4a4a');
					lightNode('sn-gcore');
					lightLayer('sl-ddos', 'pass');
					await sleep(200);
					lightLayer('sl-tls', 'pass');
					await sleep(200);
					lightLayer('sl-rules', 'pass');
					await sleep(200);
					lightLayer('sl-cdncache', 'miss');
					await sleep(250);
					await animPacket('sn-gcore', 'sn-shield', '#4a4a4a');
					lightNode('sn-shield');
					lightLayer('sl-access', 'pass');
					await sleep(200);
					lightLayer('sl-ram', 'miss');
					await sleep(200);
					lightLayer('sl-disk', 'miss');
					await sleep(250);
					await animPacket('sn-shield', 'sn-origin', '#b31412');
					lightNode('sn-origin');
					setMs('sn-origin', 'timeout ✗');
					await sleep(700);
					addStackLog(
						'Origin timeout after 5s. Serving stale from disk (stale-if-error).',
						'log-miss'
					);
					lightLayer('sl-disk', 'hit');
					await sleep(300);
					await animPacket('sn-origin', 'sn-shield', '#e0a000');
					await animPacket('sn-shield', 'sn-user', '#e0a000');
					setMs('sn-shield', 'STALE ~5s');
					setBadge('STALE — origin down', '');
					addStackLog('User received stale copy. Site stays up. (X-Cache: STALE)', 'log-hit');
				}
			};
			document.querySelectorAll('.scen-btn').forEach((btn) => {
				btn.addEventListener('click', async () => {
					if (running) return;
					running = true;
					resetAll();
					document.querySelectorAll('.scen-btn').forEach((b) => (b.disabled = true));
					await sleep(50);
					layoutWires();
					await scenarios[btn.dataset.scen]();
					running = false;
					document.querySelectorAll('.scen-btn').forEach((b) => (b.disabled = false));
				});
			});
			window.addEventListener('resize', layoutWires);
			setTimeout(layoutWires, 100);
		})();

		(function () {
			/* ── 5. nginx Phase Pipeline ── */
			const ball = document.getElementById('phase-ball');
			const status = document.getElementById('phase-status');
			const phases = [
				'ph-set',
				'ph-rewrite',
				'ph-access',
				'ph-cache',
				'ph-proxy',
				'ph-hf',
				'ph-log'
			];
			const phEls = phases.map((id) => document.getElementById(id));
			let running = false;
			function sleep(ms) {
				return new Promise((r) => setTimeout(r, ms));
			}
			function moveBall(idx, color) {
				const wrap = document.querySelector('.phase-wrap');
				if (!wrap || !phEls[idx]) return;
				const r = phEls[idx].getBoundingClientRect();
				const cx = r.left + r.width / 2 - wrap.getBoundingClientRect().left;
				ball.style.left = cx - 7 + 'px';
				ball.style.background = color || '#4a4a4a';
			}
			function resetPhases() {
				phEls.forEach((el) => {
					el.className = 'phase-box';
				});
				ball.style.transition = 'none';
				ball.style.left = '-20px';
				status.textContent = '—';
			}
			async function runPhases(steps) {
				running = true;
				document.querySelectorAll('.phase-scen').forEach((b) => (b.disabled = true));
				resetPhases();
				await sleep(60);
				ball.style.transition = 'left 0.4s cubic-bezier(.4,0,.2,1), background 0.2s';
				for (const step of steps) {
					const idx = phases.indexOf(step.phase);
					if (idx < 0) break;
					moveBall(
						idx,
						step.color === 'block' ? '#b31412' : step.color === 'mod' ? '#e0a000' : '#4a4a4a'
					);
					phEls[idx].className = 'phase-box ' + (step.color || 'pass');
					status.textContent = step.note || '';
					await sleep(step.halt ? 800 : 520);
					if (step.halt) break;
				}
				running = false;
				document.querySelectorAll('.phase-scen').forEach((b) => (b.disabled = false));
			}
			const scenData = {
				normal: [
					{ phase: 'ph-set', color: 'pass', note: 'Variables computed from request headers' },
					{ phase: 'ph-rewrite', color: 'pass', note: 'No rewrite rules matched' },
					{ phase: 'ph-access', color: 'pass', note: 'Rate limit OK — token consumed' },
					{ phase: 'ph-cache', color: 'pass', note: 'Cache MISS — forwarding to upstream' },
					{ phase: 'ph-proxy', color: 'pass', note: 'Origin returned 200 OK in 140ms' },
					{ phase: 'ph-hf', color: 'mod', note: 'X-Cache: MISS header injected' },
					{ phase: 'ph-log', color: 'pass', note: 'Metrics pushed to Redis' }
				],
				'cache-hit': [
					{ phase: 'ph-set', color: 'pass', note: 'Variables computed' },
					{ phase: 'ph-rewrite', color: 'pass', note: 'No rewrite matched' },
					{ phase: 'ph-access', color: 'pass', note: 'Rate limit OK' },
					{
						phase: 'ph-cache',
						color: 'pass',
						note: 'Cache HIT — served from disk in ~1ms',
						halt: true
					}
				],
				'rate-limit': [
					{ phase: 'ph-set', color: 'pass', note: 'Variables computed' },
					{ phase: 'ph-rewrite', color: 'pass', note: 'No rewrite matched' },
					{
						phase: 'ph-access',
						color: 'block',
						note: 'Token bucket empty → 429 Too Many Requests',
						halt: true
					}
				],
				waf: [
					{ phase: 'ph-set', color: 'pass', note: 'Variables computed' },
					{ phase: 'ph-rewrite', color: 'pass', note: 'Checking rewrite rules…' },
					{
						phase: 'ph-access',
						color: 'block',
						note: 'WAF: sqli-union pattern matched → 403 Forbidden',
						halt: true
					}
				],
				'jwt-fail': [
					{ phase: 'ph-set', color: 'pass', note: 'Variables computed' },
					{ phase: 'ph-rewrite', color: 'pass', note: 'No rewrite matched' },
					{
						phase: 'ph-access',
						color: 'block',
						note: 'JWT signature invalid → 401 Unauthorized',
						halt: true
					}
				],
				private: [
					{ phase: 'ph-set', color: 'pass', note: 'Variables computed' },
					{ phase: 'ph-rewrite', color: 'pass', note: 'No rewrite matched' },
					{ phase: 'ph-access', color: 'pass', note: 'Session cookie verified' },
					{ phase: 'ph-cache', color: 'mod', note: 'Cache bypassed — Cache-Control: private' },
					{ phase: 'ph-proxy', color: 'pass', note: 'Origin served personalised response' },
					{ phase: 'ph-hf', color: 'mod', note: 'Set-Cookie + private headers preserved' },
					{ phase: 'ph-log', color: 'pass', note: 'Logged — user_id from JWT claim' }
				]
			};
			document.querySelectorAll('.phase-scen').forEach((btn) => {
				btn.addEventListener('click', () => {
					if (!running) runPhases(scenData[btn.dataset.scen]);
				});
			});
		})();

		(function () {
			/* ── 6. Token Bucket ── */
			const CAPACITY = 20,
				REFILL = 3;
			let tokens = CAPACITY,
				allowed = 0,
				rejected = 0;
			const bucketEl = document.getElementById('tb-bucket');
			const levelEl = document.getElementById('tb-level');
			const tokensVal = document.getElementById('tb-tokens-val');
			const allowedEl = document.getElementById('tb-allowed');
			const rejectedEl = document.getElementById('tb-rejected');
			const logEl = document.getElementById('tb-log');
			function renderBucket() {
				const n = Math.round(tokens);
				bucketEl.innerHTML = '';
				for (let i = 0; i < CAPACITY; i++) {
					const d = document.createElement('div');
					d.className = 'token-dot' + (i < n ? '' : ' used');
					bucketEl.appendChild(d);
				}
				levelEl.textContent = n + ' / ' + CAPACITY;
				tokensVal.textContent = n;
				allowedEl.textContent = allowed;
				rejectedEl.textContent = rejected;
			}
			function addBucketLog(msg, cls) {
				const d = document.createElement('div');
				d.className = cls || '';
				d.textContent = msg;
				logEl.prepend(d);
				if (logEl.children.length > 20) logEl.lastChild.remove();
			}
			function sendOne(label) {
				if (tokens >= 1) {
					tokens -= 1;
					allowed++;
					addBucketLog(
						'✓ ' + (label || 'request') + ' allowed  [' + Math.round(tokens) + ' tokens left]',
						'bl-ok'
					);
				} else {
					rejected++;
					addBucketLog('✗ ' + (label || 'request') + ' rejected — 429  [bucket empty]', 'bl-err');
				}
				renderBucket();
			}
			document.getElementById('tb-one').addEventListener('click', () => sendOne('GET /api'));
			document.getElementById('tb-burst').addEventListener('click', async () => {
				for (let i = 0; i < 10; i++) {
					sendOne('burst #' + (i + 1));
					await new Promise((r) => setTimeout(r, 60));
				}
			});
			document.getElementById('tb-reset').addEventListener('click', () => {
				tokens = CAPACITY;
				allowed = 0;
				rejected = 0;
				logEl.innerHTML = '';
				renderBucket();
			});
			let last = performance.now();
			function tick(now) {
				tokens = Math.min(CAPACITY, tokens + ((now - last) / 1000) * REFILL);
				last = now;
				renderBucket();
				requestAnimationFrame(tick);
			}
			requestAnimationFrame(tick);
			renderBucket();
		})();

		(function () {
			/* ── 7. Cache State Machine ── */
			const STATES = ['empty', 'fetch', 'fresh', 'stale', 'reval'];
			const TTL_DEMO = 12;
			let current = 0,
				ttlStart = null,
				autoTimer = null,
				ttlTimer = null;
			const badge = document.getElementById('csm-badge');
			const ttlVal = document.getElementById('csm-ttl-val');
			const ttlFill = document.getElementById('csm-ttl-fill');
			const explain = document.getElementById('csm-explain');
			const info = {
				empty: {
					badge: 'EMPTY',
					fill: 0,
					text: 'No object in cache. Next request will cause a MISS and trigger a fetch from origin.'
				},
				fetch: {
					badge: 'FETCHING',
					fill: 0,
					text: 'Request sent to origin. Single-flight lock held — concurrent requests wait rather than all hit origin simultaneously.'
				},
				fresh: {
					badge: 'HIT ✓',
					fill: 100,
					text: 'Object cached and within TTL. Every request served instantly from cache. Origin sees zero traffic for this URL.'
				},
				stale: {
					badge: 'STALE',
					fill: 0,
					text: 'TTL expired. Object still in cache. stale-while-revalidate lets us serve it immediately while fetching a fresh copy in the background.'
				},
				reval: {
					badge: 'REVALIDATING',
					fill: 0,
					text: 'Edge sends If-None-Match: "<etag>" to origin. If unchanged, origin returns 304 (no body) — cheap and fast. TTL reset.'
				}
			};
			function go(idx) {
				if (ttlTimer) {
					clearInterval(ttlTimer);
					ttlTimer = null;
				}
				current = ((idx % STATES.length) + STATES.length) % STATES.length;
				const state = STATES[current],
					d = info[state];
				STATES.forEach((s, i) =>
					document.getElementById('css-' + s).classList.toggle('active', i === current)
				);
				badge.textContent = d.badge;
				badge.className =
					'pg-badge ' +
					(state === 'fresh' ? 'hit' : state === 'stale' || state === 'reval' ? 'miss' : '');
				ttlFill.style.width = d.fill + '%';
				ttlVal.textContent = state === 'fresh' ? TTL_DEMO + 's' : '—';
				explain.textContent = d.text;
				if (state === 'fresh') {
					ttlStart = Date.now();
					ttlTimer = setInterval(() => {
						const rem = Math.max(0, TTL_DEMO - (Date.now() - ttlStart) / 1000);
						ttlVal.textContent = rem.toFixed(1) + 's';
						ttlFill.style.width = (rem / TTL_DEMO) * 100 + '%';
						if (rem <= 0) {
							clearInterval(ttlTimer);
							ttlTimer = null;
						}
					}, 100);
				}
			}
			document.getElementById('csm-step').addEventListener('click', () => go(current + 1));
			document.getElementById('csm-auto').addEventListener('click', () => {
				if (autoTimer) {
					clearInterval(autoTimer);
					autoTimer = null;
					return;
				}
				go(0);
				autoTimer = setInterval(
					() => {
						if (current >= STATES.length - 1) {
							clearInterval(autoTimer);
							autoTimer = null;
							return;
						}
						go(current + 1);
					},
					current === 2 ? TTL_DEMO * 1000 + 500 : 1800
				);
			});
			document.getElementById('csm-purge').addEventListener('click', () => {
				if (ttlTimer) {
					clearInterval(ttlTimer);
					ttlTimer = null;
				}
				if (autoTimer) {
					clearInterval(autoTimer);
					autoTimer = null;
				}
				go(0);
				explain.textContent =
					'Cache purged. Object evicted immediately. Next request will MISS and fetch from origin.';
			});
			document.getElementById('csm-reset').addEventListener('click', () => {
				if (ttlTimer) {
					clearInterval(ttlTimer);
					ttlTimer = null;
				}
				if (autoTimer) {
					clearInterval(autoTimer);
					autoTimer = null;
				}
				go(0);
			});
			go(0);
		})();
	});
</script>

<h3 class="pg-section-heading">Request flow visualizer</h3>

<p class="pg-section-text">
	Click <strong>Send Request</strong> to simulate a user request hitting the CDN. The first request
	goes all the way to origin (MISS). Subsequent ones are served from the edge PoP (HIT). Hit
	<strong>Purge</strong> to evict the cache and watch the next request go to origin again.
</p>

<div class="pg-card">
	<div class="pg-toolbar">
		<button
			class="pg-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			id="btn-send">Send Request</button
		>
		<button
			class="pg-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-transparent text-fg border border-rule cursor-pointer hover:bg-rule disabled:opacity-35 disabled:cursor-not-allowed transition-colors duration-150"
			id="btn-purge">Purge Cache</button
		>
		<select
			class="pg-select font-['Cabin_Condensed'] text-[13px] px-2.5 py-1.5 border border-rule rounded-xl bg-bg text-fg focus:outline-none cursor-pointer appearance-none"
			id="sel-region"
		>
			<option value="sg">Singapore PoP</option>
			<option value="de">Frankfurt PoP</option>
			<option value="us">Virginia PoP</option>
		</select>
		<span class="pg-badge" id="flow-status">—</span>
	</div>
	<svg id="flow-svg" viewBox="0 0 700 180" xmlns="http://www.w3.org/2000/svg">
		<defs>
			<symbol id="ico-user" viewBox="0 0 20 20" fill="currentColor">
				<path d="M10 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0H3z" />
			</symbol>
			<symbol id="ico-server" viewBox="0 0 20 20" fill="currentColor">
				<path
					d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5zm2 6a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H4zm1-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"
				/>
			</symbol>
			<symbol id="ico-monitor" viewBox="0 0 20 20" fill="currentColor">
				<path
					d="M2 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4zm14 9V4H4v9h12zM7 17h6l.5 1.5H6.5L7 17z"
				/>
			</symbol>
		</defs>
		<text id="latency-label" x="350" y="18" class="svg-latency" text-anchor="middle" opacity="0"
			>—</text
		>
		<text id="pop-ttl" x="350" y="38" class="svg-small" text-anchor="middle">cache: empty</text>
		<line x1="100" y1="95" x2="318" y2="95" stroke="#e0e0e0" stroke-width="2" />
		<line
			x1="382"
			y1="95"
			x2="608"
			y2="95"
			stroke="#e0e0e0"
			stroke-width="2"
			stroke-dasharray="6 4"
		/>
		<circle
			id="node-user"
			cx="70"
			cy="95"
			r="28"
			fill="transparent"
			stroke="#999"
			stroke-width="1.5"
		/>
		<circle
			id="node-pop"
			cx="350"
			cy="95"
			r="36"
			fill="transparent"
			stroke="#999"
			stroke-width="1.5"
		/>
		<circle
			id="node-orig"
			cx="630"
			cy="95"
			r="28"
			fill="transparent"
			stroke="#999"
			stroke-width="1.5"
		/>
		<use href="#ico-user" x="58" y="83" width="24" height="24" fill="#888" />
		<use href="#ico-server" x="338" y="83" width="24" height="24" fill="#888" />
		<use href="#ico-monitor" x="618" y="83" width="24" height="24" fill="#888" />
		<text x="70" y="148" class="svg-label" text-anchor="middle">User</text>
		<text x="350" y="148" class="svg-label" text-anchor="middle">Edge PoP</text>
		<text x="630" y="148" class="svg-label" text-anchor="middle">Origin</text>
		<circle id="packet" cx="-20" cy="95" r="7" fill="#4a4a4a" opacity="0" />
	</svg>
	<div class="pg-log" id="flow-log"><span class="pg-log-empty">Log will appear here…</span></div>
</div>

<h3 class="pg-section-heading">Cache-Control header builder</h3>

<p class="pg-section-text">
	Toggle directives and watch the header string build live. The interpretation panel explains
	exactly what the resulting header tells every cache in the chain.
</p>

<div class="pg-card">
	<div class="pg-two-col">
		<div class="pg-controls">
			<div class="pg-group">
				<span class="pg-label">Visibility</span>
				<label class="pg-radio"
					><input type="radio" name="vis" value="public" checked /> public</label
				>
				<label class="pg-radio"><input type="radio" name="vis" value="private" /> private</label>
				<label class="pg-radio"><input type="radio" name="vis" value="no-store" /> no-store</label>
			</div>
			<div class="pg-group" id="ttl-group">
				<label class="pg-label" for="max-age">max-age (browser, seconds)</label>
				<input
					class="pg-input w-full font-mono text-[13px] px-2.5 py-1.5 border border-rule rounded-xl bg-bg text-fg focus:outline-none focus:border-fg transition-colors"
					type="number"
					id="max-age"
					value="3600"
					min="0"
				/>
			</div>
			<div class="pg-group" id="smaxage-group">
				<label class="pg-label" for="s-maxage">s-maxage (CDN, seconds)</label>
				<input
					class="pg-input w-full font-mono text-[13px] px-2.5 py-1.5 border border-rule rounded-xl bg-bg text-fg focus:outline-none focus:border-fg transition-colors"
					type="number"
					id="s-maxage"
					value=""
					placeholder="same as max-age"
					min="0"
				/>
			</div>
			<div class="pg-group" id="extras-group">
				<span class="pg-label">Extras</span>
				<label class="pg-check"><input type="checkbox" id="immutable" /> immutable</label>
				<label class="pg-check"><input type="checkbox" id="swr" /> stale-while-revalidate</label>
				<label class="pg-check"><input type="checkbox" id="sie" /> stale-if-error</label>
				<label class="pg-check"><input type="checkbox" id="must-rev" /> must-revalidate</label>
			</div>
		</div>
		<div class="pg-output">
			<div class="pg-output-label">Generated header</div>
			<div class="pg-header-string" id="cc-output">Cache-Control: public, max-age=3600</div>
			<div class="pg-interpret" id="cc-interpret"></div>
		</div>
	</div>
</div>

<h3 class="pg-section-heading">Mini CDN simulator</h3>

<p class="pg-section-text">
	Three independent PoP caches. Send requests to any region — each PoP maintains its own cache
	state. Watch hit rates build up, TTLs count down, and see how purge affects all PoPs.
</p>

<div class="pg-card">
	<div class="pg-toolbar">
		<input
			class="pg-input w-44 font-mono text-[13px] px-2.5 py-1.5 border border-rule rounded-xl bg-bg text-fg focus:outline-none focus:border-fg transition-colors"
			id="sim-url"
			type="text"
			value="/assets/logo.png"
			placeholder="/path/to/resource"
		/>
		<button
			class="pg-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			id="sim-sg">→ Singapore</button
		>
		<button
			class="pg-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			id="sim-de">→ Frankfurt</button
		>
		<button
			class="pg-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			id="sim-us">→ Virginia</button
		>
		<button
			class="pg-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-transparent text-fg border border-rule cursor-pointer hover:bg-rule disabled:opacity-35 disabled:cursor-not-allowed transition-colors duration-150"
			id="sim-purge-all">Purge All</button
		>
	</div>
	<div class="sim-pops">
		<div class="sim-pop" id="pop-sg">
			<div class="sim-pop-name">Singapore</div>
			<div class="sim-pop-status" id="sg-status">empty</div>
			<div class="sim-pop-ttl" id="sg-ttl">—</div>
			<div class="sim-pop-stats" id="sg-stats">HIT: 0 &nbsp; MISS: 0</div>
		</div>
		<div class="sim-pop" id="pop-de">
			<div class="sim-pop-name">Frankfurt</div>
			<div class="sim-pop-status" id="de-status">empty</div>
			<div class="sim-pop-ttl" id="de-ttl">—</div>
			<div class="sim-pop-stats" id="de-stats">HIT: 0 &nbsp; MISS: 0</div>
		</div>
		<div class="sim-pop" id="pop-us">
			<div class="sim-pop-name">Virginia</div>
			<div class="sim-pop-status" id="us-status">empty</div>
			<div class="sim-pop-ttl" id="us-ttl">—</div>
			<div class="sim-pop-stats" id="us-stats">HIT: 0 &nbsp; MISS: 0</div>
		</div>
	</div>
	<div class="pg-log" id="sim-log"><span class="pg-log-empty">Log will appear here…</span></div>
</div>

<h3 class="pg-section-heading">Full CDN stack — all layers</h3>

<p class="pg-section-text">
	Pick a scenario and watch the request travel through every layer. Each layer lights up as the
	request touches it. The packet stops where it gets served or blocked.
</p>

<div class="pg-card">
	<div class="pg-toolbar" style="flex-wrap:wrap;gap:6px;">
		<button
			class="pg-btn scen-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			data-scen="cdn-hit">Gcore Cache HIT</button
		>
		<button
			class="pg-btn scen-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			data-scen="ram-hit">Shield RAM HIT</button
		>
		<button
			class="pg-btn scen-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			data-scen="disk-hit">Shield Disk HIT</button
		>
		<button
			class="pg-btn scen-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			data-scen="full-miss">Full MISS</button
		>
		<button
			class="pg-btn scen-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			data-scen="waf-block">WAF Block</button
		>
		<button
			class="pg-btn scen-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			data-scen="rate-limit">Rate Limited</button
		>
		<button
			class="pg-btn scen-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			data-scen="origin-down">Origin Down</button
		>
		<span class="pg-badge" id="stack-badge">pick a scenario</span>
	</div>
	<div class="stack-wrap">
		<div class="stack-wire" id="wire-ug"></div>
		<div class="stack-wire" id="wire-gs"></div>
		<div class="stack-wire" id="wire-so"></div>
		<div class="stack-packet" id="stack-pkt"></div>
		<div class="stack-node" id="sn-user">
			<div class="sn-icon">
				<svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22"
					><path d="M10 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0H3z" /></svg
				>
			</div>
			<div class="sn-name">User</div>
			<div class="sn-ms" id="sn-user-ms"></div>
		</div>
		<div class="stack-node wide" id="sn-gcore">
			<div class="sn-name">Gcore PoP</div>
			<div class="sn-layer" id="sl-ddos">DDoS / WAF</div>
			<div class="sn-layer" id="sl-rules">Rules Engine</div>
			<div class="sn-layer" id="sl-tls">TLS Termination</div>
			<div class="sn-layer" id="sl-cdncache">CDN Cache</div>
			<div class="sn-ms" id="sn-gcore-ms"></div>
		</div>
		<div class="stack-node wide" id="sn-shield">
			<div class="sn-name">OpenResty Shield</div>
			<div class="sn-layer" id="sl-access">access.lua (auth/RL)</div>
			<div class="sn-layer" id="sl-ram">RAM Cache (lua_shared_dict)</div>
			<div class="sn-layer" id="sl-disk">Disk Cache (proxy_cache)</div>
			<div class="sn-ms" id="sn-shield-ms"></div>
		</div>
		<div class="stack-node" id="sn-origin">
			<div class="sn-icon">
				<svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22"
					><path
						d="M2 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4zm14 9V4H4v9h12zM7 17h6l.5 1.5H6.5L7 17z"
					/></svg
				>
			</div>
			<div class="sn-name">Origin</div>
			<div class="sn-ms" id="sn-origin-ms"></div>
		</div>
	</div>
	<div class="pg-log" id="stack-log"><span class="pg-log-empty">Log will appear here…</span></div>
</div>

<h3 class="pg-section-heading">nginx phase pipeline</h3>

<p class="pg-section-text">
	Every HTTP request passes through nginx's phases left to right. Pick a scenario — the request ball
	moves through each phase, stopping where it gets blocked or short-circuited. Green = pass through,
	yellow = modified, red = blocked.
</p>

<div class="pg-card">
	<div class="pg-toolbar" style="flex-wrap:wrap;gap:6px;">
		<button
			class="pg-btn phase-scen inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			data-scen="normal">Normal GET</button
		>
		<button
			class="pg-btn phase-scen inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			data-scen="cache-hit">Cache HIT</button
		>
		<button
			class="pg-btn phase-scen inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			data-scen="rate-limit">Rate Limited</button
		>
		<button
			class="pg-btn phase-scen inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			data-scen="waf">WAF Block</button
		>
		<button
			class="pg-btn phase-scen inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			data-scen="jwt-fail">JWT Fail</button
		>
		<button
			class="pg-btn phase-scen inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			data-scen="private">Private Path</button
		>
	</div>
	<div class="phase-wrap">
		<div class="phase-track">
			<div class="phase-ball" id="phase-ball"></div>
		</div>
		<div class="phase-boxes">
			<div class="phase-box" id="ph-set">
				<div class="ph-name">set_by_lua</div>
				<div class="ph-desc">compute vars</div>
			</div>
			<div class="phase-arrow">→</div>
			<div class="phase-box" id="ph-rewrite">
				<div class="ph-name">rewrite_by_lua</div>
				<div class="ph-desc">URL rewrite</div>
			</div>
			<div class="phase-arrow">→</div>
			<div class="phase-box" id="ph-access">
				<div class="ph-name">access_by_lua</div>
				<div class="ph-desc">auth / rate limit</div>
			</div>
			<div class="phase-arrow">→</div>
			<div class="phase-box" id="ph-cache">
				<div class="ph-name">proxy_cache</div>
				<div class="ph-desc">disk cache check</div>
			</div>
			<div class="phase-arrow">→</div>
			<div class="phase-box" id="ph-proxy">
				<div class="ph-name">proxy_pass</div>
				<div class="ph-desc">upstream fetch</div>
			</div>
			<div class="phase-arrow">→</div>
			<div class="phase-box" id="ph-hf">
				<div class="ph-name">header_filter</div>
				<div class="ph-desc">modify headers</div>
			</div>
			<div class="phase-arrow">→</div>
			<div class="phase-box" id="ph-log">
				<div class="ph-name">log_by_lua</div>
				<div class="ph-desc">emit metrics</div>
			</div>
		</div>
		<div class="phase-status" id="phase-status">—</div>
	</div>
</div>

<h3 class="pg-section-heading">Token bucket rate limiter</h3>

<p class="pg-section-text">
	The bucket holds up to 20 tokens. Tokens refill at 3/sec. Each request costs 1. When the bucket
	empties, requests are rejected with 429. Watch what happens when you burst-fire requests vs space
	them out.
</p>

<div class="pg-card">
	<div class="pg-toolbar">
		<button
			class="pg-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			id="tb-one">Send 1 Request</button
		>
		<button
			class="pg-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			id="tb-burst">Burst ×10</button
		>
		<button
			class="pg-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-transparent text-fg border border-rule cursor-pointer hover:bg-rule disabled:opacity-35 disabled:cursor-not-allowed transition-colors duration-150"
			id="tb-reset">Reset</button
		>
		<span style="margin-left:auto;font-size:13px;color:var(--muted)"
			>Refill: 3/sec &nbsp; Capacity: 20</span
		>
	</div>
	<div class="bucket-wrap">
		<div class="bucket-left">
			<div class="bucket-outer">
				<div class="bucket-refill" id="tb-refill-anim"></div>
				<div class="bucket-inner" id="tb-bucket"></div>
				<div class="bucket-level-label" id="tb-level">20 / 20</div>
			</div>
			<div class="bucket-drain-arrow">↓ requests consume tokens</div>
		</div>
		<div class="bucket-right">
			<div class="bucket-stat-row">
				<span class="bucket-stat-label">Tokens</span>
				<span class="bucket-stat-val" id="tb-tokens-val">20</span>
			</div>
			<div class="bucket-stat-row">
				<span class="bucket-stat-label">Allowed</span>
				<span class="bucket-stat-val" style="color:#1e6b3a" id="tb-allowed">0</span>
			</div>
			<div class="bucket-stat-row">
				<span class="bucket-stat-label">Rejected</span>
				<span class="bucket-stat-val" style="color:#b31412" id="tb-rejected">0</span>
			</div>
			<div class="bucket-log" id="tb-log"></div>
		</div>
	</div>
</div>

<h3 class="pg-section-heading">Cache object lifecycle</h3>

<p class="pg-section-text">
	A single cached object moves through these states over its lifetime. The TTL bar counts down in
	real time. Click <strong>Step</strong> to advance manually or <strong>Auto</strong> to run the full
	lifecycle. Purge at any point to see immediate eviction.
</p>

<div class="pg-card">
	<div class="pg-toolbar">
		<button
			class="pg-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-fg text-bg border-0 cursor-pointer hover:opacity-75 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity duration-150"
			id="csm-step">Step →</button
		>
		<button
			class="pg-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-transparent text-fg border border-rule cursor-pointer hover:bg-rule disabled:opacity-35 disabled:cursor-not-allowed transition-colors duration-150"
			id="csm-auto">Auto</button
		>
		<button
			class="pg-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-transparent text-fg border border-rule cursor-pointer hover:bg-rule disabled:opacity-35 disabled:cursor-not-allowed transition-colors duration-150"
			id="csm-purge">Purge</button
		>
		<button
			class="pg-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold bg-transparent text-fg border border-rule cursor-pointer hover:bg-rule disabled:opacity-35 disabled:cursor-not-allowed transition-colors duration-150"
			id="csm-reset">Reset</button
		>
		<span class="pg-badge" id="csm-badge">EMPTY</span>
	</div>
	<div class="csm-wrap">
		<div class="csm-states">
			<div class="csm-state" id="css-empty">
				<div class="csm-dot"></div>
				<div class="csm-name">EMPTY</div>
				<div class="csm-desc">No object stored</div>
			</div>
			<div class="csm-arrow">→</div>
			<div class="csm-state" id="css-fetch">
				<div class="csm-dot"></div>
				<div class="csm-name">FETCHING</div>
				<div class="csm-desc">Request to origin</div>
			</div>
			<div class="csm-arrow">→</div>
			<div class="csm-state" id="css-fresh">
				<div class="csm-dot"></div>
				<div class="csm-name">FRESH</div>
				<div class="csm-desc">X-Cache: HIT</div>
			</div>
			<div class="csm-arrow">→</div>
			<div class="csm-state" id="css-stale">
				<div class="csm-dot"></div>
				<div class="csm-name">STALE</div>
				<div class="csm-desc">TTL expired, still serving</div>
			</div>
			<div class="csm-arrow">→</div>
			<div class="csm-state" id="css-reval">
				<div class="csm-dot"></div>
				<div class="csm-name">REVALIDATING</div>
				<div class="csm-desc">If-None-Match → origin</div>
			</div>
		</div>
		<div class="csm-ttl-wrap">
			<div class="csm-ttl-label">TTL <span id="csm-ttl-val">—</span></div>
			<div class="csm-ttl-bar"><div class="csm-ttl-fill" id="csm-ttl-fill"></div></div>
		</div>
		<div class="csm-explain" id="csm-explain">Press Step or Auto to begin.</div>
	</div>
</div>

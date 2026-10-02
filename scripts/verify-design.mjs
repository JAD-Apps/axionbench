import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { routes } from '../src/routes.ts';
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [design, review, html, css, shell, experience, vite, server, routeDocs] = await Promise.all(['docs/DESIGN.md', 'docs/VISUAL-REFERENCE-REVIEW.md', 'index.html', 'src/style.css', 'src/observatory.tsx', 'src/observatory-experience.tsx', 'vite.config.ts', 'scripts/serve.mjs', 'docs/ROUTES.md'].map(read));
for (const needle of ['assets/surface.js', 'Economy', 'Balanced', 'Frontier', 'BridgeBench', 'native publisher rating', 'unpublished', '5:1', 'unknown', 'Space Grotesk', 'DM Sans', 'IBM Plex Mono', 'Chart.js', 'visx', 'Motion for React', '250–500 ms', 'prefers-reduced-motion', 'offscreen', 'accessible table', '180 KiB gzip', 'npm run test:frontier', '360, 768, 1280 and 1440']) assert(design.includes(needle), `Missing design requirement: ${needle}`);
for (const slug of ['boc-studio', 'infinity-signal', 'driftimes-2025-impact-report']) assert(review.includes('https://www.awwwards.com/sites/' + slug), `Missing exact collection entry: ${slug}`);
assert(review.includes('HTTP 200') && review.includes('membership at inspection time'));
assert.match(html, /<html[^>]+data-theme="dark"[^>]+color-scheme:dark/);
for (const color of ['#080a0f', '#f5f7fc', '#6ce5ef', '#aa98ff']) assert(css.includes(color), `Missing palette token: ${color}`);
for (const path of ['SPACE-GROTESK-LICENSE.txt', 'DM-SANS-LICENSE.txt', 'IBM-PLEX-MONO-LICENSE.txt']) assert.match(await read('public/assets/' + path), /SIL OPEN FONT LICENSE/i);
assert.equal(routes.length, 11); assert.equal(new Set(routes.map(r => r.path)).size, 11);
for (const route of routes) { assert(routeDocs.includes('`' + route.path + '`')); if (route.id !== 'overview') assert(experience.includes("route === '" + route.id + "'"), `Missing mounted route ${route.id}`); }
for (const needle of ['aria-current', 'popstate', 'pushState', 'route-title', '.focus(', 'Skip to main content']) assert(shell.includes(needle), `Missing navigation contract ${needle}`);
assert(vite.includes('closeBundle') && vite.includes("directory + '/index.html'"));
assert(server.includes('findRoute(pathname)') && server.includes('writeHead(404)'));
assert.match(await read('public/404.html'), /Page not found/);
assert.equal(await read('assets/surface.js'), await read('public/assets/surface.js'), 'served hero equals maintained source');
console.log('Design contract passed: eleven routes, dark startup, original palette, licensed local type, actual collection observations, source-honest comparison and preserved motion contract.');

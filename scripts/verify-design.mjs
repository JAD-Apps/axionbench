import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const design = await readFile(new URL('../docs/DESIGN.md', import.meta.url), 'utf8');
const requirements = [
  ['preserved hero asset', 'assets/surface.js'], ['Frontier', '### Frontier'],
  ['task cost', 'Capability and task cost'], ['US-China comparison', 'US–China head-to-head'],
  ['open weights grouping', '100–300B'], ['catalogue', 'Model catalogue'], ['methods', 'Methods and benchmark library'],
  ['visx modules', '@visx/scale'], ['Motion', 'Motion for React'], ['responsive mobile', 'Mobile gutters'],
  ['keyboard operation', 'keyboard focus'], ['accessible table', 'accessible table'],
  ['reduced motion', 'prefers-reduced-motion'], ['rejected alternatives', 'Recharts'],
  ['licensing', 'MIT'], ['bundle measurement honesty', 'Bundle size is not claimed as known'],
  ['reference access honesty', 'detail inaccessible in research viewer'],
];
for (const [label, needle] of requirements) assert.ok(design.includes(needle), `Blueprint is missing ${label}`);
assert.match(design, /360, 768, 1280 and 1440/);
assert.match(design, /250–500 ms/);
console.log(`Design blueprint contract passed (${requirements.length} focused assertions). Rendered acceptance remains outstanding.`);

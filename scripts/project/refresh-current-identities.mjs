// Offline evidence replay only. This does not refresh source retrieval dates.
import { readFile, writeFile } from 'node:fs/promises';
import { qualifyIdentities } from '../current-policy.mjs';
const input = JSON.parse(await readFile('data/ingestion.json', 'utf8'));
const specs = JSON.parse(await readFile('data/model-policy.json', 'utf8'));
const qualified = await qualifyIdentities(input, specs, { verificationAt: new Date().toISOString() });
await writeFile('data/model-identities.json', JSON.stringify(qualified, null, 2) + '\n');
console.log(`Locally replayed ${qualified.models.length} exact identity candidates; ${qualified.models.filter((row) => row.verified).length} primary-confirmed. No HTTP request or retrieval-date change.`);

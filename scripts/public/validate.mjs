import { fileURLToPath } from 'node:url';
import { validateSource } from './boundary.mjs';
import { validateData } from './data.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = await validateSource(root);
const { projection } = await validateData(root);
console.log(`Portable public validation passed: ${manifest.fileCount} exact files; source ${manifest.sourceSha256}; ${projection.models.length} catalogue models; ${projection.authority.observations.length} authority observations; ${projection.authority.floor.suites.length} suites / ${projection.authority.floor.domains.length} capability domains; ${projection.pricing.records.length} licensed tariffs. No raw-source replay or hosted CI receipt is claimed.`);

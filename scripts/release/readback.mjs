// Read-only canonical production readback. A fresh private build is not the
// published daily snapshot. --state-dir may also come from local secret storage.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLastSuccess, verifyPublished } from './publication.mjs';
import { createPagesClient, loadCredentials } from './pages-api.mjs';
import { outsideRepository } from '../public/boundary.mjs';
export async function canonicalReadback({ stateDir, config, client, fetcher }) {
  const ledger=await readLastSuccess(stateDir); assert(ledger,'no canonical last-success ledger');
  return verifyPublished({stateDir,config,client,fetcher});
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2);const option=name=>{const at=args.indexOf(name);return at<0?null:args[at+1];};
    const dir=option('--state-dir')??process.env.AXIONBENCH_PUBLICATION_STATE;
    assert(dir,'canonical readback requires --state-dir or AXIONBENCH_PUBLICATION_STATE; local dist is not proof of latest production');
    assert(args.includes('--latest')||option('--deployment-id'),'usage: readback.mjs --latest --state-dir <external state> [--write <ignored evidence>]');
    const stateDir=await outsideRepository(process.cwd(),dir);
    const config=JSON.parse(await readFile('deploy.config.json','utf8'));
    const ledger=await readLastSuccess(stateDir);
    if(option('--deployment-id')) assert.equal(option('--deployment-id'),ledger?.current.deploymentId,'requested deployment is not canonical production');
    const record=await canonicalReadback({stateDir,config,client:createPagesClient({...loadCredentials(),projectName:config.projectName})});
    if(option('--write')) await writeFile(option('--write'),JSON.stringify(record,null,2)+'\n');
    console.log(JSON.stringify(record,null,2));
  } catch(error) { console.error(`Readback blocked: ${error.message}`);process.exitCode=1; }
}

// Read-only interface. Candidate preparation/sealing belongs to the daemon.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPacket, verifyCandidates, verifyNamedReceipt, DEFAULT_PACKET } from './qualification.mjs';
export async function verifyQualification(path=DEFAULT_PACKET) {
  const {packet,packetRoot}=await loadPacket(path);
  const candidates=await verifyCandidates(packet,{packetRoot});
  return verifyNamedReceipt('candidate-qualification',packet,{packetRoot,candidates});
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2);
    assert(args.includes('--verify-only') && args.every((v,i)=>v==='--verify-only'||v==='--packet'||args[i-1]==='--packet'),'usage: qualify-public.mjs --verify-only [--packet <private packet>]');
    const at=args.indexOf('--packet');
    console.log(JSON.stringify(await verifyQualification(at<0?DEFAULT_PACKET:args[at+1]),null,2));
  } catch(error) { console.error(`Qualification blocked: ${error.message}`); process.exitCode=1; }
}

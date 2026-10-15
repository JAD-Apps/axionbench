// Authenticated, read-only approval barrier. Hashes alone never confer authority.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
export const PIN = Object.freeze({ provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' });
export const digestStatement = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateProviderReceipt(receipt, sessionId) {
  assert.equal(receipt?.sessionId, sessionId, 'provider receipt session missing');
  for (const key of ['pin', 'requested', 'effective']) assert.deepEqual(receipt[key], PIN, `provider ${key} mismatch`);
  assert.equal(receipt.violation, null, 'provider routing violation');
  assert.equal(receipt.init?.source, 'reported', 'provider identity must be reported');
  assert.equal(receipt.init.model, PIN.model); assert.equal(receipt.init.effort, PIN.effort);
  assert.equal(receipt.init.fastMode, 'off', 'Fast must be OFF'); assert.equal(receipt.init.serviceTier, 'default');
  assert(Array.isArray(receipt.observed) && Array.isArray(receipt.configurations), 'provider observations missing');
  for (const item of receipt.observed) assert.equal(item.model, PIN.model);
  for (const item of receipt.configurations) {
    assert.equal(item.model, PIN.model); assert.equal(item.effort, PIN.effort); assert.equal(item.serviceTier, 'default');
  }
}
export function validatePinnedRun(run, { projectId = process.env.AXIONBENCH_JADBOT_PROJECT_ID } = {}) {
  assert(typeof projectId==='string' && /^prj_[a-f0-9]+$/.test(projectId),'trusted local JadBot project binding missing');
  assert.equal(run?.projectId,projectId,'run belongs to another project');
  for(const key of ['modelPin','plannerChoice','workerChoice','reviewerChoice']) assert.deepEqual(run[key],PIN,`run ${key} mismatch`);
  assert.equal(run.collaborate,false,'collaboration must be disabled');
  assert(Array.isArray(run.steps) && run.steps.length,'run step routing missing');
  for(const step of run.steps) {
    for(const key of ['choice','workerChoice']) assert.deepEqual(step[key],PIN,`step ${key} mismatch`);
    assert.equal(step.workerLimit,1,'one worker per step required');
  }
  const sessions=[run.plannerSessionId,...run.steps.map(s=>s.sessionId),run.evaluation?.sessionId].filter(Boolean);
  assert(sessions.length,'executed AI session identities missing');
  for(const id of new Set(sessions)) validateProviderReceipt(run.modelReceipts?.find(r=>r.sessionId===id),id);
  return sessions;
}

export async function daemonGet(path) {
  assert(/^\/v1\/(runs\/run_[a-f0-9]+|sessions\/[a-f0-9-]+|workflow-schedules\/wfs_[a-f0-9]+|computer)$/.test(path), 'unsupported authority endpoint');
  const token = (await readFile(process.env.JADBOT_TOKEN_PATH ?? homedir() + '/.jadbot/token', 'utf8')).trim();
  const response = await fetch('http://127.0.0.1:7900' + path, {
    method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200, `authority readback ${path}: HTTP ${response.status}`);
  const body = await response.text(); assert(body.length <= 32 * 1024 * 1024, 'authority response exceeds bound');
  return JSON.parse(body);
}
export function pointerValue(value, pointer) {
  assert(typeof pointer === 'string' && pointer.startsWith('/'), 'authority JSON pointer required');
  for (const part of pointer.slice(1).split('/')) {
    const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
    assert(!['__proto__', 'constructor', 'prototype'].includes(key), 'unsafe authority pointer');
    assert(value && Object.hasOwn(value, key), `daemon authority field missing: ${pointer}`); value = value[key];
  }
  return value;
}
export async function authenticateStatement(reference, expected, { get = daemonGet, now = Date.now(), projectId = process.env.AXIONBENCH_JADBOT_PROJECT_ID } = {}) {
  assert(reference && /^run_[a-f0-9]+$/.test(reference.runId), 'daemon run reference required');
  const run = await get('/v1/runs/' + reference.runId);
  assert.equal(run.id, reference.runId); assert.equal(run.projectId, projectId);
  validatePinnedRun(run,{projectId});
  assert(/^\/steps\/\d+\/evidence$/.test(reference.pointer) || reference.pointer==='/evaluation', 'authority must be daemon-issued step/evaluation evidence, never a brief or arbitrary field');
  if(reference.pointer.startsWith('/steps/')) {
    const step=run.steps[Number(reference.pointer.split('/')[2])];
    assert(step && step.status==='passed' && step.exitCode===0 && step.sessionId===reference.producerSessionId,'daemon evidence step did not pass or producer differs');
  }
  const statement = pointerValue(run, reference.pointer);
  assert.equal(typeof statement, 'object', 'daemon must expose a structured bound verdict; text/hash assertions are insufficient');
  assert.equal(digestStatement(statement), reference.sha256, 'daemon evidence digest mismatch');
  assert.equal(statement?.schemaVersion, 'axionbench-authority-v1', 'daemon bound authority contract unavailable');
  assert.equal(statement.issuedBy,'jadbot','authority is not daemon-issued');
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(statement[key], value, `authority binding mismatch: ${key}`);
  assert.equal(statement.passed, true, 'authority verdict did not pass');
  assert.equal(statement.fixture, false, 'fixture cannot attest authority');
  assert(Number.isFinite(statement.at) && now >= statement.at && now - statement.at <= 72 * 3600000, 'authority receipt stale/future');
  assert.equal(statement.sessionId, reference.producerSessionId, 'authority producer missing/mismatched');
  const session = await get('/v1/sessions/' + statement.sessionId);
  assert.equal(session.id, statement.sessionId); assert.equal(session.runId, run.id); assert.equal(session.projectId, projectId);
  for (const key of ['requestedChoice','effectiveChoice']) assert.deepEqual(session[key], PIN);
  assert.equal(session.provider, PIN.provider); assert.equal(session.model, PIN.model); assert.equal(session.effort, PIN.effort);
  validateProviderReceipt(run.modelReceipts?.find(r => r.sessionId === session.id), session.id);
  return { statement, run, session };
}
export function assertIndependentReviewer(statement, run, builderSessionIds) {
  assert(typeof statement.sessionId === 'string' && statement.sessionId.length, 'reviewer session identity missing');
  assert(Array.isArray(builderSessionIds) && builderSessionIds.length, 'builder identities missing');
  assert(!builderSessionIds.includes(statement.sessionId), 'reviewer is also a candidate builder');
  assert.equal(statement.verdict, 'approved', 'independent review did not approve');
  const reviewStep=run.steps?.find(s=>s.sessionId===statement.sessionId);
  assert(reviewStep && reviewStep.status==='passed' && reviewStep.exitCode===0, 'independent review has no successful daemon step');
  assert.equal(reviewStep.workerLimit,1,'review must use one worker');
  for(const key of ['choice','workerChoice']) assert.deepEqual(reviewStep[key],PIN,`review step ${key} mismatch`);
}

// Default publication barrier; a caller cannot supply a self-asserted hash as approval.
export async function requirePublicationApproval(snapshot, { packetPath = process.env.AXIONBENCH_PUBLICATION_APPROVAL, get, now = Date.now(), projectId = process.env.AXIONBENCH_JADBOT_PROJECT_ID } = {}) {
  assert(packetPath, 'publication disabled: missing authenticated independent candidate approval');
  const packet = JSON.parse(await readFile(packetPath, 'utf8'));
  assert.equal(packet.schemaVersion, 'axionbench-publication-approval-v1');
  const expected = { mode: 'candidate-review', snapshotSha256: snapshot.snapshotSha256,
    revisionSha256: snapshot.revisionSha256, sourceCommit: snapshot.manifest.sourceCommit,
    productSha256: snapshot.manifest.productSha256, dataSha256: snapshot.manifest.dataSha256,
    controlSha256: snapshot.manifest.controlSha256, dataOverlaySha256: snapshot.manifest.dataOverlay?.overlaySha256 ?? null };
  const { statement, run } = await authenticateStatement(packet.authority, expected, { get, now, projectId });
  assertIndependentReviewer(statement,run,statement.builderSessionIds);
  return { reviewerSessionId: statement.sessionId, authoritySha256: packet.authority.sha256 };
}

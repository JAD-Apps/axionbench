import { describe, expect, it } from 'vitest';
import { authorityViewRows, bridgeViewRows, capturedViewRows, domainViewRows } from '../src/charts/rows';
import type { AuthorityBlock, AuthorityObservation } from '../src/authority/logic';
import type { BridgeDataset } from '../src/current/logic';
import data from '../public/data.json';
import { DEFAULT_WEIGHTS } from '../src/scoring/index.mjs';

const block = data.authority as unknown as AuthorityBlock;
const bridge = data.bridgeBench as BridgeDataset;
describe('qualified core view projection', () => {
  it('retains authority native values, normalized coordinates, intervals, version and provenance', () => {
    const source = block.observations.find(r => r.currentPolicy?.scoringEligible)!;
    const row = authorityViewRows(block, [source])[0];
    expect(row.nativeValue).toBe(source.rawValue); expect(row.value).toBe(source.value);
    expect(row.valueLabel).toBe(`${source.rawText} ${source.rawUnit}`);
    expect(row.sources[0].url).toBe(source.resultUrl); expect(row.sourceClass).toBe(source.provenance);
    expect(row.version).toBe(block.suites.find(s => s.id === source.suiteId)!.version);
    expect(row.interval).toEqual(source.interval);
  });
  it('keeps zero BridgeBench ratings, unknowns and unconfirmed identities distinct', () => {
    const fixture = structuredClone(bridge);
    fixture.records[0].ratings.overall = null; fixture.records[0].missingReasons.ratings.overall = 'Not published';
    fixture.records[1].ratings.overall = 0; fixture.records[1].identityVerified = false;
    const rows = bridgeViewRows(fixture, 'overall');
    const missing = rows.find(r => r.id === fixture.records[0].id)!;
    const zero = rows.find(r => r.id === fixture.records[1].id)!;
    expect(missing.value).toBeNull(); expect(missing.missingReason).toBe('Not published');
    expect(zero.value).toBe(0); expect(zero.valueLabel).toBe('0'); expect(zero.detail).toContain('Unverified:');
    expect(zero.unit).toBe('BridgeBench rating'); expect(zero.eligibility).toContain('capability');
    expect(() => bridgeViewRows(fixture, 'invented')).toThrow('Unknown BridgeBench axis');
  });
  it('retains inferred or unknown captured units without silently converting them', () => {
    const observation = { id:'claim', value:7, valueText:'7', unit:null, version:null, sourceClass:'publisher-own', verified:false, resultUrl:'https://example.com/result', verificationStatus:'Unverified', metric:'score' };
    const row = capturedViewRows([{ observation, model:{id:'m',name:'M',lab:'Lab'} }])[0];
    expect(row.valueLabel).toBe('7 · unit unknown'); expect(row.version).toBe('Version unknown'); expect(row.value).toBe(7);
  });
  it('exports missing release-identity rows with nulls and their model sources', () => {
    const rows=capturedViewRows([], [{id:'release',name:'Release',lab:'Lab',identityVerified:true,originalSourceUrl:'https://example.com/model'}]);
    expect(rows[0].value).toBeNull(); expect(rows[0].nativeValue).toBeNull(); expect(rows[0].valueLabel).toBe('No captured result');
    expect(rows[0].sources[0].url).toBe('https://example.com/model'); expect(rows[0].sourceClass).toContain('no benchmark measurement');
  });
  it('shows only the real current common domain, while missing default domains remain null', () => {
    const cohort = ['claude-opus-4-5-20251101','claude-haiku-4-5-20251001'];
    const rows = domainViewRows(block, cohort, { ...DEFAULT_WEIGHTS });
    expect(rows).toHaveLength(22);
    expect(rows.filter(r => r.value !== null)).toHaveLength(2);
    expect(rows.find(r => r.id === `${cohort[0]}|tool-use`)!.value).toBeCloseTo((.7747+.3347)/2, 12);
    expect(rows.find(r => r.id === `${cohort[1]}|tool-use`)!.value).toBeCloseTo((.687+.2526)/2, 12);
    expect(rows.filter(r => r.domain !== 'tool-use').every(r => r.value === null)).toBe(true);
    const excluded = domainViewRows(block, cohort, { reasoning:1, 'tool-use':0 });
    expect(excluded.filter(r => r.domain === 'tool-use').every(r => r.value === null && r.missingReason === 'Excluded by zero weight')).toBe(true);
  });
  it('caps correlated families and rejects changed conditions, ineligible versions and duplicates', () => {
    const fixture = structuredClone(block); fixture.models = block.models.filter(m => ['claude-opus-4-5-20251101','claude-haiku-4-5-20251001'].includes(m.key));
    const cohort = fixture.models.map(m => m.key);
    fixture.suites = [{id:'a',name:'A',version:'1',domain:'reasoning',familyId:'shared',benchmarkUrl:null},{id:'b',name:'B',version:'1',domain:'reasoning',familyId:'shared',benchmarkUrl:null},{id:'c',name:'C',version:'1',domain:'reasoning',familyId:'separate',benchmarkUrl:null}];
    const base = block.observations.find(r => r.currentPolicy?.scoringEligible)!;
    fixture.observations = cohort.flatMap((modelKey, i) => ['a','b','c'].map((suiteId,j): AuthorityObservation => ({...structuredClone(base),id:`${modelKey}-${suiteId}`,modelKey,suiteId,domain:'reasoning',value:(i ? [.2,.4,.8] : [.8,.6,.2])[j],configuration:{...base.configuration,id:`${modelKey}-${suiteId}`,condition:'shared',setting:'high'} })));
    const rows = domainViewRows(fixture, cohort, {reasoning:1});
    expect(rows.find(r => r.modelKey === cohort[0] && r.domain === 'reasoning')!.value).toBeCloseTo(((.8+.6)/2+.2)/2,12);
    expect(rows.find(r => r.modelKey === cohort[1] && r.domain === 'reasoning')!.value).toBeCloseTo(((.2+.4)/2+.8)/2,12);
    fixture.observations.forEach(r => { if(r.modelKey === cohort[1]) r.configuration.condition = 'incompatible'; });
    expect(domainViewRows(fixture,cohort,{reasoning:1}).every(r=>r.value===null)).toBe(true);
    fixture.observations.forEach(r=>{ r.configuration.condition='shared'; r.currentPolicy!.scoringEligible=false; });
    expect(domainViewRows(fixture,cohort,{reasoning:1}).every(r=>r.value===null)).toBe(true);
    fixture.observations.forEach(r=>{ r.currentPolicy!.scoringEligible=true; });
    fixture.observations.push(...structuredClone(fixture.observations));
    expect(domainViewRows(fixture,cohort,{reasoning:1}).every(r=>r.value===null)).toBe(true);
  });
});

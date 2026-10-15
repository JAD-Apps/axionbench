// Open-weight explorer logic shared by the data build (scripts/build-observatory-data.mjs),
// the rendered explorer (src/open-weights.tsx) and npm run test:open-weights.
// Pure functions only; every derived fact keeps the captured source that states it.

export const PARAMETER_BANDS = [
  { id: 'under-10', label: '<10B', low: 0, high: 10e9 },
  { id: '10-35', label: '10–35B', low: 10e9, high: 35e9 },
  { id: '35-100', label: '35–100B', low: 35e9, high: 100e9 },
  { id: '100-300', label: '100–300B', low: 100e9, high: 300e9 },
  { id: '300-plus', label: '300B+', low: 300e9, high: Number.POSITIVE_INFINITY },
  { id: 'undisclosed', label: 'Undisclosed', low: null, high: null },
] as const;
export type BandId = (typeof PARAMETER_BANDS)[number]['id'];
/** Representatives per small-multiple panel; the default view never plots more. */
export const MAX_PANEL_SERIES = 8;
export const PAGE_SIZE = 20;
/** Labs the plan requires to be findable; used to order representatives, never to rank. */
export const PRIORITY_LABS = ['meta', 'deepseek', 'alibaba-qwen', 'mistral', 'moonshot-kimi', 'zai-glm', 'minimax', 'nvidia',
  'allenai-olmo', 'ibm-granite'];

export type SourceRef = { id: string; url: string | null; sha256: string | null; retrievedAt: string | null };
export type TotalStatus = 'tensor-total' | 'quantized-tensor-count' | 'not-captured';
export type ActivatedStatus = 'card-stated' | 'ambiguous' | 'inconsistent' | 'not-stated' | 'no-card';
export type MoeStatus = 'stated-activated' | 'architecture-class' | 'not-established';
export type LicenceClass = 'osi-approved' | 'named-non-osi' | 'not-stated' | 'not-verified';
export type AccessStatus = 'public' | 'gated' | 'not-verified';
export type VariantKind = 'base' | 'instruct' | 'fine-tune' | 'not-stated';
export type OpenWeightRow = {
  modelId: string; name: string; lab: string; labId: string; repository: string | null; repositoryUrl: string | null;
  total: { value: number | null; status: TotalStatus; tensorCount: number | null; dtypes: string[] };
  band: BandId;
  activated: { value: number | null; approximate: boolean; status: ActivatedStatus; quote: string | null; candidates: number[] };
  moe: { status: MoeStatus; basis: string };
  access: { status: AccessStatus; basis: string };
  licence: { id: string | null; name: string | null; link: string | null; class: LicenceClass };
  variant: { kind: VariantKind; basis: string; baseModel: string | null };
  quantized: { value: boolean; basis: string };
  observationCount: number;
  sources: { metadata: SourceRef | null; card: SourceRef | null };
};
export type OpenWeightsBlock = {
  schemaVersion: 'axionbench-open-weights-v1';
  method: string;
  hostedPrice: string;
  selfHostCost: string;
  rows: OpenWeightRow[];
};

/** Total-parameter band. Activated MoE parameters are never an input. */
export function bandFor(total: number | null | undefined, status: TotalStatus = 'tensor-total'): BandId {
  if (status !== 'tensor-total' || total === null || total === undefined || !Number.isFinite(total) || total <= 0) return 'undisclosed';
  for (const band of PARAMETER_BANDS) if (band.low !== null && total >= band.low && total < band.high) return band.id;
  return 'undisclosed';
}

const FLOAT_DTYPES = new Set(['F64', 'F32', 'F16', 'BF16', 'F8_E4M3', 'F8_E5M2', 'F8_E8M0']);
// Index/mask buffers (e.g. position ids) are not packed weights.
const BUFFER_DTYPES = new Set(['I64', 'BOOL']);
/** A safetensors total is only a parameter count when every weight dtype is a plain float (no packed/integer weights). */
export function totalFromSafetensors(safetensors: { parameters?: Record<string, number>; total?: number } | null | undefined) {
  const dtypes = Object.keys(safetensors?.parameters ?? {}).sort();
  const tensorCount = Number.isFinite(safetensors?.total) ? safetensors!.total! : null;
  if (tensorCount === null) return { value: null, status: 'not-captured' as const, tensorCount: null, dtypes };
  if (!dtypes.some((dtype) => FLOAT_DTYPES.has(dtype)) || dtypes.some((dtype) => !FLOAT_DTYPES.has(dtype) && !BUFFER_DTYPES.has(dtype))) {
    return { value: null, status: 'quantized-tensor-count' as const, tensorCount, dtypes };
  }
  return { value: tensorCount, status: 'tensor-total' as const, tensorCount, dtypes };
}

const UNIT: Record<string, number> = { b: 1e9, billion: 1e9, t: 1e12, trillion: 1e12 };
const NUMBER = String.raw`(~|approximately\s+|about\s+|only\s+)?\**\s*(\d+(?:\.\d+)?)\s*(B|billion|T|trillion)\b\**`;
const LABEL = String.raw`#?\s*(?:activated|active)\s+param(?:eter)?s?(?:\s+per\s+token)?`;
const PATTERNS = [
  // One-subject table row: | **Activated Parameters** | 32B |  (multi-column rows are ambiguous and skipped)
  new RegExp(String.raw`^\s*\|\s*\**\s*${LABEL}\s*\**\s*\|\s*${NUMBER}\s*\|\s*$`, 'i'),
  // Key/value line: - Activated Parameters per Token: 45.9B
  new RegExp(String.raw`${LABEL}\s*\**\s*[:：]\s*${NUMBER}`, 'i'),
  // Prose: "with 32 billion activated parameters", "309B total / 15B activated parameters"
  new RegExp(String.raw`${NUMBER}\s+(?:\*\*)?(?:activated|active)\s+param`, 'i'),
];

const SIZE_TOKEN = /\b(?:A)?\d+(?:\.\d+)?[BT]\b/gi;
const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9.]/g, '');
/** Family cards describe sibling models in their own tables; a table whose header names sizes must name this repository's. */
function tableSubjectMismatch(lines: string[], index: number, repository: string | null) {
  let start = index;
  while (start > 0 && lines[start - 1].trim().startsWith('|')) start -= 1;
  const subject = lines[start].split('|').slice(2).join(' ');
  const tokens = subject.match(SIZE_TOKEN) ?? [];
  const leaf = squash((repository ?? '').split('/').pop() ?? '');
  return tokens.length > 0 && !tokens.every((token) => leaf.includes(squash(token)));
}

/**
 * Activated-parameter statement from the model's own card. Accepted only when every
 * matching statement agrees on one value that is smaller than the established total.
 */
export function extractActivated(card: string | null, total: number | null, repository: string | null = null): OpenWeightRow['activated'] {
  if (card === null) return { value: null, approximate: false, status: 'no-card', quote: null, candidates: [] };
  const found: { value: number; approximate: boolean; quote: string }[] = [];
  const lines = card.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const [patternIndex, pattern] of PATTERNS.entries()) {
      const match = pattern.exec(line);
      if (!match) continue;
      if (patternIndex === 0 && tableSubjectMismatch(lines, index, repository)) break;
      const value = Math.round(Number(match[2]) * UNIT[match[3].toLowerCase()]);
      const start = Math.max(0, match.index - 40);
      const quote = line.slice(start, Math.min(line.length, match.index + match[0].length + 40)).trim();
      found.push({ value, approximate: !!match[1] && !/only/i.test(match[1]), quote });
      break;
    }
  }
  const candidates = [...new Set(found.map((row) => row.value))].sort((a, b) => a - b);
  if (!candidates.length) return { value: null, approximate: false, status: 'not-stated', quote: null, candidates };
  if (candidates.length > 1) return { value: null, approximate: false, status: 'ambiguous', quote: null, candidates };
  const [first] = found;
  if (total !== null && first.value >= total) return { value: null, approximate: false, status: 'inconsistent', quote: first.quote, candidates };
  return { value: first.value, approximate: found.some((row) => row.approximate), status: 'card-stated', quote: first.quote, candidates };
}

export function moeIdentity(activated: OpenWeightRow['activated'], architectures: string[]): OpenWeightRow['moe'] {
  if (activated.status === 'card-stated') return { status: 'stated-activated', basis: 'model card states an activated-parameter count' };
  const named = architectures.find((name) => /moe/i.test(name));
  if (named) return { status: 'architecture-class', basis: `architecture class ${named} names MoE; activated count not stated` };
  return { status: 'not-established', basis: 'no captured source establishes a mixture-of-experts design' };
}

const OSI = new Set(['apache-2.0', 'mit', 'bsd-2-clause', 'bsd-3-clause', 'mpl-2.0', 'gpl-2.0', 'gpl-3.0', 'lgpl-2.1', 'lgpl-3.0', 'agpl-3.0']);
export function licenceFacts(cardData: { license?: unknown; license_name?: unknown; license_link?: unknown } | null | undefined,
  metadataCaptured: boolean): OpenWeightRow['licence'] {
  if (!metadataCaptured) return { id: null, name: null, link: null, class: 'not-verified' };
  const id = typeof cardData?.license === 'string' ? cardData.license : null;
  const name = typeof cardData?.license_name === 'string' ? cardData.license_name : null;
  const link = typeof cardData?.license_link === 'string' && /^https:\/\//.test(cardData.license_link) ? cardData.license_link : null;
  if (!id) return { id: null, name, link, class: 'not-stated' };
  return { id, name, link, class: OSI.has(id.toLowerCase()) ? 'osi-approved' : 'named-non-osi' };
}

export function accessFacts(gated: unknown, metadataCaptured: boolean): OpenWeightRow['access'] {
  if (!metadataCaptured) return { status: 'not-verified', basis: 'no repository metadata snapshot was captured' };
  if (gated === false) return { status: 'public', basis: 'hub metadata gated=false' };
  return { status: 'gated', basis: `hub metadata gated=${String(gated)}` };
}

export function variantFacts(repository: string | null, tags: string[]): OpenWeightRow['variant'] {
  const leaf = (repository ?? '').split('/').pop() ?? '';
  const baseTag = tags.find((tag) => /^base_model:(finetune|quantized|adapter|merge):/.test(tag));
  const baseModel = baseTag ? baseTag.split(':').slice(2).join(':') : null;
  if (/(^|[-_.])base($|[-_.])/i.test(leaf)) return { kind: 'base', basis: 'repository name marks a base checkpoint', baseModel };
  if (/instruct|chat|(^|[-_.])it($|[-_.])/i.test(leaf)) return { kind: 'instruct', basis: 'repository name marks an instruction/chat checkpoint', baseModel };
  if (baseTag?.startsWith('base_model:finetune:')) return { kind: 'fine-tune', basis: `hub tag: fine-tuned from ${baseModel}`, baseModel };
  return { kind: 'not-stated', basis: 'neither the repository name nor hub tags state base or instruct', baseModel };
}

const QUANT_NAME = /(gguf|awq|gptq|fp8|int4|int8|nvfp4|mxfp4|bnb|exl2|w4a16|w8a8)/i;
export function quantizedFacts(repository: string | null, tags: string[], configQuantization: string | null, total: OpenWeightRow['total']) {
  if (tags.some((tag) => tag.startsWith('base_model:quantized:'))) return { value: true, basis: 'hub tag base_model:quantized' };
  if (configQuantization && !/^(bf16|fp16|fp32)$/i.test(configQuantization)) return { value: true, basis: `configuration quantization ${configQuantization}` };
  const named = QUANT_NAME.exec(repository ?? '');
  if (named) return { value: true, basis: `repository name contains ${named[1]}` };
  if (total.status === 'quantized-tensor-count') return { value: true, basis: `integer tensor dtypes ${total.dtypes.join(', ')}` };
  return { value: false, basis: 'no quantization stated by tags, configuration, name or tensor dtypes' };
}

// ---- Exploration ----
export type OwFilters = { band: 'all' | BandId; moe: 'all' | MoeStatus; licence: 'all' | LicenceClass; access: 'all' | AccessStatus;
  variant: 'all' | VariantKind; quantized: 'all' | 'yes' | 'no'; lab: string; query: string; page: number };
export const DEFAULT_FILTERS: OwFilters = { band: 'all', moe: 'all', licence: 'all', access: 'all', variant: 'all', quantized: 'all', lab: 'all', query: '', page: 0 };

export function filterRows(rows: OpenWeightRow[], filters: OwFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  return rows.filter((row) => (filters.band === 'all' || row.band === filters.band)
    && (filters.moe === 'all' || row.moe.status === filters.moe)
    && (filters.licence === 'all' || row.licence.class === filters.licence)
    && (filters.access === 'all' || row.access.status === filters.access)
    && (filters.variant === 'all' || row.variant.kind === filters.variant)
    && (filters.quantized === 'all' || row.quantized.value === (filters.quantized === 'yes'))
    && (filters.lab === 'all' || row.labId === filters.lab)
    && (!query || [row.name, row.lab, row.modelId, row.repository ?? ''].some((text) => text.toLocaleLowerCase().includes(query))))
    .sort(compareRows);
}

/** Largest established total first, undisclosed last, then name; never by score. */
export function compareRows(a: OpenWeightRow, b: OpenWeightRow) {
  return (b.total.value ?? -1) - (a.total.value ?? -1) || a.name.localeCompare(b.name) || a.modelId.localeCompare(b.modelId);
}

export function paginate<T>(rows: T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(0, Math.trunc(Number.isFinite(page) ? page : 0)), pages - 1);
  return { page: current, pages, rows: rows.slice(current * size, (current + 1) * size), start: rows.length ? current * size + 1 : 0,
    end: Math.min(rows.length, (current + 1) * size) };
}

const labRank = (labId: string) => { const index = PRIORITY_LABS.indexOf(labId); return index < 0 ? PRIORITY_LABS.length + (labId === 'other' ? 1 : 0) : index; };
/** Bounded cohort per band: at most one model per lab, priority labs first, capped at MAX_PANEL_SERIES. */
export function representatives(rows: OpenWeightRow[], band: BandId, max = MAX_PANEL_SERIES) {
  const byLab = new Map<string, OpenWeightRow>();
  const candidates = rows.filter((row) => row.band === band).sort((a, b) => b.observationCount - a.observationCount
    || (b.total.value ?? -1) - (a.total.value ?? -1) || a.modelId.localeCompare(b.modelId));
  for (const row of candidates) if (!byLab.has(row.labId)) byLab.set(row.labId, row);
  return [...byLab.values()].sort((a, b) => labRank(a.labId) - labRank(b.labId) || a.lab.localeCompare(b.lab) || compareRows(a, b)).slice(0, max);
}

export function bandCounts(rows: OpenWeightRow[]) {
  return Object.fromEntries(PARAMETER_BANDS.map((band) => [band.id, rows.filter((row) => row.band === band.id).length])) as Record<BandId, number>;
}

const KEYS: [keyof OwFilters, string][] = [['band', 'owBand'], ['moe', 'owMoe'], ['licence', 'owLicence'], ['access', 'owAccess'],
  ['variant', 'owVariant'], ['quantized', 'owQuant'], ['lab', 'owLab'], ['query', 'owQ'], ['page', 'owPage']];
const ALLOWED: Partial<Record<keyof OwFilters, readonly string[]>> = {
  band: ['all', ...PARAMETER_BANDS.map((band) => band.id)], moe: ['all', 'stated-activated', 'architecture-class', 'not-established'],
  licence: ['all', 'osi-approved', 'named-non-osi', 'not-stated', 'not-verified'], access: ['all', 'public', 'gated', 'not-verified'],
  variant: ['all', 'base', 'instruct', 'fine-tune', 'not-stated'], quantized: ['all', 'yes', 'no'],
};
export function decodeFilters(params: URLSearchParams, labs: string[]): OwFilters {
  const next: OwFilters = { ...DEFAULT_FILTERS };
  for (const [key, name] of KEYS) {
    const value = params.get(name);
    if (value === null) continue;
    if (key === 'page') next.page = Math.max(0, Number.parseInt(value, 10) - 1 || 0);
    else if (key === 'query') next.query = value.slice(0, 80);
    else if (key === 'lab') next.lab = value === 'all' || labs.includes(value) ? value : 'all';
    else if (ALLOWED[key]?.includes(value)) (next as Record<string, unknown>)[key] = value;
  }
  return next;
}
export function encodeFilters(filters: OwFilters, url: URL) {
  for (const [key, name] of KEYS) {
    const value = filters[key];
    if (value === DEFAULT_FILTERS[key]) url.searchParams.delete(name);
    else url.searchParams.set(name, key === 'page' ? String(Number(value) + 1) : String(value));
  }
  return url;
}

export function formatParameters(value: number | null) {
  if (value === null) return 'not established';
  return value >= 1e12 ? `${(value / 1e12).toLocaleString('en-US', { maximumFractionDigits: 2 })}T`
    : `${(value / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })}B`;
}

export function exportRows(block: OpenWeightsBlock, rows: OpenWeightRow[], filters: OwFilters, digest: string) {
  return { schemaVersion: 'axionbench-open-weights-export-v1', dataDigest: digest, method: block.method,
    filters: { ...filters, page: undefined }, hostedPrice: block.hostedPrice, selfHostCost: block.selfHostCost, count: rows.length, rows };
}

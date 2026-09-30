const familyOverrides = {
  'swebench-full': 'swe-bench', 'swebench-verified': 'swe-bench', 'swebench-lite': 'swe-bench',
  'swebench-multilingual': 'swe-bench', 'swebench-multimodal': 'swe-bench', 'swebench-pro': 'swe-bench',
  'terminal-bench-4': 'terminal-bench', 'terminal-bench-2': 'terminal-bench',
  'hle-original': 'humanitys-last-exam', 'hle-rolling': 'humanitys-last-exam', 'hle-diamond': 'humanitys-last-exam',
  'aime-2025': 'aime', 'bfcl-v3': 'berkeley-function-calling', 'bfcl-v4': 'berkeley-function-calling',
  'tau-bench': 'tau-bench', tau2: 'tau2-bench', mmmu: 'mmmu', 'mmmu-pro': 'mmmu',
  'video-mme': 'video-mme',
};

export const addedSuites = [
  { id: 'gsm8k', name: 'GSM8K', version: 'public leaderboard; task and evaluator as source reported', family: 'gsm8k', domain: 'mathematics', metric: ['accuracy', 'higher', 0, 1], url: 'https://huggingface.co/datasets/openai/gsm8k', source: 'OpenAI / Hugging Face public eval results' },
  { id: 'aime-2026', name: 'AIME', version: '2026; contest series and evaluator required', family: 'aime', domain: 'mathematics', metric: ['accuracy', 'higher', 0, 1], url: 'https://huggingface.co/datasets/MathArena/aime_2026', source: 'MathArena public leaderboard / AIME source' },
  { id: 'hmmt-feb-2026', name: 'HMMT February', version: 'February 2026; contest split', family: 'hmmt', domain: 'mathematics', metric: ['accuracy', 'higher', 0, 1], url: 'https://huggingface.co/datasets/MathArena/hmmt_feb_2026', source: 'MathArena public leaderboard / HMMT source' },
  { id: 'terminal-bench-2.1', name: 'Terminal-Bench', version: '2.1', family: 'terminal-bench', domain: 'agents', metric: ['resolution rate', 'higher', 0, 1], url: 'https://huggingface.co/datasets/harborframework/terminal-bench-2.1', source: 'Harbor Framework public eval results' },
  { id: 'deep-swe', name: 'DeepSWE', version: 'v1.1', family: 'deep-swe', domain: 'coding', metric: ['resolved rate', 'higher', 0, 1], url: 'https://huggingface.co/datasets/datacurve/deep-swe', source: 'DataCurve public eval results' },
  { id: 'toolathlon', name: 'Toolathlon', version: 'leaderboard release; task and tool setup required', family: 'toolathlon', domain: 'tool-use', metric: ['score', 'higher', 0, 1], url: 'https://huggingface.co/datasets/hkust-nlp/Toolathlon', source: 'HKUST NLP public eval results' },
  { id: 'apex-agents', name: 'APEX Agents', version: 'public leaderboard snapshot', family: 'apex-agents', domain: 'agents', metric: ['score', 'higher', 0, 1], url: 'https://huggingface.co/datasets/mercor/apex-agents', source: 'Mercor public eval results' },
  { id: 'video-mme-v2', name: 'Video-MME', version: 'v2; frame budget required', family: 'video-mme', domain: 'audio-video', metric: ['accuracy', 'higher', 0, 1], url: 'https://huggingface.co/datasets/MME-Benchmarks/Video-MME-v2', source: 'Video-MME authors public eval results' },
  { id: 'open-asr', name: 'Open ASR Leaderboard', version: 'snapshot; language and subset required', family: 'open-asr', domain: 'audio-video', metric: ['word error rate', 'lower', 0, 1], url: 'https://huggingface.co/datasets/hf-audio/open-asr-leaderboard', source: 'Hugging Face Audio public leaderboard' },
  { id: 'skillsbench', name: 'SkillsBench', version: 'v1; task, trials and skills setup required', family: 'skillsbench', domain: 'agents', metric: ['success rate', 'higher', 0, 1], url: 'https://huggingface.co/datasets/benchflow/skillsbench', source: 'BenchFlow public eval results' },
  { id: 'evasionbench', name: 'EvasionBench', version: 'public leaderboard; attack set and score definition required', family: 'evasionbench', domain: 'safety', metric: ['score', 'higher', 0, 1], url: 'https://huggingface.co/datasets/FutureMa/EvasionBench', source: 'EvasionBench authors public eval results' },
  { id: 'redlinebench', name: 'RedlineBench', version: 'public result; panel and pass-rate definition required', family: 'redlinebench', domain: 'professional', metric: ['pass rate', 'higher', 0, 1], url: 'https://huggingface.co/datasets/crosbylegal/RedlineBench', source: 'RedlineBench public eval results' },
  { id: 'ifstruct', name: 'IFStruct', version: 'v1.0', family: 'ifstruct', domain: 'instruction-following', metric: ['instruction accuracy', 'higher', 0, 1], url: 'https://huggingface.co/datasets/LiquidAI/ifstruct-v1.0', source: 'Liquid AI public eval results' },
  { id: 'screenspot-pro', name: 'ScreenSpot-Pro', version: 'public benchmark; device/layout split required', family: 'screenspot', domain: 'agents', metric: ['accuracy', 'higher', 0, 1], url: 'https://huggingface.co/datasets/likaixin/ScreenSpot-Pro', source: 'ScreenSpot-Pro authors public eval results' },
  { id: 'olmocr-bench', name: 'olmOCR-Bench', version: 'public leaderboard snapshot; exclusions required', family: 'olmocr-bench', domain: 'vision-documents', metric: ['score', 'higher', 0, 1], url: 'https://huggingface.co/datasets/allenai/olmOCR-bench', source: 'AllenAI public eval results' },
  { id: 'real5-omnidocbench', name: 'Real5 OmniDocBench', version: 'public result; protocol required', family: 'omnidocbench', domain: 'vision-documents', metric: ['score', 'higher', 0, 1], url: 'https://huggingface.co/datasets/PaddlePaddle/Real5-OmniDocBench', source: 'Real5 OmniDocBench public eval results' },
  { id: 'lexam-hard', name: 'LEXam', version: 'hard split; evaluator required', family: 'lexam', domain: 'professional', metric: ['accuracy', 'higher', 0, 1], url: 'https://huggingface.co/datasets/joelniklaus/LEXam-hard', source: 'LEXam authors public eval results' },
];

export const hfDatasetToSuite = {
  'openai/gsm8k': { suiteId: 'gsm8k', taskIds: null },
  'Idavidrein/gpqa': { suiteId: 'gpqa-diamond', taskIds: ['diamond'] },
  'cais/hle': { suiteId: 'hle-original', taskIds: ['hle'] },
  'SWE-bench/SWE-bench_Verified': { suiteId: 'swebench-verified', taskIds: null },
  'ScaleAI/SWE-bench_Pro': { suiteId: 'swebench-pro', taskIds: null },
  'SWE-bench/SWE-bench_Multilingual': { suiteId: 'swebench-multilingual', taskIds: null },
  'harborframework/terminal-bench': { suiteId: 'terminal-bench-4', taskIds: ['terminalbench_4'] },
  'harborframework/terminal-bench-2.1': { suiteId: 'terminal-bench-2.1', taskIds: ['terminalbench_2_1'] },
  'datacurve/deep-swe': { suiteId: 'deep-swe', taskIds: ['deep_swe'] },
  'TIGER-Lab/MMLU-Pro': { suiteId: 'mmlu-pro', taskIds: null },
  'hkust-nlp/Toolathlon': { suiteId: 'toolathlon', taskIds: null },
  'mercor/apex-agents': { suiteId: 'apex-agents', taskIds: null },
  'MathArena/aime_2026': { suiteId: 'aime-2026', taskIds: null },
  'MathArena/hmmt_feb_2026': { suiteId: 'hmmt-feb-2026', taskIds: null },
  'MMMU/MMMU_Pro': { suiteId: 'mmmu-pro', taskIds: null },
  'MME-Benchmarks/Video-MME-v2': { suiteId: 'video-mme-v2', taskIds: null },
  'hf-audio/open-asr-leaderboard': { suiteId: 'open-asr', taskIds: null },
  'benchflow/skillsbench': { suiteId: 'skillsbench', taskIds: null },
  'FutureMa/EvasionBench': { suiteId: 'evasionbench', taskIds: null },
  'crosbylegal/RedlineBench': { suiteId: 'redlinebench', taskIds: null },
  'LiquidAI/ifstruct-v1.0': { suiteId: 'ifstruct', taskIds: null },
  'likaixin/ScreenSpot-Pro': { suiteId: 'screenspot-pro', taskIds: null },
  'allenai/olmOCR-bench': { suiteId: 'olmocr-bench', taskIds: null },
  'PaddlePaddle/Real5-OmniDocBench': { suiteId: 'real5-omnidocbench', taskIds: null },
  'joelniklaus/LEXam-hard': { suiteId: 'lexam-hard', taskIds: null },
};

export function extendRegistry(registry) {
  for (const suite of registry.suites) suite.benchmarkFamilyId ??= familyOverrides[suite.id] ?? suite.id;
  const existing = new Set(registry.suites.map((x) => x.id));
  for (const item of addedSuites) {
    if (existing.has(item.id)) continue;
    const [name, direction, min, max] = item.metric;
    registry.suites.push({
      id: item.id, name: item.name, version: item.version, benchmarkFamilyId: item.family,
      domain: item.domain, metric: { name, direction, min, max }, url: item.url, source: item.source,
      rights: 'public source link and structured result metadata; reuse licence must be reviewed',
      state: 'pending', reason: 'Registry identity added from public source discovery; observations are admitted separately.',
    });
  }
  return registry;
}

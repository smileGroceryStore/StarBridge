export const GO_MODELS_URL = 'https://opencode.ai/inference/go/v1/models';
// Protocol routes documented by OpenCode Go. Unrecognized models require manual review.
const responseModels = new Set(['grok-4.7', 'gpt-6-luna', 'gpt-5.6-luna', 'muse-spark-1.3-contributor', 'muse-spark-1.2-contributor']);
const anthropicModels = new Set(['claude-haiku-5-5', 'minimax-m3', 'qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus']);
const chatModels = new Set(['glm-5.3-flash','glm-5.3','glm-5.2','kimi-k3','kimi-k2.7-code','longcat-2.0','deepseek-v4.1-flash','deepseek-v4-pro','mimo-v2.6-flash','mimo-v2.6-pro','mimo-v2.5','mimo-v2.5-pro','hy4-preview','hy3','space-bunny','longcat-2.5-preview-free','step-5-preview','beam-free']);
export function goModelDetail(id) {
  if (chatModels.has(id)) return { protocol: 'openai-chat', baseUrl: 'https://opencode.ai/inference/go/openai/v1' };
  if (responseModels.has(id)) return { protocol: 'openai-responses', baseUrl: 'https://opencode.ai/inference/go/openai/v1' };
  if (anthropicModels.has(id)) return { protocol: 'anthropic', baseUrl: 'https://opencode.ai/inference/go/anthropic' };
  if (id === 'gemini-4-argon-contributor') return { protocol: 'gemini', baseUrl: 'https://opencode.ai/inference/go/google/v1beta' };
  return null;
}
export const toolProtocols = {
  'claude-code': ['anthropic'], codex: ['openai-responses'], zcode: ['openai-chat', 'anthropic'],
  'deepseek-harness':['openai-chat','openai-responses','anthropic'],
  reasonix:['openai-chat','openai-responses','anthropic'],
  pi: ['openai-chat','openai-responses','anthropic','gemini'], opencode: ['openai-chat','openai-responses','anthropic','gemini']
};
export function modelFor(profile, id) { return profile.modelDetails?.[id] ?? { protocol: profile.protocol, baseUrl: profile.baseUrl }; }
export function compatibleModels(profile, toolId) { const allowed = toolProtocols[toolId]; return profile.models.filter(id => !allowed || allowed.includes(modelFor(profile, id).protocol)); }
export function parseGoModels(json) {
  if (!json || !Array.isArray(json.data) || json.data.length > 500) throw Error('模型目录格式不正确');
  const entries = [], seen = new Set(); let skipped = 0;
  for (const item of json.data) {
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9._/-]{1,200}$/.test(item.id)) continue;
    const detail = goModelDetail(item.id); if (!detail) { skipped++; continue; }
    if (!seen.has(item.id)) { seen.add(item.id); entries.push({ id: item.id, ...detail }); }
  }
  if (!entries.length) throw Error('没有找到已核验协议的模型');
  return { entries, skipped };
}

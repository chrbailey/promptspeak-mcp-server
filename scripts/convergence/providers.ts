/**
 * Convergence Test Harness — Provider Adapters
 *
 * Three minimal adapters that normalize the three big-lab chat APIs
 * onto a single shape. We deliberately use built-in `fetch` so the
 * harness adds no runtime dependencies.
 *
 * The adapters *gracefully skip* when no API key is configured for
 * their provider — the harness is expected to run with Anthropic
 * alone in most environments.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderSuccess {
  ok: true;
  response: string;
  latency_ms: number;
  tokens_in?: number;
  tokens_out?: number;
  model: string;
  provider: ProviderName;
}

export interface ProviderSkip {
  ok: false;
  skipped: true;
  reason: 'provider-not-configured';
  provider: ProviderName;
}

export interface ProviderFailure {
  ok: false;
  skipped: false;
  reason: string;
  provider: ProviderName;
  latency_ms: number;
}

export type ProviderResult = ProviderSuccess | ProviderSkip | ProviderFailure;

export type ProviderName = 'claude' | 'openai' | 'gemini';

/** Default models — deliberately named so we can bump them in one place. */
export const DEFAULT_MODELS: Record<ProviderName, string> = {
  // The CLAUDE.md in this repo notes that the Claude 4.X family is the current family;
  // claude-3-* is retired. Sonnet 4.6 is the mainstream default.
  claude: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
};

function envKey(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : undefined;
}

// ────────────────────────────────────────────────────────────────────────
// Anthropic
// ────────────────────────────────────────────────────────────────────────

export async function callAnthropic(
  messages: ChatMessage[],
  model: string = DEFAULT_MODELS.claude,
  opts: { maxTokens?: number; timeoutMs?: number } = {}
): Promise<ProviderResult> {
  const apiKey = envKey('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { ok: false, skipped: true, reason: 'provider-not-configured', provider: 'claude' };
  }

  // Anthropic's API takes system as a top-level field, not a message role.
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const convo = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role,
    content: m.content,
  }));

  const body = {
    model,
    max_tokens: opts.maxTokens ?? 1024,
    system: system || undefined,
    messages: convo,
  };

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latency = Date.now() - start;

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return { ok: false, skipped: false, reason: `anthropic ${resp.status}: ${txt.slice(0, 200)}`, provider: 'claude', latency_ms: latency };
    }
    const json = await resp.json() as any;
    const text = Array.isArray(json.content)
      ? json.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
      : '';
    return {
      ok: true,
      response: text,
      latency_ms: latency,
      tokens_in: json.usage?.input_tokens,
      tokens_out: json.usage?.output_tokens,
      model,
      provider: 'claude',
    };
  } catch (e) {
    return { ok: false, skipped: false, reason: String(e instanceof Error ? e.message : e), provider: 'claude', latency_ms: Date.now() - start };
  }
}

// ────────────────────────────────────────────────────────────────────────
// OpenAI
// ────────────────────────────────────────────────────────────────────────

export async function callOpenAI(
  messages: ChatMessage[],
  model: string = DEFAULT_MODELS.openai,
  opts: { maxTokens?: number; timeoutMs?: number } = {}
): Promise<ProviderResult> {
  const apiKey = envKey('OPENAI_API_KEY');
  if (!apiKey) {
    return { ok: false, skipped: true, reason: 'provider-not-configured', provider: 'openai' };
  }

  const body = {
    model,
    max_completion_tokens: opts.maxTokens ?? 1024,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  };

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latency = Date.now() - start;
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return { ok: false, skipped: false, reason: `openai ${resp.status}: ${txt.slice(0, 200)}`, provider: 'openai', latency_ms: latency };
    }
    const json = await resp.json() as any;
    const text = json.choices?.[0]?.message?.content ?? '';
    return {
      ok: true,
      response: text,
      latency_ms: latency,
      tokens_in: json.usage?.prompt_tokens,
      tokens_out: json.usage?.completion_tokens,
      model,
      provider: 'openai',
    };
  } catch (e) {
    return { ok: false, skipped: false, reason: String(e instanceof Error ? e.message : e), provider: 'openai', latency_ms: Date.now() - start };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Gemini
// ────────────────────────────────────────────────────────────────────────

export async function callGemini(
  messages: ChatMessage[],
  model: string = DEFAULT_MODELS.gemini,
  opts: { maxTokens?: number; timeoutMs?: number } = {}
): Promise<ProviderResult> {
  const apiKey = envKey('GOOGLE_API_KEY') ?? envKey('GEMINI_API_KEY');
  if (!apiKey) {
    return { ok: false, skipped: true, reason: 'provider-not-configured', provider: 'gemini' };
  }

  // Gemini uses its own content shape. We fold system messages into the first user turn.
  const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const userTurns = messages.filter(m => m.role !== 'system');
  const contents = userTurns.map((m, idx) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: (idx === 0 && systemText) ? `${systemText}\n\n${m.content}` : m.content }],
  }));

  const body = {
    contents,
    generationConfig: { maxOutputTokens: opts.maxTokens ?? 1024 },
  };

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latency = Date.now() - start;
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return { ok: false, skipped: false, reason: `gemini ${resp.status}: ${txt.slice(0, 200)}`, provider: 'gemini', latency_ms: latency };
    }
    const json = await resp.json() as any;
    const text = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
    return {
      ok: true,
      response: text,
      latency_ms: latency,
      tokens_in: json.usageMetadata?.promptTokenCount,
      tokens_out: json.usageMetadata?.candidatesTokenCount,
      model,
      provider: 'gemini',
    };
  } catch (e) {
    return { ok: false, skipped: false, reason: String(e instanceof Error ? e.message : e), provider: 'gemini', latency_ms: Date.now() - start };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Dispatcher
// ────────────────────────────────────────────────────────────────────────

export async function callProvider(
  provider: ProviderName,
  messages: ChatMessage[],
  model?: string
): Promise<ProviderResult> {
  switch (provider) {
    case 'claude': return callAnthropic(messages, model);
    case 'openai': return callOpenAI(messages, model);
    case 'gemini': return callGemini(messages, model);
  }
}

export type OpenRouterRole = 'system' | 'user' | 'assistant';

export type OpenRouterMessage = {
  role: OpenRouterRole;
  content: string;
};

type OpenRouterChatCompletionOptions = {
  apiKey: string;
  messages: OpenRouterMessage[];
  model?: string;
  temperature?: number;
};

type OpenRouterChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string };
  }>;
  error?: { message?: string };
};

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Use a ":free" model by default to avoid paid usage.
const DEFAULT_FREE_MODELS = [
  'mistralai/mistral-7b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'google/gemma-3-4b-it:free',
  'openai/gpt-oss-20b:free',
] as const;

export async function openRouterChatCompletion({
  apiKey,
  messages,
  model,
  temperature = 0.2,
}: OpenRouterChatCompletionOptions): Promise<string> {
  // If a user-specified model fails (typo / unavailable), fall back to known free models.
  const modelsToTry = model ? [model, ...DEFAULT_FREE_MODELS] : [...DEFAULT_FREE_MODELS];

  let lastError: unknown = null;
  for (const candidateModel of modelsToTry) {
    try {
      const res = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          // fetch header values must be ISO-8859-1 (ByteString). Keep this ASCII-only.
          'X-Title': 'SmartCalendar',
        },
        body: JSON.stringify({
          model: candidateModel,
          messages,
          temperature,
        }),
      });

      const raw = await res.text();
      if (!res.ok) {
        try {
          const parsed = JSON.parse(raw) as OpenRouterChatCompletionResponse;
          const message = parsed?.error?.message;
          throw new Error(message || `OpenRouter 요청 실패 (${res.status}) - model=${candidateModel}`);
        } catch {
          throw new Error(`OpenRouter 요청 실패 (${res.status}) - model=${candidateModel}`);
        }
      }

      const parsed = JSON.parse(raw) as OpenRouterChatCompletionResponse;
      const content = parsed?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new Error('OpenRouter 응답을 해석하지 못했습니다.');
      }
      return content;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter 요청 실패');
}

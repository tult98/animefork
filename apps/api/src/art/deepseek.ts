import { z } from 'zod';
import type { DeepSeekConfig } from './art.config.ts';

export const DEEPSEEK_TIMEOUT_MS = 20_000;
export const DEEPSEEK_RETRY_DELAY_MS = 1000;

export class DeepSeekError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeepSeekError';
  }
}

export interface DeepSeekClientOptions extends DeepSeekConfig {
  fetch?: typeof fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
}

export interface DeepSeekChat {
  system: string;
  user: string;
  maxTokens?: number;
  temperature: number;
  json?: boolean;
  thinking?: boolean;
}

const CompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({ content: z.string().nullish() }),
      }),
    )
    .min(1),
});

export class DeepSeekClient {
  private readonly url: string;
  private readonly options: DeepSeekClientOptions;
  private readonly doFetch: typeof fetch;

  constructor(options: DeepSeekClientOptions) {
    this.options = options;
    this.url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    this.doFetch = options.fetch ?? fetch;
  }

  async complete(chat: DeepSeekChat): Promise<string> {
    let res = await this.post(chat);
    if (res.status === 429 || res.status >= 500) {
      void res.body?.cancel().catch(() => undefined);
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          this.options.retryDelayMs ?? DEEPSEEK_RETRY_DELAY_MS,
        ),
      );
      res = await this.post(chat);
    }
    if (!res.ok) throw new DeepSeekError(`DeepSeek answered ${res.status}`);
    const parsed = CompletionSchema.safeParse(
      await res.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new DeepSeekError('DeepSeek answered a malformed completion');
    }
    const [choice] = parsed.data.choices;
    if (choice?.finish_reason && choice.finish_reason !== 'stop') {
      throw new DeepSeekError(
        `DeepSeek stopped with finish_reason ${choice.finish_reason}`,
      );
    }
    return choice?.message.content ?? '';
  }

  private async post(chat: DeepSeekChat): Promise<Response> {
    const timeoutMs = this.options.timeoutMs ?? DEEPSEEK_TIMEOUT_MS;
    try {
      return await this.doFetch(this.url, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: 'system', content: chat.system },
            { role: 'user', content: chat.user },
          ],
          ...(!chat.thinking && { thinking: { type: 'disabled' } }),
          temperature: chat.temperature,
          ...(chat.maxTokens !== undefined && { max_tokens: chat.maxTokens }),
          ...(chat.json && { response_format: { type: 'json_object' } }),
          stream: false,
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new DeepSeekError(`DeepSeek timed out after ${timeoutMs} ms`);
      }
      throw new DeepSeekError(
        `DeepSeek request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

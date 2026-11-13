import { describe, expect, it, vi } from 'vitest';
import { createEpisodeTranslators } from '../../src/episodes/episode.translate.ts';

describe('episode synopsis translation', () => {
  it('asks DeepSeek for one short Vietnamese sentence and returns it', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: 'Nasa nhớ lại đời mình khi sắp chết.' },
          },
        ],
      }),
    );
    const { synopsis } = createEpisodeTranslators({
      apiKey: 'k',
      baseUrl: 'https://deepseek.test',
      model: 'm',
      fetch: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 1,
    } as Parameters<typeof createEpisodeTranslators>[0]);

    const out = await synopsis.translate(
      'On a snowy winter night, Nasa Yuzaki is lying on the street bleeding. He recalls his life.',
    );

    expect(out).toBe('Nasa nhớ lại đời mình khi sắp chết.');
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    const sent = JSON.parse(String(calls[0]?.[1]?.body)) as {
      messages: { role: string; content: string }[];
    };
    expect(sent.messages[0]?.content).toContain('one short natural Vietnamese');
    expect(sent.messages[0]?.content).toContain('at most 90 characters');
    expect(sent.messages[1]?.content).toContain('Nasa Yuzaki');
  });
});

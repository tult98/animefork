import { describe, expect, it } from 'vitest';
import {
  AniskipError,
  createAniskipClient,
  toSegments,
} from '../../src/skip-times/aniskip.client.ts';

const OP = {
  interval: { startTime: 28.783, endTime: 118.783 },
  skipType: 'op',
  skipId: 'a',
  episodeLength: 1500,
};
const ED = {
  interval: { startTime: 1387.996, endTime: 1500 },
  skipType: 'ed',
  skipId: 'b',
  episodeLength: 1500,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('toSegments', () => {
  it('maps op and mixed-op to intro, ed and mixed-ed to outro', () => {
    const mixedOp = { ...OP, skipType: 'mixed-op' };
    const mixedEd = { ...ED, skipType: 'mixed-ed' };
    expect(toSegments([mixedEd, mixedOp]).map((s) => s.kind)).toEqual([
      'intro',
      'outro',
    ]);
  });

  it('drops recap and unknown types', () => {
    const recap = { ...OP, skipType: 'recap' };
    const other = { ...OP, skipType: 'preview' };
    expect(toSegments([recap, other, ED])).toEqual([
      { kind: 'outro', startS: 1387.996, endS: 1500 },
    ]);
  });

  it('drops malformed and empty intervals', () => {
    const empty = { ...OP, interval: { startTime: 10, endTime: 10 } };
    const negative = { ...OP, interval: { startTime: -1, endTime: 10 } };
    expect(toSegments([empty, negative, { nope: 1 }, null, OP])).toEqual([
      { kind: 'intro', startS: 28.783, endS: 118.783 },
    ]);
  });
});

describe('aniskip client', () => {
  it('asks for op and ed with an unknown episode length and returns segments', async () => {
    const urls: URL[] = [];
    const client = createAniskipClient({
      fetch: async (input) => {
        urls.push(new URL(String(input)));
        return json({ found: true, results: [OP, ED] });
      },
    });
    const segments = await client.skipTimes(21, 3);
    expect(segments).toEqual([
      { kind: 'intro', startS: 28.783, endS: 118.783 },
      { kind: 'outro', startS: 1387.996, endS: 1500 },
    ]);
    expect(urls[0]?.pathname).toBe('/v2/skip-times/21/3');
    expect(urls[0]?.searchParams.getAll('types')).toEqual(['op', 'ed']);
    expect(urls[0]?.searchParams.get('episodeLength')).toBe('0');
  });

  it('reads a 404 as no skip times', async () => {
    const client = createAniskipClient({
      fetch: async () => json({ found: false, results: [] }, 404),
    });
    expect(await client.skipTimes(1, 1)).toEqual([]);
  });

  it('throws AniskipError for a server error, a network failure and a bad body', async () => {
    const cases: (typeof fetch)[] = [
      async () => json({}, 500),
      async () => {
        throw new TypeError('offline');
      },
      async () => json({ unexpected: true }),
    ];
    for (const fetchImpl of cases) {
      const client = createAniskipClient({ fetch: fetchImpl });
      await expect(client.skipTimes(1, 1)).rejects.toBeInstanceOf(AniskipError);
    }
  });

  it('aborts a call that outlasts the timeout', async () => {
    const client = createAniskipClient({
      timeoutMs: 10,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    });
    await expect(client.skipTimes(1, 1)).rejects.toBeInstanceOf(AniskipError);
  });
});

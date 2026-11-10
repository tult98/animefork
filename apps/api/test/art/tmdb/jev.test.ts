import { AuthenticationError, RateLimitError } from '@typesafe-ai/sdk';
import { describe, expect, it } from 'vitest';
import { createMatcher, JevMatcher } from '../../../src/art/tmdb/jev.ts';
import {
  BaselineMatcher,
  CascadeMatcher,
  decide,
  type MatchAnswer,
  type Matcher,
  type MatchQuestion,
} from '../../../src/art/tmdb/matcher.ts';
import { syncTitle } from '../../../src/art/tmdb/sync.ts';
import { createTmdbClient } from '../../../src/art/tmdb/tmdb.ts';
import { setup } from '../helpers.ts';
import * as fx from './fixtures.ts';
import { fakeJev, TEST_JEV, type JevReply } from './jev-mock.ts';
import { mockTmdb } from './tmdb-mock.ts';

const CONAN = {
  slug: 'tham-tu-lung-danh-conan-a1',
  name: fx.CONAN_NAME,
  year: 1996,
  episodeCount: 1100,
};

const question = (over: Partial<MatchQuestion> = {}): MatchQuestion => ({
  slug: CONAN.slug,
  sourceTitle: CONAN.name,
  season: 1,
  year: 1996,
  episodeCount: 1100,
  candidates: [
    {
      id: 30983,
      name: 'Detective Conan',
      originalName: '名探偵コナン',
      alternativeTitles: Array.from({ length: 12 }, (_, i) => `Alt ${i}`),
      firstAirDate: '1996-01-08',
      episodeCount: 1100,
      overview: 'A high school detective is shrunk into a child.',
    },
    {
      id: 120089,
      name: "Detective Conan: Zero's Tea Time",
      originalName: '名探偵コナン ゼロの日常',
      alternativeTitles: [],
      firstAirDate: '2022-04-05',
      episodeCount: 6,
    },
  ],
  ...over,
});

const confident: JevReply = {
  choice: '30983',
  probabilities: { '30983': 0.92, '120089': 0.08 },
  confidence: 0.8,
  noul: 0.96,
};

const matcherFor = (reply: Parameters<typeof fakeJev>[0]) => {
  const jev = fakeJev(reply);
  return {
    ...jev,
    matcher: new JevMatcher(jev.client, 'jev-latest', TEST_JEV),
  };
};

class CountingMatcher implements Matcher {
  calls = 0;
  private readonly answer: MatchAnswer;
  constructor(answer: MatchAnswer) {
    this.answer = answer;
  }
  async match(): Promise<MatchAnswer> {
    this.calls++;
    return this.answer;
  }
}

describe('JevMatcher request', () => {
  it('sends one System One request with the state and both questions', async () => {
    const { matcher, sent } = matcherFor(confident);
    await matcher.match(question());
    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request?.url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(request?.headers.get('authorization')).toBe('Bearer test-jev-key');
    expect(request?.body).toEqual({
      model: 'jev-latest',
      state: {
        source: {
          title: 'Thám Tử Lừng Danh Conan',
          season: 1,
          year: 1996,
          episodeCount: 1100,
        },
        candidates: [
          {
            id: 30983,
            title: 'Detective Conan',
            originalTitle: '名探偵コナン',
            alternativeTitles: Array.from({ length: 10 }, (_, i) => `Alt ${i}`),
            firstAirDate: '1996-01-08',
            episodeCount: 1100,
            overview: 'A high school detective is shrunk into a child.',
          },
          {
            id: 120089,
            title: "Detective Conan: Zero's Tea Time",
            originalTitle: '名探偵コナン ゼロの日常',
            alternativeTitles: [],
            firstAirDate: '2022-04-05',
            episodeCount: 6,
          },
        ],
      },
      questions: {
        match: {
          type: 'choice',
          instructions: expect.stringContaining(
            'same anime and the same season',
          ),
          criteria: {
            '30983':
              'Detective Conan / 名探偵コナン, first aired 1996-01-08, 1100 episodes',
            '120089':
              "Detective Conan: Zero's Tea Time / 名探偵コナン ゼロの日常, first aired 2022-04-05, 6 episodes",
          },
        },
        any_match: {
          type: 'noul',
          instructions:
            'At least one candidate is the same anime and the same season as the source.',
        },
      },
    });
  });

  it('states the matching rules in the choice instructions', async () => {
    const { matcher, sent } = matcherFor(confident);
    await matcher.match(question());
    const body = sent[0]?.body as {
      questions: { match: { instructions: string } };
    };
    for (const rule of [
      'Vietnamese or a romanization of the Japanese title',
      'names, original names, alternative titles, first air date and episode count',
      'a movie, a special, a recap or a spin-off is a different show',
    ]) {
      expect(body.questions.match.instructions).toContain(rule);
    }
  });

  it('leaves unknown source fields out of the state', async () => {
    const { matcher, sent } = matcherFor(confident);
    await matcher.match(question({ year: undefined, episodeCount: undefined }));
    expect(
      (sent[0]?.body as { state: { source: object } }).state.source,
    ).toEqual({ title: CONAN.name, season: 1 });
  });
});

describe('JevMatcher verdict', () => {
  it('accepts a confident pick at min(noul, choice probability)', async () => {
    const { matcher } = matcherFor(confident);
    const answer = await matcher.match(question());
    expect(answer).toEqual({
      choice: 30983,
      probability: 0.92,
      episodeOffset: 0,
      by: 'jev',
    });
    expect(decide(answer)).toBe(30983);
  });

  it.each<[string, Partial<JevReply>]>([
    ['the noul is under JEV_MIN_NOUL', { noul: 0.84 }],
    [
      'the choice probability is under JEV_MIN_CHOICE',
      { probabilities: { '30983': 0.84, '120089': 0.16 } },
    ],
    ['the confidence is under JEV_MIN_CONFIDENCE', { confidence: 0.49 }],
  ])('rejects when %s', async (_, over) => {
    const reply = { ...confident, ...over };
    const { matcher } = matcherFor(reply);
    const answer = await matcher.match(question());
    expect(answer).toEqual({
      choice: null,
      probability: Math.min(reply.noul, reply.probabilities['30983'] ?? 0),
      by: 'jev',
    });
  });

  it('accepts at exactly the thresholds', async () => {
    const { matcher } = matcherFor({
      choice: '30983',
      probabilities: { '30983': 0.85, '120089': 0.15 },
      confidence: 0.5,
      noul: 0.85,
    });
    expect((await matcher.match(question())).choice).toBe(30983);
  });

  it('throws when Jev picks an id that is not a candidate', async () => {
    const { matcher } = matcherFor({ ...confident, choice: '1' });
    await expect(matcher.match(question())).rejects.toThrow(/not a candidate/);
  });

  it.each<[string, () => Response | Promise<Response>, RegExp | object]>([
    [
      '401',
      () => Response.json({ detail: 'bad key' }, { status: 401 }),
      AuthenticationError,
    ],
    [
      '429 once retries are spent',
      () => Response.json({ detail: 'slow down' }, { status: 429 }),
      RateLimitError,
    ],
    [
      '422',
      () => Response.json({ detail: 'bad question' }, { status: 422 }),
      /422/,
    ],
    [
      'a network failure',
      () => {
        throw new TypeError('fetch failed');
      },
      /fetch failed|connect/i,
    ],
    ['a malformed answer', () => Response.json({ answers: {} }), /match/],
  ])('throws on %s', async (_, reply, error) => {
    const { matcher } = matcherFor(reply);
    await expect(matcher.match(question())).rejects.toThrow(error as RegExp);
  });
});

describe('CascadeMatcher', () => {
  const settled: MatchAnswer = {
    choice: 30983,
    probability: 0.95,
    episodeOffset: 0,
    by: 'baseline',
  };
  const unsure: MatchAnswer = {
    choice: 30983,
    probability: 0.53,
    by: 'baseline',
  };
  const jevAnswer: MatchAnswer = { choice: 30983, probability: 0.9, by: 'jev' };

  it('returns a settled baseline answer and never asks Jev', async () => {
    const jev = new CountingMatcher(jevAnswer);
    const cascade = new CascadeMatcher(new CountingMatcher(settled), jev);
    expect(await cascade.match(question())).toBe(settled);
    expect(jev.calls).toBe(0);
  });

  it('asks Jev when the baseline does not settle', async () => {
    const jev = new CountingMatcher(jevAnswer);
    const cascade = new CascadeMatcher(new CountingMatcher(unsure), jev);
    expect(await cascade.match(question())).toBe(jevAnswer);
    expect(jev.calls).toBe(1);
  });

  it('does not ask Jev when there are no candidates', async () => {
    const jev = new CountingMatcher(jevAnswer);
    const cascade = new CascadeMatcher(new BaselineMatcher(), jev);
    expect(await cascade.match(question({ candidates: [] }))).toEqual({
      choice: null,
      probability: 0,
      by: 'baseline',
    });
    expect(jev.calls).toBe(0);
  });
});

describe('createMatcher', () => {
  const logger = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => void lines.push(line) };
  };

  it('wires the baseline alone and says so once when there is no key', () => {
    const log = logger();
    const matcher = createMatcher(undefined, log);
    expect(matcher).toBeInstanceOf(BaselineMatcher);
    expect(log.lines).toEqual([
      'Jev matcher is off: TYPESAFE_API_KEY is not set',
    ]);
  });

  it('wires the cascade when a key is set, without logging the key', () => {
    const log = logger();
    expect(createMatcher(TEST_JEV, log)).toBeInstanceOf(CascadeMatcher);
    expect(log.lines.join('\n')).not.toContain(TEST_JEV.apiKey);
  });
});

describe('a sync through the cascade', () => {
  const tmdb = () =>
    createTmdbClient({ apiKey: 'key', fetch: mockTmdb(fx.CONAN_ROUTES) });

  it('does not settle the Conan title with the baseline alone', async () => {
    const outcome = await syncTitle(CONAN, {
      tmdb: tmdb(),
      matcher: new BaselineMatcher(),
    });
    expect(outcome.kind).toBe('skipped');
  });

  it('matches it through Jev and records who matched', async () => {
    const jev = matcherFor(confident);
    const outcome = await syncTitle(CONAN, {
      tmdb: tmdb(),
      matcher: new CascadeMatcher(new BaselineMatcher(), jev.matcher),
    });
    expect(outcome.kind === 'matched' && outcome.matched.title).toMatchObject({
      tmdb_id: 30983,
      matched_by: 'jev',
      source_name: CONAN.name,
      source_year: 1996,
      source_episode_count: 1100,
    });
    const body = jev.sent[0]?.body as {
      state: { candidates: { overview?: string }[] };
    };
    expect(body.state.candidates[0]?.overview).toBe(fx.DETAIL_30983.overview);
  });

  it('names Jev in the reason when it rejects', async () => {
    const jev = matcherFor({ ...confident, noul: 0.2 });
    const outcome = await syncTitle(CONAN, {
      tmdb: tmdb(),
      matcher: new CascadeMatcher(new BaselineMatcher(), jev.matcher),
    });
    expect(outcome.kind === 'skipped' && outcome.skipped.reason).toBe(
      "no confident match by jev (best probability 0.20) via query 'Thám Tử Lừng Danh Conan'",
    );
  });
});

describe('ArtFiller with Jev', () => {
  it('stores failed, not no_match, when Jev errors', async () => {
    const jev = matcherFor(() =>
      Response.json({ detail: 'bad key' }, { status: 401 }),
    );
    const { store, filler } = setup({
      fetch: mockTmdb(fx.CONAN_ROUTES),
      matcher: new CascadeMatcher(new BaselineMatcher(), jev.matcher),
    });
    await filler.fill(CONAN);
    expect(store.titles.get(CONAN.slug)).toMatchObject({
      status: 'failed',
      sourceName: CONAN.name,
      sourceYear: 1996,
      sourceEpisodeCount: 1100,
      matchedBy: null,
    });
    expect(store.titles.get(CONAN.slug)?.reason).not.toContain(TEST_JEV.apiKey);
  });

  it('stores matched with matched_by jev when Jev accepts', async () => {
    const jev = matcherFor(confident);
    const { store, filler } = setup({
      fetch: mockTmdb(fx.CONAN_ROUTES),
      matcher: new CascadeMatcher(new BaselineMatcher(), jev.matcher),
    });
    await filler.fill(CONAN);
    expect(store.titles.get(CONAN.slug)).toMatchObject({
      status: 'matched',
      tmdbId: 30983,
      matchedBy: 'jev',
    });
  });
});

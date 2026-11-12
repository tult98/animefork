import { AuthenticationError } from '@typesafe-ai/sdk';
import { describe, expect, it } from 'vitest';
import { createMalJudge, MalJevJudge } from '../../src/mal/mal.jev.ts';
import { TEST_JEV } from '../art/tmdb/jev-mock.ts';
import { candidate, TENKEN_1, TENKEN_2, TENKEN_INPUT } from './helpers.ts';
import { fakeMalJev, type MalJevReply } from './jev-mock.ts';

const confident: MalJevReply = {
  choice: '53913',
  probabilities: { '53913': 0.93, '52347': 0.07 },
  confidence: 0.8,
  noul: 0.95,
};

const judgeFor = (reply: Parameters<typeof fakeMalJev>[0]) => {
  const jev = fakeMalJev(reply);
  return { ...jev, judge: new MalJevJudge(jev.client, 'jev-latest', TEST_JEV) };
};

describe('MalJevJudge request', () => {
  it('sends the source, the candidate fields and the season pair only', async () => {
    const { judge, sent } = judgeFor(confident);
    await judge.ask(TENKEN_INPUT, [TENKEN_2, TENKEN_1]);
    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request?.url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(request?.body).toEqual({
      model: 'jev-latest',
      state: {
        source: {
          title: 'Chuyển Sinh Thành Thanh Kiếm II',
          romaji: 'tensei shitara ken deshita II',
          season: 1,
          year: 2026,
          episodeCount: 5,
        },
        candidates: [
          {
            id: 53913,
            title: 'Tensei shitara Ken deshita II',
            englishTitle: 'Reincarnated as a Sword Season 2',
            synonyms: [
              'I became the sword by transmigrating 2nd Season',
              'TenKen 2',
            ],
            year: 2026,
            episodeCount: 12,
            mediaType: 'tv',
            airingStatus: 'currently_airing',
          },
          {
            id: 52347,
            title: 'Tensei shitara Ken deshita',
            englishTitle: 'Reincarnated as a Sword',
            synonyms: ['I became the sword by transmigrating', 'TenKen'],
            startDate: '2022-10-05',
            episodeCount: 12,
            mediaType: 'tv',
            airingStatus: 'finished_airing',
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
            '53913':
              'Tensei shitara Ken deshita II / Reincarnated as a Sword Season 2, tv, started 2026, 12 episodes, currently airing',
            '52347':
              'Tensei shitara Ken deshita / Reincarnated as a Sword, tv, started 2022-10-05, 12 episodes, finished airing',
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

  it('states the MAL matching rules, including a show still airing', async () => {
    const { judge, sent } = judgeFor(confident);
    await judge.ask(TENKEN_INPUT, [TENKEN_2]);
    const body = sent[0]?.body as {
      questions: { match: { instructions: string } };
    };
    const text = body.questions.match.instructions;
    expect(text).toContain('may be Vietnamese or a romanization');
    expect(text).toContain('romaji');
    expect(text).toContain('titles and synonyms');
    expect(text).toContain('lists each season as its own entry');
    expect(text).toContain(
      'A movie, a special, a recap or a spin-off is a different show',
    );
    expect(text).toContain('currently airing');
    expect(text).toContain('is not a mismatch');
  });

  it('sends the other names the source lists and says what they are', async () => {
    const { judge, sent } = judgeFor(confident);
    await judge.ask({ ...TENKEN_INPUT, otherNames: ['TenKen 2'] }, [TENKEN_2]);
    const body = sent[0]?.body as {
      state: { source: object };
      questions: { match: { instructions: string } };
    };
    expect(body.state.source).toMatchObject({ otherNames: ['TenKen 2'] });
    expect(body.questions.match.instructions).toContain(
      'other known titles of the same franchise',
    );
  });

  it('caps synonyms at 10 and leaves unknown fields out', async () => {
    const bare = candidate({
      id: 7,
      title: 'Bare',
      synonyms: Array.from({ length: 12 }, (_, i) => `Syn ${i}`),
      year: undefined,
      episodes: undefined,
      mediaType: undefined,
      airing: null,
      startDate: null,
    });
    const { judge, sent } = judgeFor({ ...confident, choice: '7' });
    await judge.ask({ slug: 'bare-a1', name: 'Bare' }, [bare]);
    const body = sent[0]?.body as {
      state: { source: object; candidates: object[] };
      questions: { match: { criteria: Record<string, string> } };
    };
    expect(body.state.source).toEqual({ title: 'Bare', season: 1 });
    expect(body.state.candidates).toEqual([
      {
        id: 7,
        title: 'Bare',
        synonyms: Array.from({ length: 10 }, (_, i) => `Syn ${i}`),
      },
    ]);
    expect(body.questions.match.criteria['7']).toBe(
      'Bare, media type unknown, start unknown, episode count unknown, airing status unknown',
    );
  });
});

describe('MalJevJudge verdict', () => {
  it('accepts a confident pick and scores it min(noul, choice probability)', async () => {
    const { judge } = judgeFor(confident);
    expect(await judge.ask(TENKEN_INPUT, [TENKEN_2, TENKEN_1])).toEqual({
      choice: TENKEN_2,
      probability: 0.93,
      confidence: 0.8,
      noul: 0.95,
      probabilities: { '53913': 0.93, '52347': 0.07 },
      accepted: true,
      score: 0.93,
    });
  });

  it('accepts at exactly the thresholds', async () => {
    const { judge } = judgeFor({
      choice: '53913',
      probabilities: { '53913': 0.85 },
      confidence: 0.5,
      noul: 0.85,
    });
    expect((await judge.ask(TENKEN_INPUT, [TENKEN_2])).accepted).toBe(true);
  });

  it.each<[string, Partial<MalJevReply>]>([
    ['a low noul', { noul: 0.84 }],
    ['a low choice probability', { probabilities: { '53913': 0.62 } }],
    ['a low confidence', { confidence: 0.49 }],
  ])('rejects on %s', async (_, over) => {
    const { judge } = judgeFor({ ...confident, ...over });
    expect((await judge.ask(TENKEN_INPUT, [TENKEN_2])).accepted).toBe(false);
  });

  it('throws when Jev picks an id that is not a candidate', async () => {
    const { judge } = judgeFor({ ...confident, choice: '1' });
    await expect(judge.ask(TENKEN_INPUT, [TENKEN_2])).rejects.toThrow(
      /Jev chose 1, which is not a candidate/,
    );
  });

  it.each<[string, () => Response | Promise<Response>, RegExp | object]>([
    [
      '401',
      () => Response.json({ detail: 'bad key' }, { status: 401 }),
      AuthenticationError,
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
    const { judge } = judgeFor(reply);
    await expect(judge.ask(TENKEN_INPUT, [TENKEN_2])).rejects.toThrow(
      error as RegExp,
    );
  });

  it('logs one line with the verdict and every probability, never the key or the state', async () => {
    const lines: string[] = [];
    const { judge } = judgeFor({ ...confident, noul: 0.71 });
    Object.assign(judge, { logger: { log: (l: string) => lines.push(l) } });
    await judge.ask(TENKEN_INPUT, [TENKEN_2, TENKEN_1]);
    expect(lines).toEqual([
      'jev mal tensei-shitara-ken-deshita-II-a6066: choice 53913 p=0.93 confidence=0.80 noul=0.71 ' +
        'probabilities=52347:0.07,53913:0.93 -> reject',
    ]);
  });
});

describe('createMalJudge', () => {
  const logger = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => void lines.push(line) };
  };

  it('is off without a key and says so once', () => {
    const log = logger();
    expect(createMalJudge(undefined, log)).toBeNull();
    expect(log.lines).toEqual([
      'MAL Jev matcher is off: TYPESAFE_API_KEY is not set',
    ]);
  });

  it('is on with a key, names the model and never the key', () => {
    const log = logger();
    expect(createMalJudge(TEST_JEV, log)).toBeInstanceOf(MalJevJudge);
    expect(log.lines).toEqual(['MAL Jev matcher is on (model jev-latest)']);
  });
});

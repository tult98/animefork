import { describe, expect, it } from 'vitest';
import { evalCells, evalInput, formatRow } from '../../scripts/eval-mal.ts';
import type { MalJevVerdict } from '../../src/mal/mal.jev.ts';
import { TENKEN_1, TENKEN_2 } from './helpers.ts';

const verdict = (over: Partial<MalJevVerdict> = {}): MalJevVerdict => ({
  choice: TENKEN_2,
  probability: 0.93,
  confidence: 0.8,
  noul: 0.95,
  probabilities: { '53913': 0.93 },
  accepted: true,
  score: 0.93,
  ...over,
});

const none = { status: 'none', malId: null };
const SLUG = 'tensei-shitara-ken-deshita-II-a6066';

describe('evalCells', () => {
  it('shows a stored miss that Jev would now accept as a disagreement with the score', () => {
    expect(
      evalCells(SLUG, { stored: none, scored: null, jev: verdict() }),
    ).toEqual([
      SLUG,
      'none',
      'reject',
      '53913 Tensei shitara Ken deshita II',
      'accept p=0.93 noul=0.95 conf=0.80',
      'no',
    ]);
  });

  it('agrees when both pick the same id, or both reject', () => {
    const scored = { candidate: TENKEN_2, score: 0.912 };
    const ok = { status: 'ok', malId: 53913 };
    expect(evalCells(SLUG, { stored: ok, scored, jev: verdict() })).toEqual([
      SLUG,
      'ok 53913',
      'ok 53913 0.91',
      '53913 Tensei shitara Ken deshita II',
      'accept p=0.93 noul=0.95 conf=0.80',
      'yes',
    ]);
    const rejected = verdict({ accepted: false, noul: 0.4 });
    expect(
      evalCells(SLUG, { stored: none, scored: null, jev: rejected }).at(-1),
    ).toBe('yes');
    expect(
      evalCells(SLUG, {
        stored: ok,
        scored,
        jev: verdict({ choice: TENKEN_1 }),
      }).at(-1),
    ).toBe('no');
  });

  it('marks a skipped or failed Jev call without an agreement', () => {
    expect(evalCells(SLUG, { stored: none, scored: null, jev: null })).toEqual([
      SLUG,
      'none',
      'reject',
      '',
      'skipped: no candidates',
      '-',
    ]);
    expect(
      evalCells(SLUG, {
        stored: none,
        scored: null,
        jev: new Error('401 bad key'),
      }).slice(3),
    ).toEqual(['', 'error: 401 bad key', '-']);
  });
});

describe('formatRow', () => {
  it('pads each cell to its column and clips long ones', () => {
    const line = formatRow(['a'.repeat(45), 'none', 'reject']);
    expect(line).toBe(`${'a'.repeat(39)}~ ${'none'.padEnd(14)} reject`);
  });
});

describe('evalInput', () => {
  const row = {
    source_slug: 'dau-la-dai-luc-a1234',
    source_name: 'Đấu La Đại Lục Phần 2',
    source_year: 2018,
    source_episode_count: null,
    other_names: null,
  };

  it('builds the input the filler would get, with the stored other names', () => {
    expect(
      evalInput({ ...row, other_names: ['Douluo Dalu', 'Soul Land'] }),
    ).toEqual({
      slug: 'dau-la-dai-luc-a1234',
      name: 'Đấu La Đại Lục Phần 2',
      seasonName: 'Phần 2',
      year: 2018,
      otherNames: ['Douluo Dalu', 'Soul Land'],
    });
  });

  it('leaves other names out for a slug with none stored', () => {
    expect(evalInput(row)).not.toHaveProperty('otherNames');
    expect(evalInput({ ...row, other_names: [] })).not.toHaveProperty(
      'otherNames',
    );
  });
});

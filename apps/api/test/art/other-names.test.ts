import { describe, expect, it } from 'vitest';
import { normalizeOtherNames } from '../../src/art/contract.ts';

describe('normalizeOtherNames', () => {
  it.each([
    [
      'trims each name and drops empty ones',
      ['  Black Clover ', '', '   '],
      ['Black Clover'],
    ],
    [
      'drops a repeat that differs only in case',
      ['Black Clover', 'BLACK CLOVER'],
      ['Black Clover'],
    ],
    [
      'drops the name the title is shown by',
      ['thế giới phép thuật', 'Black Clover'],
      ['Black Clover'],
    ],
    ['drops a name over 120 characters', ['a'.repeat(121), 'BC'], ['BC']],
    [
      'keeps the first 5',
      ['a', 'b', 'c', 'd', 'e', 'f'],
      ['a', 'b', 'c', 'd', 'e'],
    ],
  ])('%s', (_behavior, names, kept) => {
    expect(normalizeOtherNames(names, 'Thế Giới Phép Thuật')).toEqual(kept);
  });
});

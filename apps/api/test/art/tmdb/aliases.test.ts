import { describe, expect, it } from 'vitest';
import { tmdbAliases } from '../../../src/art/tmdb/aliases.ts';

describe('tmdbAliases', () => {
  it('keeps Latin names once and drops other scripts', async () => {
    const names = await tmdbAliases(
      {
        tvDetail: async () =>
          ({ name: 'Case Closed', original_name: '名探偵コナン' }) as never,
        tvAlternativeTitles: async () => [
          'Detective Conan',
          'Case Closed',
          '名探偵コナン',
        ],
      },
      30983,
    );
    expect(names).toEqual(['Case Closed', 'Detective Conan']);
  });
});

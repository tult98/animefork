import { describe, expect, it } from 'vitest';
import { malQueries } from '../../src/mal/mal.queries.ts';

describe('malQueries', () => {
  it('asks the slug romaji first when the display name is translated', () => {
    const queries = malQueries({
      slug: 'isekai-de-cheat-skill-wo-te-ni-shita-ore-wa-2nd-season-a6185',
      name: 'Sau Khi Có Được Năng Lực Bá Đạo Ở Dị Giới 2',
    });
    expect(queries[0]).toBe('isekai de cheat skill wo te');
  });

  it('keeps the display name first when it already is the romaji', () => {
    const queries = malQueries({
      slug: 'yozakura-san-chi-no-daisakusen-a5196',
      name: 'Yozakura-san Chi no Daisakusen',
    });
    expect(queries[0]).toBe('Yozakura-san Chi no Daisakusen');
  });
});

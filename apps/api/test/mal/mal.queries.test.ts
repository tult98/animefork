import { describe, expect, it } from 'vitest';
import {
  MAX_NAME_QUERIES,
  MAX_QUERIES,
  malQueries,
  sourceQueries,
} from '../../src/mal/mal.queries.ts';

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

const KIMETSU = {
  slug: 'kimetsu-no-yaiba-yuukaku-hen-a5',
  name: 'Thanh Gươm Diệt Quỷ: Kỹ Viện Trấn Arc',
};

const DONGHUA = { slug: 'dau-la-dai-luc-a1234', name: 'Đấu La Đại Lục' };

describe('sourceQueries', () => {
  it('asks the same queries as before for a title without other names', () => {
    const queries = sourceQueries(KIMETSU);
    expect(queries).toEqual(sourceQueries({ ...KIMETSU, otherNames: [] }));
    expect(queries).toEqual([
      'kimetsu no yaiba yuukaku hen',
      'kimetsu no yaiba',
      'Thanh Gươm Diệt Quỷ: Kỹ Viện Trấn Arc',
      'Thanh Gươm Diệt Quỷ',
    ]);
    expect(queries).toHaveLength(MAX_QUERIES);
  });

  it('asks the other names before the display name, with their season markers stripped', () => {
    expect(
      sourceQueries({
        ...DONGHUA,
        otherNames: ['Douluo Dalu Season 2', 'Soul Land'],
      }),
    ).toEqual([
      'Douluo Dalu',
      'Soul Land',
      'Đấu La Đại Lục',
      'dau la dai luc',
      'dau la dai',
    ]);
  });

  it('keeps the slug romaji first when it differs from the display name', () => {
    const queries = sourceQueries({
      slug: 'isekai-de-cheat-skill-wo-te-ni-shita-ore-wa-2nd-season-a6185',
      name: 'Sau Khi Có Được Năng Lực Bá Đạo Ở Dị Giới 2',
      otherNames: ['Cheat Skill', 'Iseleve'],
    });
    expect(queries.slice(0, 4)).toEqual([
      'isekai de cheat skill wo te',
      'isekai de cheat',
      'Cheat Skill',
      'Iseleve',
    ]);
  });

  it('asks at most two names, skipping one already asked, and raises the cap by those only', () => {
    const queries = sourceQueries({
      ...DONGHUA,
      otherNames: ['DAU LA DAI LUC', 'Douluo Dalu', 'Soul Land', 'Third One'],
    });
    expect(queries).toEqual([
      'Douluo Dalu',
      'Soul Land',
      'Đấu La Đại Lục',
      'dau la dai luc',
      'dau la dai',
    ]);
    const long = sourceQueries({
      ...KIMETSU,
      otherNames: ['Demon Slayer', 'Entertainment District Arc', 'Third One'],
    });
    expect(long).toHaveLength(MAX_QUERIES + MAX_NAME_QUERIES);
    expect(long).not.toContain('Third One');
  });
});

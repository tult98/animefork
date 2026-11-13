import { describe, expect, it } from 'vitest';
import { sourceQueries } from '../../src/mal/mal.queries.ts';

describe('sourceQueries', () => {
  it('asks the romaji in the slug before a translated name, at most four queries', () => {
    expect(
      sourceQueries({
        slug: 'kimetsu-no-yaiba-yuukaku-hen-a5',
        name: 'Thanh Gươm Diệt Quỷ: Kỹ Viện Trấn Arc',
      }),
    ).toEqual([
      'kimetsu no yaiba yuukaku hen',
      'kimetsu no yaiba',
      'Thanh Gươm Diệt Quỷ: Kỹ Viện Trấn Arc',
      'Thanh Gươm Diệt Quỷ',
    ]);
  });

  it('asks the display name first when it already is the romaji', () => {
    expect(
      sourceQueries({
        slug: 'yozakura-san-chi-no-daisakusen-a5196',
        name: 'Yozakura-san Chi no Daisakusen',
      })[0],
    ).toBe('Yozakura-san Chi no Daisakusen');
  });

  it('asks two of the other names before the display name, without their season markers or one already asked', () => {
    expect(
      sourceQueries({
        slug: 'dau-la-dai-luc-a1234',
        name: 'Đấu La Đại Lục',
        otherNames: [
          'DAU LA DAI LUC',
          'Douluo Dalu Season 2',
          'Soul Land',
          'Third One',
        ],
      }),
    ).toEqual([
      'Douluo Dalu',
      'Soul Land',
      'Đấu La Đại Lục',
      'dau la dai luc',
      'dau la dai',
    ]);
  });

  it('keeps the slug romaji ahead of the other names', () => {
    expect(
      sourceQueries({
        slug: 'isekai-de-cheat-skill-wo-te-ni-shita-ore-wa-2nd-season-a6185',
        name: 'Sau Khi Có Được Năng Lực Bá Đạo Ở Dị Giới 2',
        otherNames: ['Cheat Skill', 'Iseleve'],
      }).slice(0, 4),
    ).toEqual([
      'isekai de cheat skill wo te',
      'isekai de cheat',
      'Cheat Skill',
      'Iseleve',
    ]);
  });
});

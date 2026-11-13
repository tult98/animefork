import { describe, expect, it } from 'vitest';
import { episodeRowText } from '../episode-row.ts';

describe('episodeRowText', () => {
  it('puts the number and the status above the name of a named episode', () => {
    expect(
      episodeRowText({ label: 'Tập 3', name: 'Hộ vệ bóng tối' }, 'current'),
    ).toEqual({ meta: 'Tập 3 · Đang phát', title: 'Hộ vệ bóng tối' });
    expect(
      episodeRowText({ label: 'Tập 2', name: 'Cánh cửa' }, 'watched').meta,
    ).toBe('Tập 2 · Đã xem');
    expect(
      episodeRowText({ label: 'Tập 4', name: 'Ngày' }, undefined).meta,
    ).toBe('Tập 4');
  });

  it('titles an unnamed episode by its number and puts the status below', () => {
    expect(episodeRowText({ label: 'Tập 5' }, 'watched')).toEqual({
      title: 'Tập 5',
      below: 'Đã xem',
    });
    expect(episodeRowText({ label: 'Tập 5' }, undefined).below).toBeUndefined();
  });
});

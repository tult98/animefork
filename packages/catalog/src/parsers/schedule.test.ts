import { describe, expect, it } from 'vitest';
import { ScheduleDaySchema } from '../schemas.ts';
import { fixture, mutate, parseErrorOf } from '../test/fixture.ts';
import { parseSchedule } from './schedule.ts';

const html = fixture('lich-chieu-phim.html');

describe('parseSchedule (real capture, 2022)', () => {
  const days = parseSchedule(html);

  it('matches the snapshot', () => {
    expect(days).toMatchSnapshot();
  });

  it('passes the schema for every day', () => {
    expect(days.every((d) => ScheduleDaySchema.safeParse(d).success)).toBe(
      true,
    );
  });

  it('reads the weekday and date of a section', () => {
    expect(days[0]).toMatchObject({ weekday: 'Chủ Nhật', day: 2, month: 10 });
    expect(days).toHaveLength(6);
    expect(days[0]?.titles).toHaveLength(8);
  });

  it('does not mistake an air time for a release date', () => {
    expect(days.flatMap((d) => d.titles).map((t) => t.releaseTime)).toEqual(
      expect.not.arrayContaining(['01 giờ 15 phút']),
    );
    expect(days[0]?.titles[0]?.releaseTime).toBeUndefined();
  });

  it('names the container when the schedule is renamed', () => {
    const error = parseErrorOf(() =>
      parseSchedule(mutate(html, 'id="sched-content"', 'id="renamed"')),
    );
    expect(error.selector).toBe('#sched-content');
    expect(error.parser).toBe('schedule');
  });

  it('names the heading when a day loses its date', () => {
    const broken = mutate(
      html,
      /<h1><b>Chủ Nhật<\/b>, Ngày 02 tháng 10<\/h1>/,
      '<h1><b>Chủ Nhật</b></h1>',
    );
    const error = parseErrorOf(() => parseSchedule(broken));
    expect(error.selector).toBe('.Top > h1');
    expect(error.field).toBe('0.day');
  });
});

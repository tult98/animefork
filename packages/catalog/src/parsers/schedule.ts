import { ScheduleDaySchema, type ScheduleDay } from '../schemas.ts';
import { z } from 'zod';
import { CARD_SELECTORS, readCard } from './card.ts';
import {
  loadHtml,
  orUndefined,
  requireElement,
  text,
  validate,
  type FieldSelectors,
} from './dom.ts';

const PARSER = 'schedule';

const SCHEDULE_SELECTORS: FieldSelectors = {
  ...CARD_SELECTORS,
  weekday: '.Top > h1 > b',
  day: '.Top > h1',
  month: '.Top > h1',
};

/** `/lich-chieu-phim/`: one section per weekday. Days with no cards are skipped, as the old parser did. */
export function parseSchedule(html: string): ScheduleDay[] {
  const $ = loadHtml(html);
  const root = requireElement(PARSER, $, '#sched-content');

  const days = root
    .children('.Homeschedule')
    .toArray()
    .map((section) => {
      const day = $(section);
      const heading = day.find('.Top > h1').first();
      // "Chủ Nhật, Ngày 02 tháng 10": day of month first, then month.
      const [dayOfMonth, month] = text(heading)
        .split(',')
        .slice(1)
        .join(',')
        .match(/\d{1,2}/g)
        ?.map(Number) ?? [undefined, undefined];
      return {
        weekday: orUndefined(text(day.find('.Top > h1 > b').first())),
        day: dayOfMonth,
        month,
        titles: day
          .find('.MovieList')
          .first()
          .find('.TPostMv')
          .toArray()
          .map((card) => readCard($(card))),
      };
    })
    .filter((d) => d.titles.length > 0);

  return validate(PARSER, z.array(ScheduleDaySchema), days, SCHEDULE_SELECTORS);
}

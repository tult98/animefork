// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { formatEpisodeLabel, parseCard, parseCards } from './card-parser.ts';
import { TitleSchema } from './title.ts';

describe('formatEpisodeLabel', () => {
  it.each([
    ['TẬP19', 'Tập 19'],
    ['TẬP05', 'Tập 5'],
    ['TẬP 7', 'Tập 7'],
    ['tập100', 'Tập 100'],
    ['TẬP1219', 'Tập 1219'],
  ])('puts a space after the prefix: %s becomes %s', (raw, expected) => {
    expect(formatEpisodeLabel(raw)).toBe(expected);
  });

  it.each(['TẤT', '05/12', '', 'FULL'])('leaves %j alone', (raw) => {
    expect(formatEpisodeLabel(raw)).toBe(raw);
  });
});

function card(html: string): Element {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root.firstElementChild!;
}

const fullCard = `
<li class="TPostMv"><article class="TPost C"><a href="https://animevietsub.best/phim/psyren-a6115/"><div class="Image"><figure><img src="https://cdn.example/poster/p.jpg" alt=""></figure><span class="mli-eps">TẬP<i>05</i></span><div class="anime-extras"><div class="anime-avg-user-rating"><i class="fa fa-star"></i>8.4</div></div></div><h2 class="Title">Psyren</h2><span class="Year">Lượt xem: 1,163,798</span></a><div class="TPMvCn"><div class="Title">Psyren</div><p class="Info"><span class="Qlty">HD</span><span class="Vote AAIco-star">8.4</span><span class="Time AAIco-access_time">05/??</span><span class="Date AAIco-date_range">2026</span></p><div class="Description"><p> Ageha Yoshina.</p><p class="Studio"><span>Studio:</span> Satelight, Studio: X <i></i></p><p class="Genre"><span>Thể loại:</span><a href="/the-loai/a/">Shounen</a>, <a href="/the-loai/b/">Sci-Fi</a>, <i></i></p></div></div></article></li>`;

describe('parseCard', () => {
  it('reads every field from a full card', () => {
    expect(parseCard(card(fullCard))).toEqual({
      path: '/phim/psyren-a6115/',
      name: 'Psyren',
      image: 'https://cdn.example/poster/p.jpg',
      rating: 8.4,
      episodeLabel: 'Tập 5',
      year: 2026,
      genres: ['Shounen', 'Sci-Fi'],
      description: 'Ageha Yoshina.',
      studio: 'Satelight, Studio: X',
      views: 1163798,
      quality: 'HD',
    });
  });

  it('parses a card without genres, description or studio', () => {
    const bare = card(
      `<li><a href="/phim/x-a1/"><img src="/p.jpg"><span class="mli-eps">TẤT</span><div class="anime-avg-user-rating">7</div><h2 class="Title">X</h2></a></li>`,
    );
    const title = TitleSchema.parse(parseCard(bare));
    expect(title).toEqual({
      path: '/phim/x-a1/',
      name: 'X',
      image: '/p.jpg',
      rating: 7,
      episodeLabel: 'TẤT',
      genres: [],
    });
  });

  it('falls back to the star icon text for the rating', () => {
    const el = card(
      `<li><a href="/phim/x-a1/"><img src="/p.jpg"><span class="mli-eps">TẬP01</span><h2 class="Title">X</h2></a><p class="Info"><span class="Vote AAIco-star">9.1</span></p></li>`,
    );
    expect(parseCard(el).rating).toBe(9.1);
  });

  it('uses the progress text when a hero card has no episode label', () => {
    const el = card(
      `<div><a href="/phim/x-a1/"><img src="/p.jpg"></a><div class="Title">X</div><p class="Info"><span class="Vote AAIco-star">9</span><span class="Time">05/12</span></p></div>`,
    );
    expect(parseCard(el).episodeLabel).toBe('05/12');
  });
});

describe('parseCards', () => {
  it('throws on a non-numeric rating instead of producing NaN', () => {
    const root = document.createElement('div');
    root.innerHTML = fullCard.replace(
      '<i class="fa fa-star"></i>8.4',
      'not-a-number',
    );
    expect(() => parseCards(root, '.TPostMv')).toThrow();
  });

  it('throws on a card with no rating at all', () => {
    const root = document.createElement('div');
    root.innerHTML = `<li class="TPostMv"><a href="/phim/x/"><img src="/p.jpg"><span class="mli-eps">TẬP1</span><h2 class="Title">X</h2></a></li>`;
    expect(() => parseCards(root, '.TPostMv')).toThrow();
  });

  it('returns validated titles for every match', () => {
    const root = document.createElement('div');
    root.innerHTML = fullCard + fullCard;
    expect(parseCards(root, '.TPostMv')).toHaveLength(2);
  });
});

describe('parseCard upcoming', () => {
  const NOW = Date.UTC(2026, 10, 11);
  const upcoming = (
    schedule: string,
    info = '<span class="Time">PV/12</span>',
  ) =>
    card(
      `<li class="TPostMv"><article><a href="/phim/x-a1/"><div class="Image"><figure><img src="/p.jpg"></figure>${schedule}<div class="anime-avg-user-rating">8.1</div></div><h2 class="Title">X</h2></a><div class="TPMvCn"><p class="Info">${info}</p></div></article></li>`,
    );

  it('adds the timer seconds to now', () => {
    const el = upcoming(
      '<span class="mli-timeschedule" data-timer_second="4610575">7w</span><span class="b">2022-11-09</span>',
    );
    expect(parseCard(el, NOW).releasesAt).toBe(NOW + 4_610_575_000);
  });

  it('falls back to the date span without a timer', () => {
    const el = upcoming(
      '<span class="mli-timeschedule">SẮP CHIẾU</span><span class="b">2027-03-05</span>',
    );
    expect(parseCard(el, NOW).releasesAt).toBe(Date.UTC(2027, 2, 5));
  });

  it('reads the live year-only card as a year with no releasesAt', () => {
    const el = upcoming(
      '<span class="mli-timeschedule">SẮP CHIẾU</span><span class="b">2027</span>',
      '<span class="Time AAIco-access_time">PV/??</span><span class="Date AAIco-date_range">2027</span>',
    );
    const parsed = parseCard(el, NOW);
    expect(parsed.releasesAt).toBeUndefined();
    expect(parsed.year).toBe(2027);
    expect(parsed.episodeLabel).toBe('PV/??');
  });

  it('falls back to the bare .b year when the date icon is missing', () => {
    const el = upcoming(
      '<span class="mli-timeschedule">SẮP CHIẾU</span><span class="b">2028</span>',
    );
    expect(parseCard(el, NOW).year).toBe(2028);
    const dated = upcoming(
      '<span class="mli-timeschedule">SẮP CHIẾU</span><span class="b">2028-02-01</span>',
    );
    expect(parseCard(dated, NOW).year).toBeUndefined();
  });

  it('leaves releasesAt unset for a bare year or no schedule', () => {
    expect(
      parseCard(
        upcoming(
          '<span class="mli-timeschedule">SẮP CHIẾU</span><span class="b">2023</span>',
        ),
        NOW,
      ).releasesAt,
    ).toBeUndefined();
    expect(parseCard(card(fullCard), NOW).releasesAt).toBeUndefined();
  });

  it('uses .Info .Time as the label and a fallback when it is blank', () => {
    const schedule =
      '<span class="mli-timeschedule" data-timer_second="10">x</span>';
    expect(parseCard(upcoming(schedule), NOW).episodeLabel).toBe('PV/12');
    const blank = parseCard(upcoming(schedule, ''), NOW);
    expect(blank.episodeLabel).toBe('Sắp chiếu');
    expect(TitleSchema.safeParse(blank).success).toBe(true);
  });

  it('passes now through parseCards', () => {
    const root = document.createElement('ul');
    root.append(
      upcoming(
        '<span class="mli-timeschedule" data-timer_second="60">x</span>',
      ),
    );
    expect(parseCards(root, '.TPostMv', NOW)[0]?.releasesAt).toBe(NOW + 60_000);
  });
});

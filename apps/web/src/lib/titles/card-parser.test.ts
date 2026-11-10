// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseCard, parseCards } from './card-parser.ts';
import { TitleSchema } from './title.ts';

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
      episodeLabel: 'TẬP05',
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

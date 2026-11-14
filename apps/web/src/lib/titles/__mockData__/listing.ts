interface MockListingCard {
  id: number;
  rating?: number;
  views?: number;
}

// A season card as the site writes it, named "Phim <id>".
const card = ({ id, rating = 8, views }: MockListingCard) =>
  `<li class="TPostMv"><article><a href="https://animevietsub.best/phim/phim-${id}-a${id}/"><div class="Image"><figure><img src="https://cdn.animevietsub.best/poster/${id}.jpg"></figure><span class="mli-eps">TẬP<i>01</i></span><div class="anime-extras"><div class="anime-avg-user-rating">${rating}</div></div></div><h2 class="Title">Phim ${id}</h2>${views ? `<span class="Year">Lượt xem: ${views}</span>` : ''}</a></article></li>`;

const page = (cards: MockListingCard[], current: number) =>
  `<html><body><ul>${cards.map(card).join('')}</ul><div class="wp-pagenavi"><span class="pages">Trang ${current} của 2</span></div></body></html>`;

// Page 1 of a source with 33 titles: Phim 1 to Phim 30. Phim 3 has the best rating (9.5) and Phim 5 the most views.
export const mockListingPage1Html = page(
  Array.from({ length: 30 }, (_, index) => ({
    id: index + 1,
    rating: index + 1 === 3 ? 9.5 : 8,
    views: index + 1 === 5 ? 9000 : 100,
  })),
  1,
);

// Page 2 of that source: Phim 31 to Phim 33. Phim 31 has the most views (12000) and the worst rating (5).
export const mockListingPage2Html = page(
  [
    { id: 31, rating: 5, views: 12000 },
    { id: 32, views: 100 },
    { id: 33, views: 100 },
  ],
  2,
);

// One page of a source with 2 titles and no pager.
export const mockShortListingHtml = `<html><body><ul>${[{ id: 1 }, { id: 2 }]
  .map(card)
  .join('')}</ul></body></html>`;

// The Sắp chiếu page: one card with a 2 hour countdown and one with only a year.
const upcomingCard = (id: number, when: string) =>
  `<li class="TPostMv"><article><a href="https://animevietsub.best/phim/sap-${id}-a${id}/"><div class="Image"><figure><img src="https://cdn.animevietsub.best/poster/${id}.jpg"></figure>${when}<div class="anime-extras"><div class="anime-avg-user-rating">8</div></div></div><h2 class="Title">Sắp ${id}</h2></a></article></li>`;

export const mockUpcomingHtml = `<html><body><ul>
${upcomingCard(1, '<span class="mli-timeschedule" data-timer_second="7200">countdown</span>')}
${upcomingCard(2, '<span class="mli-timeschedule"></span><span class="b">2099</span>')}
</ul></body></html>`;

// A search page with "Phim 1" and "Phim 2" and a pager of 3 pages, or no cards at all.
export const mockSearchHtml = page([{ id: 1 }, { id: 2 }], 1).replace(
  'của 2',
  'của 3',
);

export const mockSearchNoCardsHtml = '<html><body><ul></ul></body></html>';

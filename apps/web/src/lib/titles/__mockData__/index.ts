interface MockCard {
  path: string;
  name: string;
  rating?: number;
  label?: string;
  year?: number;
  quality?: string;
  views?: number;
  studio?: string;
  genres?: string[];
  description?: string;
}

// One card as the site writes it, with only the parts the test reads.
const card = ({
  path,
  name,
  rating = 8,
  label = 'TẬP<i>01</i>',
  year,
  quality,
  views,
  studio,
  genres = [],
  description,
}: MockCard) =>
  `<li class="TPostMv"><article><a href="https://animevietsub.best${path}"><div class="Image"><figure><img src="https://cdn.animevietsub.best/poster${path}.jpg"></figure><span class="mli-eps">${label}</span><div class="anime-extras"><div class="anime-avg-user-rating">${rating}</div></div></div><h2 class="Title">${name}</h2>${views ? `<span class="Year">Lượt xem: ${views.toLocaleString('en-US')}</span>` : ''}</a><div class="TPMvCn"><p class="Info">${quality ? `<span class="Qlty">${quality}</span>` : ''}${year ? `<span class="Date AAIco-date_range">${year}</span>` : ''}</p><div class="Description">${description ? `<p>${description}</p>` : ''}${studio ? `<p class="Studio"><span>Studio:</span> ${studio}</p>` : ''}${genres.length ? `<p class="Genre"><span>Thể loại:</span>${genres.map((g) => `<a href="/the-loai/${g}/">${g}</a>`).join(', ')}</p>` : ''}</div></div></article></li>`;

// A card of the Sắp chiếu block. It has no episode, only a countdown, a date or a year.
const upcoming = (name: string, when: string) =>
  `<li class="TPostMv"><article><a href="https://animevietsub.best/phim/${name}-a1/"><div class="Image"><figure><img src="https://cdn.animevietsub.best/poster/${name}.jpg"></figure>${when}<div class="anime-extras"><div class="anime-avg-user-rating">8</div></div></div><h2 class="Title">${name}</h2></a><div class="TPMvCn"><p class="Info"><span class="Time">PV/12</span></p></div></article></li>`;

export const MOCK_SEASON_PATH = '/season/autumn/2026/';

export const mockHomeHtml = `<html><body>
<div class="MovieListSldCn"><ul>
${card({ path: '/phim/shinja-zero-a1/', name: 'Shinja Zero no Megami-sama to Hajimeru Isekai Kouryaku', genres: ['Fantasy'], description: 'Hero one.' })}
${card({ path: '/phim/psyren-a6115/', name: 'Psyren', genres: ['Shounen', 'Sci-Fi'], description: 'Hero two.' })}
</ul></div>
<div id="hot-home"><ul>
${card({ path: '/phim/black-clover-2nd-a2/', name: 'Black Clover 2nd Season', genres: ['Action'], description: 'Top one.' })}
${card({ path: '/phim/tonikaku-kawaii-a3860/', name: 'Tonikaku Kawaii', genres: ['Romance'], description: 'Top two.' })}
</ul></div>
<section id="new-home"><ul>
${upcoming('countdown', '<span class="mli-timeschedule" data-timer_second="7200">countdown</span>')}
${upcoming('dated', '<span class="mli-timeschedule"></span><span class="b">2099-01-01</span>')}
${upcoming('year-only-a', '<span class="mli-timeschedule"></span><span class="b">2022</span>')}
${upcoming('year-only-b', '<span class="mli-timeschedule"></span><span class="b">2030</span>')}
</ul></section>
<section id="single-home"><div class="Top"><a href="/anime-moi/" data-tag="anime-new">Tất cả</a><a href="${MOCK_SEASON_PATH}" class="STPb" data-tag="anime-season">Mùa Thu - 2026</a></div></section>
</body></html>`;

export const mockNewEpisodesHtml = `<html><body><ul>
${card({ path: '/phim/kamui-san-a6084/', name: 'Ushiro no Shoumen Kamui-san', rating: 8.8, label: 'TẬP<i>19</i>', year: 2026, quality: 'HD', views: 315099, studio: 'Zero-G, ZG-R', genres: ['Comedy'], description: 'First.' })}
${card({ path: '/phim/psyren-a6115/', name: 'Psyren', label: 'TẬP<i>05</i>', genres: ['Shounen'] })}
</ul></body></html>`;

const pager = (current: number) =>
  `<div class="wp-pagenavi"><span class="pages">Trang ${current} của 3</span></div>`;

export const mockSeasonHtml = `<html><body><ul>
${card({ path: '/phim/season-one-a10/', name: 'Season One', genres: ['Drama'] })}
${card({ path: '/phim/season-two-a11/', name: 'Season Two', genres: ['Drama'] })}
</ul>${pager(1)}</body></html>`;

export const mockSeasonPage2Html = `<html><body><ul>
${card({ path: '/phim/season-three-a12/', name: 'Season Three' })}
${card({ path: '/phim/season-four-a13/', name: 'Season Four' })}
</ul>${pager(2)}</body></html>`;

export const mockSeasonPage3Html = `<html><body><ul>
${card({ path: '/phim/season-five-a14/', name: 'Season Five' })}
</ul>${pager(3)}</body></html>`;

export const MOCK_WATCH_SLUG = 'tonikaku-kawaii-a3860';

export const mockWatchHtml = `<html><body>
<div id="list-server"><div class="server"><ul class="list-episode">
<li class="episode playing"><a data-id="72839" title="Tập 01_BD_Full" data-play="api" data-hash="hash-72839">Xem 01_BD_Full</a></li>
<li class="episode"><a data-id="73010" title="Tập 02" data-play="api" data-hash="hash-73010">02</a></li>
<li class="episode"><a data-id="73386" title="Tập 03" data-play="api" data-hash="hash-73386">03</a></li>
</ul></div></div>
<article class="TPost Single"><header>
<h1 class="Title">Tonikaku Kawaii [BD]</h1>
<div class="Image"><img src="/poster.svg" alt=""></div>
<h2 class="SubTitle">TONIKAWA: Over the Moon For You</h2>
</header>
<div class="season_item"><a href="https://animevietsub.cc/phim/tonikaku-kawaii-a3860/" class="active">Phần TV Series</a><a href="https://animevietsub.cc/phim/tonikaku-kawaii-sns-a4229/">Phần OVA</a></div>
</article>
</body></html>`;

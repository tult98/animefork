// A card as the site writes it. A shelf needs 8 titles, so the lists are generated from names.
const card = (path: string, name: string, label = 'TẬP<i>01</i>') =>
  `<li class="TPostMv"><article><a href="https://animevietsub.best${path}"><div class="Image"><figure><img src="https://cdn.animevietsub.best/poster${path}.jpg"></figure><span class="mli-eps">${label}</span><div class="anime-extras"><div class="anime-avg-user-rating">8</div></div></div><h2 class="Title">${name}</h2></a><div class="TPMvCn"><p class="Info"></p><div class="Description"><p>About ${name}.</p><p class="Genre"><span>Thể loại:</span><a href="/the-loai/drama/">Drama</a></p></div></div></article></li>`;

const upcoming = (name: string, when: string) =>
  `<li class="TPostMv"><article><a href="https://animevietsub.best/phim/${name}-a1/"><div class="Image"><figure><img src="https://cdn.animevietsub.best/poster/${name}.jpg"></figure>${when}<div class="anime-extras"><div class="anime-avg-user-rating">8</div></div></div><h2 class="Title">${name}</h2></a><div class="TPMvCn"><p class="Info"><span class="Time">PV/12</span></p></div></article></li>`;

const eight = (group: string, label?: string) =>
  [1, 2, 3, 4, 5, 6, 7, 8]
    .map((n) => card(`/phim/${group}-${n}-a${n}/`, `${group} ${n}`, label))
    .join('\n');

// Two hero titles, eight top titles, three upcoming titles and a season tab for autumn 2026.
export const homeHtml = `<html><body>
<div class="MovieListSldCn"><ul>
${card('/phim/hero-1-a1/', 'Hero 1')}
${card('/phim/hero-2-a2/', 'Hero 2')}
</ul></div>
<div id="hot-home"><ul>${eight('top')}</ul></div>
<section id="new-home"><ul>
${upcoming('soon', '<span class="mli-timeschedule" data-timer_second="7200">soon</span>')}
${upcoming('dated', '<span class="mli-timeschedule"></span><span class="b">2099-01-01</span>')}
${upcoming('year', '<span class="mli-timeschedule"></span><span class="b">2099</span>')}
</ul></section>
<section id="single-home"><div class="Top"><a href="/season/autumn/2026/" class="STPb" data-tag="anime-season">Mùa Thu - 2026</a></div></section>
</body></html>`;

// Eight titles with a new episode.
export const newEpisodesHtml = `<html><body><ul>${eight('fresh', 'TẬP<i>19</i>')}</ul></body></html>`;

// Eight titles of the autumn 2026 season.
export const seasonHtml = `<html><body><ul>${eight('airing')}</ul></body></html>`;

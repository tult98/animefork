// A card as the site writes it. A shelf needs 8 titles, so the lists are generated from names.
const card = (path: string, name: string, description: string) =>
  `<li class="TPostMv"><article><a href="https://animevietsub.best${path}"><div class="Image"><figure><img src="https://cdn.animevietsub.best/poster${path}.jpg"></figure><span class="mli-eps">TẬP<i>01</i></span><div class="anime-extras"><div class="anime-avg-user-rating">8</div></div></div><h2 class="Title">${name}</h2></a><div class="TPMvCn"><p class="Info"></p><div class="Description"><p>${description}</p></div></div></article></li>`;

const eight = (group: string) =>
  [1, 2, 3, 4, 5, 6, 7, 8]
    .map((n) =>
      card(
        `/phim/${group}-${n}-a${n}/`,
        `${group} ${n}`,
        `About ${group} ${n}.`,
      ),
    )
    .join('\n');

// Heroes hero-1-a1 and hero-2-a2 (descriptions "About hero 1." and "About hero 2."), top 10 titles top-1-a1 to top-8-a8. No season tab, so the page fetches no season.
export const homeArtHtml = `<html><body>
<div class="MovieListSldCn"><ul>
${card('/phim/hero-1-a1/', 'hero 1', 'About hero 1.')}
${card('/phim/hero-2-a2/', 'hero 2', 'About hero 2.')}
</ul></div>
<div id="hot-home"><ul>${eight('top')}</ul></div>
</body></html>`;

// New episodes fresh-1-a1 to fresh-8-a8.
export const homeArtNewEpisodesHtml = `<html><body><ul>${eight('fresh')}</ul></body></html>`;

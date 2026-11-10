import { z } from 'zod';
import {
  EpisodeSchema,
  TitleDetailSchema,
  titleIdFromPath,
  type Episode,
  type TitleDetail,
} from '../schemas.ts';
import { ParseError } from '../errors.ts';
import { CARD_SELECTORS, progressOf, ratingOf, readCard } from './card.ts';
import {
  intOf,
  loadHtml,
  orUndefined,
  pathOf,
  requireElement,
  text,
  validate,
  type CheerioAPI,
  type FieldSelectors,
  type Sel,
} from './dom.ts';

const PARSER = 'detail';
interface RawEpisode {
  id: string;
  name: string;
  path: string | undefined;
  play?: string | undefined;
  hash?: string | undefined;
}

const EPISODE_LINKS = '#list-server .list-episode .episode a';

const DETAIL_SELECTORS: FieldSelectors = {
  ...CARD_SELECTORS,
  name: '.Title',
  image: '.Image img',
  path: '.watch_button_more',
  id: '.watch_button_more',
  related: '.MovieListRelated .TPostMv',
};

/** The value after the colon of an `.InfoList` row, picked by its (Vietnamese) label. */
function infoRow($: CheerioAPI, label: string): Sel {
  const rows = $('.InfoList > li').toArray();
  const hit = rows.find((li) =>
    text($(li).find('strong').first()).toLowerCase().startsWith(label),
  );
  return hit === undefined ? $([]) : $(hit);
}

function infoValue(row: Sel): string | undefined {
  const [, ...rest] = text(row).split(':');
  return orUndefined(rest.join(':').trim());
}

function anchors($: CheerioAPI, row: Sel) {
  return row
    .find('a')
    .toArray()
    .map((a) => ({ path: pathOf($(a).attr('href')), name: text($(a)) }));
}

function titlePath($: CheerioAPI): string | undefined {
  const href =
    $('.watch_button_more').first().attr('href') ??
    $('.season_item a.active').first().attr('href');
  return pathOf(href)?.match(/^\/phim\/[^/]+\//)?.[0];
}

function episodesOf($: CheerioAPI): RawEpisode[] {
  const seen = new Set<string>();
  const episodes: RawEpisode[] = [];
  const push = (episode: RawEpisode) => {
    if (seen.has(episode.id)) return;
    seen.add(episode.id);
    episodes.push(episode);
  };

  for (const a of $(EPISODE_LINKS).toArray()) {
    const link = $(a);
    const id = link.attr('data-id');
    if (id === undefined) continue;
    push({
      id,
      name: orUndefined(link.attr('title')) ?? text(link),
      path: pathOf(link.attr('href')),
      play: orUndefined(link.attr('data-play')),
      hash: orUndefined(link.attr('data-hash')),
    });
  }
  if (episodes.length > 0) return episodes;

  // A title page lists only the newest few episodes ("Tập mới"), with no player token.
  for (const a of $('.latest_eps a').toArray()) {
    const link = $(a);
    const path = pathOf(link.attr('href'));
    const id = path?.match(/-(\d+)\.html$/)?.[1];
    if (id === undefined) continue;
    push({ id, name: `Tập ${text(link)}`, path });
  }
  return episodes;
}

/** Episode links of a watch page (`/phim/<slug>/xem-phim-<id>.html`) or a title page. */
export function parseEpisodes(html: string): Episode[] {
  const episodes = episodesOf(loadHtml(html));
  if (episodes.length === 0) {
    throw new ParseError(PARSER, {
      selector: EPISODE_LINKS,
      reason: 'no episode links found',
    });
  }
  return validate(PARSER, z.array(EpisodeSchema), episodes, {
    id: 'data-id',
    name: 'title',
  });
}

export function parseDetail(html: string): TitleDetail {
  const $ = loadHtml(html);
  requireElement(PARSER, $, '.Title');

  const path = titlePath($);
  const genreRow = infoRow($, 'thể loại');
  const genreLinks = anchors($, genreRow);
  const genres = genreLinks.filter((g) => g.path?.startsWith('/the-loai/'));
  const format = genreLinks.find((g) => !g.path?.startsWith('/the-loai/'));
  const seasonLink = anchors($, infoRow($, 'season'))[0];
  const year = Number.parseInt(text($('.AAIco-date_range').first()), 10);
  const ageRating = text(infoRow($, 'rating').find('.imdb').first());
  const joinNames = (row: Sel) =>
    orUndefined(
      anchors($, row)
        .map((a) => a.name)
        .join(', '),
    );

  const raw = {
    id: path === undefined ? undefined : titleIdFromPath(path),
    path,
    name: orUndefined(text($('.Title').first())),
    image: orUndefined($('.Image img').first().attr('src')),
    rating: ratingOf([text($('#average_score').first())]),
    episodeLabel: progressOf(text($('.AAIco-access_time').first())),
    genres: genres.length === 0 ? undefined : genres,
    year: Number.isNaN(year) ? undefined : year,
    description: orUndefined(text($('.Description').first())),
    studio: orUndefined(infoValue(infoRow($, 'studio'))),
    quality: orUndefined(text($('.Qlty').first())),

    otherName: orUndefined(text($('.SubTitle').first())),
    banner: orUndefined($('.TPostBg img').first().attr('src')),
    watchPath: pathOf($('.watch_button_more').first().attr('href')),
    ratingCount: intOf(text($('.num-rating').first())),
    views: intOf(text($('.AAIco-remove_red_eye').first())),
    format: format?.name,
    country: joinNames(infoRow($, 'quốc gia')),
    director: joinNames(infoRow($, 'đạo diễn')),
    language: orUndefined(infoValue(infoRow($, 'ngôn ngữ'))),
    seasonLabel: orUndefined(seasonLink?.name),
    airingStatus: orUndefined(infoValue(infoRow($, 'trạng thái'))),
    // The site prints the literal "None" when no age rating is set.
    ageRating: ageRating === 'None' ? undefined : orUndefined(ageRating),
    followers: intOf(infoValue(infoRow($, 'số người theo dõi'))),
    trailer: orUndefined($('#Opt1 iframe').first().attr('src')),
    parts: $('.season_item > a')
      .toArray()
      .map((a) => ({ path: pathOf($(a).attr('href')), name: text($(a)) })),
    episodes: episodesOf($),
    related: $('.MovieListRelated .TPostMv')
      .toArray()
      .map((card) => readCard($(card))),
  };
  return validate(PARSER, TitleDetailSchema, raw, DETAIL_SELECTORS);
}

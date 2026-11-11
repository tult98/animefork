import type { TmdbImage } from './tmdb.ts';

export interface PickedImage {
  path: string;
  lang: 'vi' | 'en' | null;
}

function tier(image: TmdbImage): number | undefined {
  if (image.iso_639_1 === 'vi') return 0;
  if (image.iso_639_1 === 'en') return 1;
  if (image.iso_639_1 === null) return 2;
  return undefined;
}

function better(a: TmdbImage, b: TmdbImage): number {
  return (
    b.vote_average - a.vote_average ||
    b.vote_count - a.vote_count ||
    b.width - a.width
  );
}

function pickImage(images: TmdbImage[]): PickedImage | null {
  let best: { image: TmdbImage; tier: number } | undefined;
  for (const image of images) {
    const t = tier(image);
    if (t === undefined) continue;
    if (
      !best ||
      t < best.tier ||
      (t === best.tier && better(image, best.image) < 0)
    ) {
      best = { image, tier: t };
    }
  }
  if (!best) return null;
  return {
    path: best.image.file_path,
    lang: best.image.iso_639_1 as 'vi' | 'en' | null,
  };
}

export const pickBackdrop = pickImage;
export const pickPoster = pickImage;

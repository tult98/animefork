import { Trailer } from './trailer.tsx';
import { NO_HOVER_QUERY, REDUCED_MOTION_QUERY } from './use-hover-preview.ts';

// Mounted only while the popover is open.
export function PromoVideo({ youtubeId }: { youtubeId: string }) {
  if (
    window.matchMedia(NO_HOVER_QUERY).matches ||
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  ) {
    return null;
  }
  return (
    <Trailer youtubeId={youtubeId} muted loop testId="card:promo-video" />
  );
}

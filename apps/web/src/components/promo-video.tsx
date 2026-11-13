import { useState } from 'react';
import { NO_HOVER_QUERY, REDUCED_MOTION_QUERY } from './use-hover-preview.ts';

export function promoVideoSrc(youtubeId: string): string {
  const id = encodeURIComponent(youtubeId);
  // A looping embed needs its own id as the playlist.
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&modestbranding=1&playsinline=1`;
}

// Plays over the image it is placed on, which stays visible until the video has loaded. Mounted only while the popover is open.
export function PromoVideo({ youtubeId }: { youtubeId: string }) {
  const [loaded, setLoaded] = useState(false);
  if (
    window.matchMedia(NO_HOVER_QUERY).matches ||
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  ) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      data-loaded={loaded ? '' : undefined}
      className="video-cover promo-video"
    >
      <iframe
        src={promoVideoSrc(youtubeId)}
        title=""
        tabIndex={-1}
        allow="autoplay; encrypted-media"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setLoaded(true)}
        data-testid="card:promo-video"
      />
    </div>
  );
}

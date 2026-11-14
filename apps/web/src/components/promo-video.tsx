import { useState } from 'react';
import { useClaimCardVideo } from '../lib/ui/card-video.ts';
import { TrailerSoundButton } from './trailer-sound-button.tsx';
import { Trailer, type TrailerPhase } from './trailer.tsx';
import { NO_HOVER_QUERY, REDUCED_MOTION_QUERY } from './use-hover-preview.ts';

export function PromoVideo({ youtubeId }: { youtubeId: string }) {
  if (
    window.matchMedia(NO_HOVER_QUERY).matches ||
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  ) {
    return null;
  }
  return <CardTrailer youtubeId={youtubeId} />;
}

function CardTrailer({ youtubeId }: { youtubeId: string }) {
  const [phase, setPhase] = useState<TrailerPhase>('loading');
  useClaimCardVideo();
  return (
    <>
      <Trailer
        youtubeId={youtubeId}
        loop
        onPhase={setPhase}
        testId="card:promo-video"
      />
      {phase === 'playing' ? (
        <TrailerSoundButton
          className="af-circle absolute right-3 bottom-3 z-2 size-9 bg-hero-overlay hover:border-ink hover:bg-pill-active [&_svg]:size-[18px]"
          testId="card:promo-video:sound"
        />
      ) : null}
    </>
  );
}

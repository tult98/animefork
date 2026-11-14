import { setTrailerMuted, useTrailerMuted } from '../lib/ui/trailer-sound.ts';
import { Volume2, VolumeX } from './ui/icons.ts';

export function TrailerSoundButton({
  className,
  testId,
}: {
  className: string;
  testId: string;
}) {
  const muted = useTrailerMuted();
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
      className={`${className} trailer-toggle`}
      onClick={(event) => {
        event.stopPropagation();
        setTrailerMuted(!muted);
      }}
    >
      {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
    </button>
  );
}

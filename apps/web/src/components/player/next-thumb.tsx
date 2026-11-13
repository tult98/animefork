import type { Episode } from '../../lib/titles/watch.ts';
import { Play } from '../ui/icons.ts';

interface NextThumbProps {
  episode: Episode;
  image?: string;
  // 0..1, the brand strip along the bottom edge. Left out, there is no strip.
  fraction?: number;
}

export function NextThumb({ episode, image, fraction }: NextThumbProps) {
  const src = episode.thumbnail ?? image;
  return (
    <span className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-md bg-surface-alt">
      {src ? (
        <img
          src={src}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-60"
        />
      ) : null}
      <span className="relative grid size-14 place-items-center rounded-full bg-hero-overlay shadow-[inset_0_0_0_2px_var(--ink)]">
        <Play aria-hidden="true" className="ml-0.5 size-6 fill-current" />
      </span>
      {fraction !== undefined ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-1 bg-progress-track"
        >
          <span
            className="block h-full bg-brand"
            style={{ width: `${fraction * 100}%` }}
          />
        </span>
      ) : null}
    </span>
  );
}

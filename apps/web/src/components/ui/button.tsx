import { Button as BaseButton } from '@base-ui/react/button';
import type { ComponentProps } from 'react';
import type { LucideIcon } from './icons.ts';

export const KIND_CLASS = { pill: 'af-pill', rect: 'af-btn' } as const;

export const TONE_CLASS = {
  pill: {
    play: 'af-pill--play',
    quiet: 'af-pill--quiet',
    brand: 'af-pill--brand',
    outline: 'af-pill--outline',
  },
  rect: {
    primary: 'af-btn--primary',
    'utility-primary': 'af-btn--utility af-btn--utility-primary',
    'utility-outline': 'af-btn--utility af-btn--utility-outline',
  },
} as const;

type Variant =
  | { kind: 'pill'; tone: keyof (typeof TONE_CLASS)['pill'] }
  | { kind: 'rect'; tone: keyof (typeof TONE_CLASS)['rect'] };

type ButtonProps = Variant &
  Omit<ComponentProps<typeof BaseButton>, 'className'> & {
    className?: string;
    icon?: LucideIcon;
    // Solid glyph such as Play. Outline glyphs keep their stroke.
    iconFilled?: boolean;
  };

export function Button({
  kind,
  tone,
  icon: Icon,
  iconFilled = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  const tones: Record<string, string> = TONE_CLASS[kind];
  return (
    <BaseButton
      className={[KIND_CLASS[kind], tones[tone], className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {Icon && (
        // bundle.css sets .af-pill svg{fill:currentColor}, which beats lucide's fill attribute, so the fill is restated as a utility.
        <Icon
          className={iconFilled ? 'fill-current stroke-none' : 'fill-none'}
        />
      )}
      {children}
    </BaseButton>
  );
}

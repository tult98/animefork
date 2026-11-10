import type { ComponentProps } from 'react';

const LOGO_SRC = {
  wordmark: {
    dark: '/brand/animefork-logo-on-dark.svg',
    light: '/brand/animefork-logo-on-light.svg',
  },
  mark: {
    dark: '/brand/animefork-mark-on-dark.svg',
    light: '/brand/animefork-mark-on-light.svg',
  },
} as const;

type LogoProps = Omit<ComponentProps<'img'>, 'src' | 'alt'> & {
  variant?: keyof typeof LOGO_SRC;
  // The ground the logo sits on, not the theme. The files carry their own colors and are never recolored.
  ground?: 'dark' | 'light';
};

export function Logo({
  variant = 'wordmark',
  ground = 'dark',
  ...rest
}: LogoProps) {
  return <img src={LOGO_SRC[variant][ground]} alt="AnimeFork" {...rest} />;
}

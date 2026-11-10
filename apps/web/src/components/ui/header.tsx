import { Button as BaseButton } from '@base-ui/react/button';
import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from './icons.ts';
import { Logo } from './logo.tsx';

type HeaderProps = ComponentProps<'header'> & {
  // Solid on canvas with the masthead shadow, for a scrolled page or marketing pages.
  solid?: boolean;
  logo?: ReactNode;
};

export function Header({
  solid = false,
  logo = <Logo />,
  className,
  children,
  ...rest
}: HeaderProps) {
  return (
    <header
      className={['af-header', solid && 'af-header--solid', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {logo}
      {children}
    </header>
  );
}

export function HeaderNav({ className, ...rest }: ComponentProps<'nav'>) {
  return (
    <nav className={className ? `af-nav ${className}` : 'af-nav'} {...rest} />
  );
}

// For router links that set their own aria-current, such as TanStack Link.
export const NAV_PILL_CLASS = 'af-navpill';

type NavPillProps = ComponentProps<'a'> & { current?: boolean };

export function NavPill({ current, className, ...rest }: NavPillProps) {
  return (
    <a
      className={className ? `${NAV_PILL_CLASS} ${className}` : NAV_PILL_CLASS}
      aria-current={current ? 'page' : undefined}
      {...rest}
    />
  );
}

export function HeaderActions({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      className={
        className ? `af-header-actions ${className}` : 'af-header-actions'
      }
      {...rest}
    />
  );
}

type HeaderIconButtonProps = Omit<
  ComponentProps<typeof BaseButton>,
  'children' | 'aria-label'
> & { icon: LucideIcon; label: string };

export function HeaderIconButton({
  icon: Icon,
  label,
  ...rest
}: HeaderIconButtonProps) {
  return (
    <BaseButton aria-label={label} className="cursor-pointer" {...rest}>
      <Icon className="af-icon" />
    </BaseButton>
  );
}

export function HeaderAvatarButton({
  label,
  className,
  ...rest
}: Omit<ComponentProps<typeof BaseButton>, 'children' | 'aria-label'> & {
  label: string;
}) {
  return (
    <BaseButton aria-label={label} className={className} {...rest}>
      <span className="af-avatar" />
    </BaseButton>
  );
}

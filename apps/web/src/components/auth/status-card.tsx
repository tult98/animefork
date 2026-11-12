import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from '../ui/icons.ts';

const TONE_CLASS = {
  brand: 'text-brand',
  success: 'text-success',
  error: 'text-error',
} as const;

type StatusCardProps = Omit<ComponentProps<'div'>, 'className'> & {
  icon: LucideIcon;
  tone: keyof typeof TONE_CLASS;
  spin?: boolean;
  children: ReactNode;
};

export function StatusCard({
  icon: Icon,
  tone,
  spin = false,
  children,
  ...rest
}: StatusCardProps) {
  return (
    <div className="af-auth-card items-center text-center" {...rest}>
      <div
        aria-hidden="true"
        className="mb-2 grid size-18 place-items-center rounded-full bg-surface-alt"
      >
        <Icon
          className={`size-9 ${TONE_CLASS[tone]} ${spin ? 'animate-spin' : ''}`}
        />
      </div>
      {children}
    </div>
  );
}

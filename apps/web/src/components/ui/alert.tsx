import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck } from './icons.ts';

interface AlertProps {
  children: ReactNode;
  className?: string;
}

export function ErrorAlert({ children, className }: AlertProps) {
  return (
    <div
      className={['af-alert af-alert--error', className]
        .filter(Boolean)
        .join(' ')}
      role="alert"
    >
      <CircleAlert aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function SuccessAlert({ children, className }: AlertProps) {
  return (
    <div
      className={['af-alert af-alert--success', className]
        .filter(Boolean)
        .join(' ')}
      role="status"
    >
      <CircleCheck aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

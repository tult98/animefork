import type { ReactNode } from 'react';
import { CircleAlert } from './icons.ts';

export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <div className="af-alert af-alert--error" role="alert">
      <CircleAlert aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

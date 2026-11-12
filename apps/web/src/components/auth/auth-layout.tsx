import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { authCopy } from '../../lib/auth/copy.ts';
import { Logo } from '../ui/logo.tsx';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="af-auth min-h-screen">
      <div className="af-auth-top">
        <Link
          to="/"
          aria-label={authCopy.brandHome}
          className="flex min-h-11 items-center"
        >
          <Logo />
        </Link>
      </div>
      <div className="af-auth-main">
        <div className="af-auth-form">{children}</div>
        <aside className="af-auth-panel" aria-label={authCopy.panel.label}>
          <svg
            className="af-auth-panel-art"
            aria-hidden="true"
            viewBox="0 0 640 640"
            preserveAspectRatio="xMidYMid slice"
          >
            <circle
              cx="470"
              cy="190"
              r="210"
              style={{ fill: 'var(--brand)' }}
            />
            <circle cx="600" cy="70" r="64" style={{ fill: 'var(--ink)' }} />
          </svg>
          <div className="af-auth-copy">
            <h2>{authCopy.panel.headline}</h2>
            <p>{authCopy.panel.subline}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

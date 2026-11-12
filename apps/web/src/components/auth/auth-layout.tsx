import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { authCopy } from '../../lib/auth/copy.ts';
import { Logo } from '../ui/logo.tsx';

const POSTERS = [
  { file: 'onepiece', title: 'One Piece' },
  { file: 'naruto', title: 'Naruto' },
  { file: 'kimetsu', title: 'Kimetsu no Yaiba' },
  { file: 'jjk', title: 'Jujutsu Kaisen' },
] as const;

const OVERLAP_PX = 104;
const SCALES = [1, 0.94, 0.88, 0.82];

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
          <div className="relative flex h-85 items-end">
            {POSTERS.map(({ file, title }, index) => (
              <figure
                key={file}
                className="relative m-0 w-60 flex-none rounded-lg shadow-card"
                style={{
                  marginLeft: index === 0 ? 0 : -OVERLAP_PX,
                  zIndex: POSTERS.length - index,
                  transformOrigin: '0 100%',
                  transform: `scale(${SCALES[index]})`,
                }}
              >
                <img
                  src={`/auth/${file}.jpg`}
                  alt={title}
                  width={342}
                  height={513}
                  className="block aspect-5/7 w-full rounded-lg object-cover"
                />
              </figure>
            ))}
          </div>
          <div className="af-auth-copy">
            <h2>{authCopy.panel.headline}</h2>
            <p>{authCopy.panel.subline}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

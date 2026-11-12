import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { authCopy } from '../../lib/auth/copy.ts';
import { Logo } from '../ui/logo.tsx';

const POSTERS = [
  { file: 'onepiece', title: 'One Piece' },
  { file: 'naruto', title: 'Naruto' },
  { file: 'kimetsu', title: 'Kimetsu no Yaiba' },
  { file: 'jjk', title: 'Jujutsu Kaisen' },
  { file: 'deathnote', title: 'Death Note' },
  { file: 'fmab', title: 'Fullmetal Alchemist: Brotherhood' },
] as const;

const OVERLAP = 0.45;
const SCALES = [1, 1.06, 1.12, 1.18, 1.24, 1.3];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="af-auth min-h-screen">
      <div className="af-auth-top mx-auto w-full max-w-440 box-border">
        <Link
          to="/"
          aria-label={authCopy.brandHome}
          className="flex min-h-11 items-center"
        >
          <Logo />
        </Link>
      </div>
      <div className="af-auth-main mx-auto w-full max-w-440 box-border">
        <div className="af-auth-form">{children}</div>
        <aside
          className="af-auth-panel justify-center gap-[clamp(32px,3vw,56px)] p-[clamp(56px,4vw,96px)] [--cw:clamp(220px,15vw,290px)]"
          aria-label={authCopy.panel.label}
        >
          <div className="relative flex h-[calc(var(--cw)*1.4*1.3+8px)] items-end">
            {POSTERS.map(({ file, title }, index) => (
              <figure
                key={file}
                className="relative m-0 w-(--cw) flex-none rounded-lg shadow-card"
                style={{
                  marginLeft: index === 0 ? 0 : `calc(var(--cw) * -${OVERLAP})`,
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
            <h2 className="text-[clamp(48px,3.6vw,80px)]">
              {authCopy.panel.headline}
            </h2>
            <p className="text-[clamp(18px,1.3vw,26px)]">
              {authCopy.panel.subline}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

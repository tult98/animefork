import { Link } from '@tanstack/react-router';
import { NAV_ITEMS } from '../nav.ts';

export function TopBar() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4 md:px-8">
        <Link
          to="/"
          data-testid="brand"
          className="text-lg font-bold tracking-tight text-accent"
        >
          animefork
        </Link>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.id}
              to={item.to}
              data-testid={`nav:${item.id}`}
              activeOptions={{ exact: item.to === '/' }}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-ink-muted hover:text-ink aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:decoration-accent aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

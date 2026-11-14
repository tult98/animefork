import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { NAV_ITEMS } from '../nav.ts';
import { AccountMenu } from './account-menu.tsx';
import { SearchBox } from './search-box.tsx';
import {
  Header,
  HeaderActions,
  HeaderIconButton,
  HeaderNav,
  NAV_PILL_CLASS,
} from './ui/header.tsx';
import { Bell } from './ui/icons.ts';
import { Logo } from './ui/logo.tsx';

const SOLID_AFTER_PX = 8;

const ICON_BUTTON_CLASS =
  'grid size-11 place-items-center rounded-full hover:bg-pill-active disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent';

function useScrolledPast(px: number) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > px);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [px]);
  return scrolled;
}

export function TopBar() {
  const solid = useScrolledPast(SOLID_AFTER_PX);
  return (
    <Header
      solid={solid}
      data-testid="header"
      className="sticky top-0 z-40 bg-canvas bg-none px-(--pad) shadow-masthead max-md:gap-2"
      logo={
        <Link
          to="/"
          data-testid="brand"
          aria-label="AnimeFork, trang chủ"
          className="flex min-h-11 flex-none items-center"
        >
          <Logo className="h-7 w-auto max-w-none md:h-8" />
        </Link>
      }
    >
      <HeaderNav aria-label="Điều hướng chính" className="max-desk:hidden">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.id}
            to={item.to}
            data-testid={`nav:${item.id}`}
            activeOptions={{ exact: item.to === '/', includeSearch: false }}
            className={`${NAV_PILL_CLASS} inline-flex min-h-11 items-center`}
          >
            {item.label}
          </Link>
        ))}
      </HeaderNav>
      <HeaderActions className="max-desk:ml-auto gap-1">
        <SearchBox />
        <HeaderIconButton
          icon={Bell}
          label="Thông báo"
          disabled
          className={ICON_BUTTON_CLASS}
        />
        <AccountMenu buttonClassName={ICON_BUTTON_CLASS} />
      </HeaderActions>
    </Header>
  );
}

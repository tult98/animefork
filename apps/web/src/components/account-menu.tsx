import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { authCopy } from '../lib/auth/copy.ts';
import { useSession, useSessionActions } from '../lib/auth/session.ts';
import { nextMenuIndex, type MenuNavKey } from '../lib/ui/menu-nav.ts';
import { KIND_CLASS, TONE_CLASS } from './ui/button.tsx';
import { HeaderAvatarButton } from './ui/header.tsx';
import { LogOut } from './ui/icons.ts';

const NAV_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

const SIGN_IN_CLASS = `${KIND_CLASS.rect} ${TONE_CLASS.rect['utility-primary']} min-h-11`;

export function AccountMenu({ buttonClassName }: { buttonClassName: string }) {
  const session = useSession();
  if (session.state === 'loading') return null;
  if (session.state === 'signedOut') {
    return (
      <Link to="/sign-in" data-testid="sign-in-link" className={SIGN_IN_CLASS}>
        {authCopy.header.signIn}
      </Link>
    );
  }
  return (
    <ProfileMenu email={session.user.email} buttonClassName={buttonClassName} />
  );
}

function ProfileMenu({
  email,
  buttonClassName,
}: {
  email: string;
  buttonClassName: string;
}) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const { signOut } = useSessionActions();
  const navigate = useNavigate();

  const items = () =>
    Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ??
        [],
    );

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onMenuKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
    } else if (NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      const all = items();
      const index = all.findIndex((item) => item === document.activeElement);
      all[nextMenuIndex(index, all.length, event.key as MenuNavKey)]?.focus();
    }
  };

  const onSignOut = async () => {
    setOpen(false);
    await signOut();
    void navigate({ to: '/' });
  };

  return (
    <div ref={wrap} className="af-menu-wrap">
      <HeaderAvatarButton
        ref={trigger}
        label={authCopy.header.account}
        data-testid="account-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={buttonClassName}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      />
      {open ? (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={authCopy.header.menuLabel}
          onKeyDown={onMenuKey}
          className="af-menu af-menu--float"
        >
          <div className="af-menu-head" role="presentation">
            {authCopy.header.signedInAs(email)}
          </div>
          <button
            type="button"
            role="menuitem"
            className="af-menu-item"
            onClick={() => void onSignOut()}
          >
            <LogOut aria-hidden="true" />
            {authCopy.header.signOut}
          </button>
        </div>
      ) : null}
    </div>
  );
}

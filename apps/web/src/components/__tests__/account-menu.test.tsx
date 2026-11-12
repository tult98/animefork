// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, stubAuth, user } from '../../test/auth-stub.ts';
import { renderApp } from '../../test/render-app.tsx';

const signedIn = () => jsonResponse(200, { user });

describe('the header account slot', () => {
  it('renders nothing while the session loads, not a sign-in link', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    stubAuth({
      me: async () => {
        await gate;
        return jsonResponse(401, { error: 'unauthenticated' });
      },
    });
    await renderApp('/');
    await screen.findByTestId('header');
    expect(screen.queryByTestId('sign-in-link')).toBeNull();
    expect(screen.queryByTestId('account-button')).toBeNull();
    release();
    await screen.findByTestId('sign-in-link');
  });

  it('shows a sign-in link when signed out', async () => {
    stubAuth();
    await renderApp('/');
    const link = await screen.findByRole('link', { name: 'Đăng nhập' });
    expect(link).toHaveProperty('pathname', '/sign-in');
    expect(screen.queryByTestId('account-button')).toBeNull();
  });

  it('falls back to the sign-in link when the API is not configured', async () => {
    await renderApp('/');
    await screen.findByTestId('header');
    await screen.findByTestId('sign-in-link');
  });

  it('opens the profile menu with the email and closes it on Escape', async () => {
    stubAuth({ me: signedIn });
    await renderApp('/');
    const button = await screen.findByTestId('account-button');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();

    await userEvent.click(button);
    const menu = screen.getByRole('menu');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(menu.textContent).toContain('Đăng nhập với mai@example.com');
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Đăng xuất' }),
    );

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('closes on a click outside', async () => {
    stubAuth({ me: signedIn });
    await renderApp('/');
    await userEvent.click(await screen.findByTestId('account-button'));
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens with ArrowDown and keeps focus on the item as the arrows wrap', async () => {
    stubAuth({ me: signedIn });
    await renderApp('/');
    const button = await screen.findByTestId('account-button');
    button.focus();
    await userEvent.keyboard('{ArrowDown}');
    const item = screen.getByRole('menuitem', { name: 'Đăng xuất' });
    expect(document.activeElement).toBe(item);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item);
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(item);
  });

  it('signs out, closes the menu and returns home', async () => {
    const stub = stubAuth({
      me: signedIn,
      signOut: () => new Response(null, { status: 204 }),
    });
    const { router } = await renderApp('/rankings');
    await userEvent.click(await screen.findByTestId('account-button'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
    await screen.findByTestId('sign-in-link');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(stub.to('signOut')).toHaveLength(1);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('keeps the header on the other pages after sign-in', async () => {
    stubAuth({ me: signedIn });
    await renderApp('/browse');
    expect(await screen.findByTestId('account-button')).toBeTruthy();
  });
});

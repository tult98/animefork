// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API,
  ME,
  mockUser,
  SIGN_OUT,
  unauthenticated,
} from '../../lib/auth/__mockData__/index.ts';
import { render, screen, waitFor } from '../../test/test-utils.tsx';
import { AccountMenu } from '../account-menu.tsx';

beforeEach(() => void vi.stubEnv('VITE_API_URL', API));

const menu = (path?: string) =>
  render(<AccountMenu buttonClassName="" />, { path: path ?? '/' });

describe('the account menu', () => {
  it('shows nothing while the session loads, then a sign-in link when signed out', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    fetchMock.get(ME, () => gate.then(() => unauthenticated));
    menu();
    await waitFor(() => expect(fetchMock).toHaveFetched(ME));
    expect(screen.queryByTestId('sign-in-link')).toBeNull();
    expect(screen.queryByTestId('account-button')).toBeNull();

    release();
    const link = await screen.findByRole('link', { name: 'Đăng nhập' });
    expect(link).toHaveProperty('pathname', '/sign-in');
  });

  it('opens the profile menu with the email and closes it on Escape', async () => {
    fetchMock.get(ME, { user: mockUser });
    menu();
    const button = await screen.findByTestId('account-button');
    expect(screen.queryByRole('menu')).toBeNull();

    await userEvent.click(button);
    expect(screen.getByRole('menu').textContent).toContain(
      'Đăng nhập với mai@example.com',
    );
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Đăng xuất' }),
    );

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('signs out, closes the menu, shows the sign-in link and goes home', async () => {
    fetchMock.get(ME, { user: mockUser }).post(SIGN_OUT, 204);
    const { router } = menu('/rankings');
    await userEvent.click(await screen.findByTestId('account-button'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

    await screen.findByTestId('sign-in-link');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(fetchMock).toHavePosted(SIGN_OUT);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('keeps the visitor signed in when sign-out fails, as the server says', async () => {
    fetchMock.get(ME, { user: mockUser }).post(SIGN_OUT, 500);
    menu();
    await userEvent.click(await screen.findByTestId('account-button'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

    await waitFor(() => expect(fetchMock).toHaveFetchedTimes(2, ME));
    expect(await screen.findByTestId('account-button')).toBeTruthy();
    expect(screen.queryByTestId('sign-in-link')).toBeNull();
  });
});

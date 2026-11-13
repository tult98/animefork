// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils.tsx';
import { AccountMenu } from '../account-menu.tsx';

beforeEach(() => void vi.stubEnv('VITE_API_URL', 'https://api.test'));

describe('the account menu', () => {
  it('shows a sign-in link when signed out', async () => {
    fetchMock.get('path:/v1/auth/me', 401);
    render(<AccountMenu buttonClassName="" />, { path: '/' });

    const link = await screen.findByRole('link', { name: 'Đăng nhập' });
    expect(link).toHaveProperty('pathname', '/sign-in');
    expect(fetchMock).toHaveFetched('path:/v1/auth/me');
    expect(screen.queryByTestId('account-button')).toBeNull();
  });

  it('opens the profile menu with the email and closes it on Escape', async () => {
    fetchMock.get('path:/v1/auth/me', {
      user: { id: 'u1', email: 'mai@example.com' },
    });
    render(<AccountMenu buttonClassName="" />, { path: '/' });
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
    fetchMock
      .get('path:/v1/auth/me', { user: { id: 'u1', email: 'mai@example.com' } })
      .post('path:/v1/auth/sign-out', 204);
    const { router } = render(<AccountMenu buttonClassName="" />, {
      path: '/rankings',
    });
    await userEvent.click(await screen.findByTestId('account-button'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

    await screen.findByTestId('sign-in-link');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(fetchMock).toHavePosted('path:/v1/auth/sign-out');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('keeps the visitor signed in when sign-out fails, as the server says', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user: { id: 'u1', email: 'mai@example.com' } })
      .post('path:/v1/auth/sign-out', 500);
    render(<AccountMenu buttonClassName="" />, { path: '/' });
    await userEvent.click(await screen.findByTestId('account-button'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

    await waitFor(() =>
      expect(fetchMock).toHaveFetchedTimes(2, 'path:/v1/auth/me'),
    );
    expect(await screen.findByTestId('account-button')).toBeTruthy();
    expect(screen.queryByTestId('sign-in-link')).toBeNull();
  });
});

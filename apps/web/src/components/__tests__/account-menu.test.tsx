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
    await expect(fetchMock).toBeFetched('path:/v1/auth/me');

    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveProperty(
      'pathname',
      '/sign-in',
    );
    expect(screen.queryByTestId('account-button')).toBeNull();
  });

  it('opens the profile menu with the email and closes it on Escape', async () => {
    fetchMock.get('path:/v1/auth/me', {
      user: { id: 'u1', email: 'mai@example.com' },
    });
    render(<AccountMenu buttonClassName="" />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/v1/auth/me');
    const button = screen.getByTestId('account-button');
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
    await expect(fetchMock).toBeFetched('path:/v1/auth/me');
    await userEvent.click(screen.getByTestId('account-button'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
    await expect(fetchMock).toBeFetched('path:/v1/auth/sign-out');

    expect(screen.getByTestId('sign-in-link')).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('keeps the visitor signed in when sign-out fails, as the server says', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user: { id: 'u1', email: 'mai@example.com' } })
      .post('path:/v1/auth/sign-out', 500);
    render(<AccountMenu buttonClassName="" />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/v1/auth/me');
    await userEvent.click(screen.getByTestId('account-button'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
    await expect(fetchMock).toBeFetched('path:/v1/auth/sign-out');

    await waitFor(() =>
      expect(fetchMock).toHaveFetchedTimes(2, 'path:/v1/auth/me'),
    );
    expect(screen.getByTestId('account-button')).toBeTruthy();
    expect(screen.queryByTestId('sign-in-link')).toBeNull();
  });
});

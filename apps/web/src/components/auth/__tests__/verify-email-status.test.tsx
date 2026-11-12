// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../../test/test-utils.tsx';
import { VerifyEmailStatus } from '../verify-email-status.tsx';

beforeEach(() => void vi.stubEnv('VITE_API_URL', 'https://api.test'));
afterEach(() => window.history.replaceState(null, '', '/'));

// The component reads the token from the fragment of the emailed link in the address bar.
describe('the email verification status', () => {
  it('shows progress, then success with a sign-in link, and removes the token from the address bar', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    fetchMock.post('path:/v1/auth/verify-email', () =>
      gate.then(() => ({ ok: true })),
    );
    window.history.replaceState(null, '', '/verify-email#token=abc123');
    render(<VerifyEmailStatus />, { path: '/verify-email' });
    expect((await screen.findByRole('status')).textContent).toContain(
      'Đang xác nhận',
    );

    release();
    await screen.findByRole('heading', { name: 'Email đã được xác nhận' });
    expect(fetchMock).toHavePosted('path:/v1/auth/verify-email', {
      body: { token: 'abc123' },
    });
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveProperty(
      'pathname',
      '/sign-in',
    );
    expect(window.location.hash).toBe('');
  });

  it('shows the failed state with a link to sign up for an invalid token', async () => {
    fetchMock.post('path:/v1/auth/verify-email', {
      status: 400,
      body: { error: 'invalid_token' },
    });
    window.history.replaceState(null, '', '/verify-email#token=stale');
    render(<VerifyEmailStatus />, { path: '/verify-email' });

    await screen.findByRole('heading', { name: 'Liên kết không dùng được' });
    expect(screen.getByRole('alert').textContent).toContain('hết hạn');
    expect(screen.getByRole('link', { name: 'Đăng ký lại' })).toHaveProperty(
      'pathname',
      '/sign-up',
    );
  });

  it('fails without a request when the link has no token', async () => {
    window.history.replaceState(null, '', '/verify-email');
    render(<VerifyEmailStatus />, { path: '/verify-email' });

    await screen.findByRole('heading', { name: 'Liên kết không dùng được' });
    expect(fetchMock).not.toHaveFetched('path:/v1/auth/verify-email');
  });

  it('asks the visitor to retry when the API cannot be reached', async () => {
    fetchMock.post('path:/v1/auth/verify-email', {
      throws: new TypeError('Failed to fetch'),
    });
    window.history.replaceState(null, '', '/verify-email#token=abc123');
    render(<VerifyEmailStatus />, { path: '/verify-email' });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Không thể xác nhận',
    );
  });

  it('posts the token once under StrictMode and still succeeds', async () => {
    fetchMock.post('path:/v1/auth/verify-email', { ok: true });
    window.history.replaceState(null, '', '/verify-email#token=abc123');
    render(<VerifyEmailStatus />, { path: '/verify-email', strict: true });

    await screen.findByRole('heading', { name: 'Email đã được xác nhận' });
    expect(fetchMock).toHavePostedTimes(1, 'path:/v1/auth/verify-email');
  });
});

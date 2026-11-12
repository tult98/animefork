// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API, VERIFY_EMAIL } from '../../../lib/auth/__mockData__/index.ts';
import { render, screen } from '../../../test/test-utils.tsx';
import { VerifyEmailStatus } from '../verify-email-status.tsx';

beforeEach(() => void vi.stubEnv('VITE_API_URL', API));
afterEach(() => window.history.replaceState(null, '', '/'));

// The component reads the token from the address bar fragment of the emailed link.
const open = (hash: string, strict = false) => {
  window.history.replaceState(null, '', `/verify-email${hash}`);
  return render(<VerifyEmailStatus />, { path: '/verify-email', strict });
};

describe('the email verification status', () => {
  it('shows progress, then success with a sign-in link, and removes the token from the address bar', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    fetchMock.post(VERIFY_EMAIL, () => gate.then(() => ({ ok: true })));
    open('#token=abc123');
    expect((await screen.findByRole('status')).textContent).toContain(
      'Đang xác nhận',
    );

    release();
    await screen.findByRole('heading', { name: 'Email đã được xác nhận' });
    expect(fetchMock).toHavePosted(VERIFY_EMAIL, { body: { token: 'abc123' } });
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveProperty(
      'pathname',
      '/sign-in',
    );
    expect(window.location.hash).toBe('');
  });

  it('shows the failed state with a link to sign up for an invalid token', async () => {
    fetchMock.post(VERIFY_EMAIL, {
      status: 400,
      body: { error: 'invalid_token' },
    });
    open('#token=stale');

    await screen.findByRole('heading', { name: 'Liên kết không dùng được' });
    expect(screen.getByRole('alert').textContent).toContain('hết hạn');
    expect(screen.getByRole('link', { name: 'Đăng ký lại' })).toHaveProperty(
      'pathname',
      '/sign-up',
    );
  });

  it('fails without a request when the link has no token', async () => {
    open('');

    await screen.findByRole('heading', { name: 'Liên kết không dùng được' });
    expect(fetchMock).not.toHaveFetched(VERIFY_EMAIL);
  });

  it('asks the visitor to retry when the API cannot be reached', async () => {
    fetchMock.post(VERIFY_EMAIL, { throws: new TypeError('Failed to fetch') });
    open('#token=abc123');

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Không thể xác nhận',
    );
  });

  it('posts the token once under StrictMode and still succeeds', async () => {
    fetchMock.post(VERIFY_EMAIL, { ok: true });
    open('#token=abc123', true);

    await screen.findByRole('heading', { name: 'Email đã được xác nhận' });
    expect(fetchMock).toHavePostedTimes(1, VERIFY_EMAIL);
  });
});

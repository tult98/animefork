// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API, SIGN_UP } from '../../../lib/auth/__mockData__/index.ts';
import { render, screen } from '../../../test/test-utils.tsx';
import { SignUpForm } from '../sign-up-form.tsx';

beforeEach(() => void vi.stubEnv('VITE_API_URL', API));

const passwordField = () => screen.getByLabelText('Mật khẩu mới');

const click = (name: string) =>
  userEvent.click(screen.getByRole('button', { name }));

async function signUp(email = 'Mai@Example.com', password = 'correct horse') {
  render(<SignUpForm />, { path: '/sign-up' });
  await screen.findByRole('heading', { name: 'Tạo tài khoản' });
  await userEvent.type(screen.getByLabelText('Địa chỉ email'), email);
  await userEvent.type(passwordField(), password);
  await click('Tạo tài khoản');
}

describe('the sign-up form', () => {
  it('asks the visitor to check their email, then resends by signing up again', async () => {
    fetchMock.post(SIGN_UP, { status: 202, body: { ok: true } });
    await signUp();

    const title = await screen.findByRole('heading', {
      name: 'Kiểm tra email của bạn',
    });
    expect(title.parentElement?.textContent).toContain('mai@example.com');
    expect(screen.queryByLabelText('Mật khẩu mới')).toBeNull();
    expect(fetchMock).toHavePosted(SIGN_UP, {
      body: { email: 'mai@example.com', password: 'correct horse' },
    });

    await click('Gửi lại email');
    expect((await screen.findByRole('status')).textContent).toContain(
      'liên kết mới',
    );
    expect(fetchMock).toHavePostedTimes(2, SIGN_UP);
  });

  it('shows the failure, not a success, when a resend is rate limited', async () => {
    fetchMock
      .post(SIGN_UP, { status: 202, body: { ok: true } }, { repeat: 1 })
      .post(SIGN_UP, { status: 429, body: { error: 'rate_limited' } });
    await signUp();
    await screen.findByRole('heading', { name: 'Kiểm tra email của bạn' });
    await click('Gửi lại email');

    expect((await screen.findByRole('alert')).textContent).toContain(
      'quá nhiều',
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('tells the visitor the email already has an account and keeps the form', async () => {
    fetchMock.post(SIGN_UP, { status: 409, body: { error: 'email_taken' } });
    await signUp();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'đã có tài khoản',
    );
    expect(passwordField()).toBeTruthy();
  });

  it('flags a short password on the field without sending anything', async () => {
    await signUp('mai@example.com', 'short');

    await screen.findByText('Mật khẩu cần có ít nhất 8 ký tự.');
    expect(fetchMock).not.toHaveFetched(SIGN_UP);
  });
});

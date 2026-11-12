// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../../test/test-utils.tsx';
import { SignUpForm } from '../sign-up-form.tsx';

beforeEach(() => void vi.stubEnv('VITE_API_URL', 'https://api.test'));

describe('the sign-up form', () => {
  it('asks the visitor to check their email, then resends by signing up again', async () => {
    fetchMock.post('path:/v1/auth/sign-up', {
      status: 202,
      body: { ok: true },
    });
    render(<SignUpForm />, { path: '/sign-up' });
    await userEvent.type(
      await screen.findByLabelText('Địa chỉ email'),
      'Mai@Example.com',
    );
    await userEvent.type(
      screen.getByLabelText('Mật khẩu mới'),
      'correct horse',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Tạo tài khoản' }),
    );

    const title = await screen.findByRole('heading', {
      name: 'Kiểm tra email của bạn',
    });
    expect(title.parentElement?.textContent).toContain('mai@example.com');
    expect(screen.queryByLabelText('Mật khẩu mới')).toBeNull();
    expect(fetchMock).toHavePosted('path:/v1/auth/sign-up', {
      body: { email: 'mai@example.com', password: 'correct horse' },
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Gửi lại email' }),
    );
    expect((await screen.findByRole('status')).textContent).toContain(
      'liên kết mới',
    );
    expect(fetchMock).toHavePostedTimes(2, 'path:/v1/auth/sign-up');
  });

  it('shows the failure, not a success, when a resend is rate limited', async () => {
    fetchMock
      .post(
        'path:/v1/auth/sign-up',
        { status: 202, body: { ok: true } },
        { repeat: 1 },
      )
      .post('path:/v1/auth/sign-up', {
        status: 429,
        body: { error: 'rate_limited' },
      });
    render(<SignUpForm />, { path: '/sign-up' });
    await userEvent.type(
      await screen.findByLabelText('Địa chỉ email'),
      'mai@example.com',
    );
    await userEvent.type(
      screen.getByLabelText('Mật khẩu mới'),
      'correct horse',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Tạo tài khoản' }),
    );
    await screen.findByRole('heading', { name: 'Kiểm tra email của bạn' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Gửi lại email' }),
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'quá nhiều',
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('tells the visitor the email already has an account and keeps the form', async () => {
    fetchMock.post('path:/v1/auth/sign-up', {
      status: 409,
      body: { error: 'email_taken' },
    });
    render(<SignUpForm />, { path: '/sign-up' });
    await userEvent.type(
      await screen.findByLabelText('Địa chỉ email'),
      'mai@example.com',
    );
    await userEvent.type(
      screen.getByLabelText('Mật khẩu mới'),
      'correct horse',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Tạo tài khoản' }),
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'đã có tài khoản',
    );
    expect(screen.getByLabelText('Mật khẩu mới')).toBeTruthy();
  });

  it('flags a short password on the field without sending anything', async () => {
    render(<SignUpForm />, { path: '/sign-up' });
    await userEvent.type(
      await screen.findByLabelText('Địa chỉ email'),
      'mai@example.com',
    );
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'short');
    await userEvent.click(
      screen.getByRole('button', { name: 'Tạo tài khoản' }),
    );

    await screen.findByText('Mật khẩu cần có ít nhất 8 ký tự.');
    expect(fetchMock).not.toHaveFetched('path:/v1/auth/sign-up');
  });
});

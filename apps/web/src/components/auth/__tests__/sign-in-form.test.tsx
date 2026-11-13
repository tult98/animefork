// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../../test/test-utils.tsx';
import { AccountMenu } from '../../account-menu.tsx';
import { SignInForm } from '../sign-in-form.tsx';

beforeEach(() => void vi.stubEnv('VITE_API_URL', 'https://api.test'));

describe('the sign-in form', () => {
  it('signs the visitor in with a trimmed lowercase email and shows the account menu', async () => {
    fetchMock.get('path:/v1/auth/me', 401).post('path:/v1/auth/sign-in', {
      user: { id: 'u1', email: 'mai@example.com' },
    });
    render(
      <>
        <SignInForm />
        <AccountMenu buttonClassName="" />
      </>,
      { path: '/sign-in' },
    );
    await expect(fetchMock).toBeFetched('path:/v1/auth/me');
    await userEvent.type(
      screen.getByLabelText('Địa chỉ email'),
      '  Mai@Example.com ',
    );
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await expect(fetchMock).toBeFetched('path:/v1/auth/sign-in');

    expect(fetchMock).toHavePosted('path:/v1/auth/sign-in', {
      body: { email: 'mai@example.com', password: 'correct horse' },
    });
    expect(screen.getByTestId('account-button')).toBeTruthy();
  });

  it('shows an alert and marks both fields when the credentials do not match', async () => {
    fetchMock.post('path:/v1/auth/sign-in', {
      status: 401,
      body: { error: 'invalid_credentials' },
    });
    render(<SignInForm />, { path: '/sign-in' });
    await userEvent.type(
      await screen.findByLabelText('Địa chỉ email'),
      'mai@example.com',
    );
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'wrong password');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await expect(fetchMock).toBeFetched('path:/v1/auth/sign-in');

    expect(screen.getByRole('alert').textContent).toContain(
      'Email hoặc mật khẩu không đúng',
    );
    expect(
      screen.getByLabelText('Địa chỉ email').getAttribute('aria-invalid'),
    ).toBe('true');
    expect(screen.getByLabelText('Mật khẩu').getAttribute('aria-invalid')).toBe(
      'true',
    );
  });

  it('tells a rate-limited visitor how many minutes to wait', async () => {
    fetchMock.post('path:/v1/auth/sign-in', {
      status: 429,
      body: { error: 'rate_limited' },
      headers: { 'retry-after': '600' },
    });
    render(<SignInForm />, { path: '/sign-in' });
    await userEvent.type(
      await screen.findByLabelText('Địa chỉ email'),
      'mai@example.com',
    );
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await expect(fetchMock).toBeFetched('path:/v1/auth/sign-in');

    expect(screen.getByRole('alert').textContent).toContain('10 phút');
  });

  it('asks the visitor to retry when the API cannot be reached', async () => {
    fetchMock.post('path:/v1/auth/sign-in', {
      throws: new TypeError('Failed to fetch'),
    });
    render(<SignInForm />, { path: '/sign-in' });
    await userEvent.type(
      await screen.findByLabelText('Địa chỉ email'),
      'mai@example.com',
    );
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await expect(fetchMock).toBeFetched('path:/v1/auth/sign-in');

    expect(screen.getByRole('alert').textContent).toContain('Hãy thử lại');
  });

  it('flags an invalid email or a short password without sending anything', async () => {
    render(<SignInForm />, { path: '/sign-in' });
    await userEvent.type(
      await screen.findByLabelText('Địa chỉ email'),
      'not-an-email',
    );
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(screen.getByText('Nhập một địa chỉ email hợp lệ.')).toBeTruthy();

    await userEvent.clear(screen.getByLabelText('Địa chỉ email'));
    await userEvent.clear(screen.getByLabelText('Mật khẩu'));
    await userEvent.type(
      screen.getByLabelText('Địa chỉ email'),
      'mai@example.com',
    );
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(fetchMock).not.toHaveFetched('path:/v1/auth/sign-in');
  });

  it('disables the button while sending and sends once on a double submit', async () => {
    fetchMock.post(
      'path:/v1/auth/sign-in',
      { user: { id: 'u1', email: 'mai@example.com' } },
      { delay: 200 },
    );
    render(<SignInForm />, { path: '/sign-in' });
    await userEvent.type(
      await screen.findByLabelText('Địa chỉ email'),
      'mai@example.com',
    );
    await userEvent.type(
      screen.getByLabelText('Mật khẩu'),
      'correct horse{Enter}{Enter}',
    );

    expect(
      screen
        .getByRole('button', { name: 'Đang đăng nhập...' })
        .hasAttribute('disabled'),
    ).toBe(true);
    await expect(fetchMock).toBeFetched('path:/v1/auth/sign-in');
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeTruthy();
    expect(fetchMock).toHavePostedTimes(1, 'path:/v1/auth/sign-in');
  });
});

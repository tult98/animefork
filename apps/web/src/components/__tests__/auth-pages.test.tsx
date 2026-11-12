// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { jsonResponse, stubAuth, user } from '../../test/auth-stub.ts';
import { renderApp } from '../../test/render-app.tsx';

afterEach(() => window.history.replaceState(null, '', '/'));

const emailField = () => screen.getByLabelText('Địa chỉ email');
const passwordField = (label = 'Mật khẩu') => screen.getByLabelText(label);

async function fill(email: string, password: string, passwordLabel?: string) {
  await userEvent.type(emailField(), email);
  await userEvent.type(passwordField(passwordLabel), password);
}

const submit = (name: string) =>
  userEvent.click(screen.getByRole('button', { name }));

describe('sign in', () => {
  it('renders without the site header and footer', async () => {
    stubAuth();
    await renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    expect(screen.queryByTestId('header')).toBeNull();
    expect(screen.queryByTestId('footer')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'AnimeFork, trang chủ' }),
    ).toHaveProperty('pathname', '/');
  });

  it('uses the autocomplete values browsers key password managers on', async () => {
    stubAuth();
    await renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    expect(emailField().getAttribute('autocomplete')).toBe('email');
    expect(passwordField().getAttribute('autocomplete')).toBe(
      'current-password',
    );
  });

  it('toggles the password with a pressed button', async () => {
    stubAuth();
    await renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    const toggle = screen.getByRole('button', { name: 'Hiện' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(passwordField().getAttribute('type')).toBe('password');
    await userEvent.click(toggle);
    expect(
      screen.getByRole('button', { name: 'Ẩn' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(passwordField().getAttribute('type')).toBe('text');
  });

  it('signs in, updates the session and goes home', async () => {
    const stub = stubAuth({ signIn: () => jsonResponse(200, { user }) });
    const { router } = await renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    await fill('  Mai@Example.com ', 'correct horse');
    await submit('Đăng nhập');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(stub.to('signIn')[0]?.body).toEqual({
      email: 'mai@example.com',
      password: 'correct horse',
    });
    await screen.findByTestId('header');
    await screen.findByRole('button', { name: 'Tài khoản' });
  });

  it('sends values a password manager wrote straight into the fields', async () => {
    const stub = stubAuth({ signIn: () => jsonResponse(200, { user }) });
    await renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    (emailField() as HTMLInputElement).value = 'mai@example.com';
    (passwordField() as HTMLInputElement).value = 'correct horse';
    await submit('Đăng nhập');
    await waitFor(() => expect(stub.to('signIn')).toHaveLength(1));
    expect(stub.to('signIn')[0]?.body).toEqual({
      email: 'mai@example.com',
      password: 'correct horse',
    });
  });

  it('keeps what was typed after a failed attempt', async () => {
    stubAuth({
      signIn: () => jsonResponse(401, { error: 'invalid_credentials' }),
    });
    await renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    await fill('mai@example.com', 'wrong horse');
    await submit('Đăng nhập');
    await screen.findByRole('alert');
    expect((emailField() as HTMLInputElement).value).toBe('mai@example.com');
    expect((passwordField() as HTMLInputElement).value).toBe('wrong horse');
  });

  it('shows the alert and marks both fields when the credentials do not match', async () => {
    stubAuth({
      signIn: () => jsonResponse(401, { error: 'invalid_credentials' }),
    });
    const { router } = await renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    await fill('mai@example.com', 'wrong password');
    await submit('Đăng nhập');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Email hoặc mật khẩu không đúng');
    for (const field of [emailField(), passwordField()]) {
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(field.closest('.af-field')?.classList).toContain(
        'af-field--error',
      );
    }
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('does not send a password the API would reject', async () => {
    const stub = stubAuth();
    await renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    await fill('mai@example.com', 'short');
    await submit('Đăng nhập');
    await screen.findByRole('alert');
    expect(stub.to('signIn')).toHaveLength(0);
  });

  it('flags an invalid email on the field without a request', async () => {
    const stub = stubAuth();
    await renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    await fill('not-an-email', 'correct horse');
    await submit('Đăng nhập');
    await screen.findByText('Nhập một địa chỉ email hợp lệ.');
    expect(emailField().getAttribute('aria-invalid')).toBe('true');
    expect(stub.to('signIn')).toHaveLength(0);
  });

  it('tells a rate-limited visitor to wait and for how many minutes', async () => {
    stubAuth({
      signIn: () =>
        jsonResponse(429, { error: 'rate_limited' }, { 'retry-after': '600' }),
    });
    await renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    await fill('mai@example.com', 'correct horse');
    await submit('Đăng nhập');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('10 phút');
  });

  it('shows a generic message when the API is unreachable', async () => {
    stubAuth({
      signIn: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    await renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    await fill('mai@example.com', 'correct horse');
    await submit('Đăng nhập');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Hãy thử lại',
    );
  });

  it('disables the button while sending and sends once on a double submit', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const stub = stubAuth({
      signIn: async () => {
        await gate;
        return jsonResponse(200, { user });
      },
    });
    await renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    await fill('mai@example.com', 'correct horse');
    await userEvent.type(passwordField(), '{Enter}{Enter}');
    const button = await screen.findByRole('button', {
      name: 'Đang đăng nhập...',
    });
    expect(button.hasAttribute('disabled')).toBe(true);
    await userEvent.click(button);
    release();
    await waitFor(() => expect(stub.to('signIn')).toHaveLength(1));
  });

  it('sends a signed-in visitor home', async () => {
    stubAuth({ me: () => jsonResponse(200, { user }) });
    const { router } = await renderApp('/sign-in');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('links to sign up', async () => {
    stubAuth();
    await renderApp('/sign-in');
    await userEvent.click(
      await screen.findByRole('link', { name: 'Đăng ký ngay' }),
    );
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
  });
});

describe('sign up', () => {
  it('asks for a new password with a hint and the right autocomplete', async () => {
    stubAuth();
    await renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    const field = passwordField('Mật khẩu mới');
    expect(field.getAttribute('autocomplete')).toBe('new-password');
    const hint = document.getElementById(
      field.getAttribute('aria-describedby') ?? '',
    );
    expect(hint?.textContent).toBe('Dùng ít nhất 8 ký tự.');
  });

  it('replaces the form with the check-your-email message naming the address', async () => {
    const stub = stubAuth({ signUp: () => jsonResponse(202, { ok: true }) });
    await renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    await fill('Mai@Example.com', 'correct horse', 'Mật khẩu mới');
    await submit('Tạo tài khoản');
    const title = await screen.findByRole('heading', {
      name: 'Kiểm tra email của bạn',
    });
    expect(title.parentElement?.textContent).toContain('mai@example.com');
    expect(screen.queryByLabelText('Mật khẩu mới')).toBeNull();
    expect(screen.getByText(/đăng ký lại/)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Về trang đăng nhập' }),
    ).toHaveProperty('pathname', '/sign-in');
    expect(stub.to('signUp')[0]?.body).toEqual({
      email: 'mai@example.com',
      password: 'correct horse',
    });
  });

  it('flags a short password on the field without a request', async () => {
    const stub = stubAuth();
    await renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    await fill('mai@example.com', 'short', 'Mật khẩu mới');
    await submit('Tạo tài khoản');
    await screen.findByText('Mật khẩu cần có ít nhất 8 ký tự.');
    expect(stub.to('signUp')).toHaveLength(0);
  });

  it('shows the rate limit and keeps the form', async () => {
    stubAuth({
      signUp: () =>
        jsonResponse(429, { error: 'rate_limited' }, { 'retry-after': '3600' }),
    });
    await renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    await fill('mai@example.com', 'correct horse', 'Mật khẩu mới');
    await submit('Tạo tài khoản');
    expect((await screen.findByRole('alert')).textContent).toContain('60 phút');
    expect(screen.getByLabelText('Mật khẩu mới')).toBeTruthy();
  });

  it('shows a generic message on a server error', async () => {
    stubAuth({ signUp: () => jsonResponse(500, {}) });
    await renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Tạo tài khoản' });
    await fill('mai@example.com', 'correct horse', 'Mật khẩu mới');
    await submit('Tạo tài khoản');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Hãy thử lại',
    );
  });

  it('sends a signed-in visitor home', async () => {
    stubAuth({ me: () => jsonResponse(200, { user }) });
    const { router } = await renderApp('/sign-up');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

describe('verify email', () => {
  const open = (hash: string, strict = false) => {
    window.history.replaceState(null, '', `/verify-email${hash}`);
    return renderApp('/verify-email', { strict });
  };

  it('shows progress, then success with a sign-in link, for the token in the fragment', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const stub = stubAuth({
      verifyEmail: async () => {
        await gate;
        return jsonResponse(200, { ok: true });
      },
    });
    await open('#token=abc123');
    expect((await screen.findByRole('status')).textContent).toContain(
      'Đang xác nhận',
    );
    release();
    await screen.findByRole('heading', { name: 'Email đã được xác nhận' });
    expect(stub.to('verifyEmail')).toHaveLength(1);
    expect(stub.to('verifyEmail')[0]?.body).toEqual({ token: 'abc123' });
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveProperty(
      'pathname',
      '/sign-in',
    );
  });

  it('removes the token from the address bar', async () => {
    stubAuth({ verifyEmail: () => jsonResponse(200, { ok: true }) });
    await open('#token=abc123');
    await screen.findByRole('heading', { name: 'Email đã được xác nhận' });
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/verify-email');
  });

  it('shows the failed state with a link to sign up for an invalid token', async () => {
    stubAuth({
      verifyEmail: () => jsonResponse(400, { error: 'invalid_token' }),
    });
    await open('#token=stale');
    await screen.findByRole('heading', { name: 'Liên kết không dùng được' });
    expect(screen.getByRole('alert').textContent).toContain('hết hạn');
    expect(screen.getByRole('link', { name: 'Đăng ký lại' })).toHaveProperty(
      'pathname',
      '/sign-up',
    );
  });

  it('fails without a request when the link has no token', async () => {
    const stub = stubAuth();
    await open('');
    await screen.findByRole('heading', { name: 'Liên kết không dùng được' });
    expect(stub.to('verifyEmail')).toHaveLength(0);
  });

  it('posts the token once under StrictMode and still succeeds', async () => {
    const stub = stubAuth({
      verifyEmail: () => jsonResponse(200, { ok: true }),
    });
    await open('#token=abc123', true);
    await screen.findByRole('heading', { name: 'Email đã được xác nhận' });
    expect(stub.to('verifyEmail')).toHaveLength(1);
  });

  it('asks the visitor to retry when the API cannot be reached', async () => {
    stubAuth({
      verifyEmail: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    await open('#token=abc123');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không thể xác nhận');
  });

  it('does not redirect a signed-in visitor away', async () => {
    stubAuth({
      me: () => jsonResponse(200, { user }),
      verifyEmail: () => jsonResponse(200, { ok: true }),
    });
    const { router } = await open('#token=abc123');
    await screen.findByRole('heading', { name: 'Email đã được xác nhận' });
    expect(router.state.location.pathname).toBe('/verify-email');
    expect(within(document.body).queryByTestId('header')).toBeNull();
  });
});

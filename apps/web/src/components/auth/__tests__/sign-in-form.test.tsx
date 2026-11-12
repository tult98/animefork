// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API,
  ME,
  mockUser,
  SIGN_IN,
  unauthenticated,
} from '../../../lib/auth/__mockData__/index.ts';
import { render, screen, waitFor } from '../../../test/test-utils.tsx';
import { AccountMenu } from '../../account-menu.tsx';
import { SignInForm } from '../sign-in-form.tsx';

beforeEach(() => void vi.stubEnv('VITE_API_URL', API));

const emailField = () => screen.getByLabelText('Địa chỉ email');
const passwordField = () => screen.getByLabelText('Mật khẩu');

async function fill(email: string, password: string) {
  await userEvent.type(emailField(), email);
  await userEvent.type(passwordField(), password);
}

const submit = () =>
  userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

const form = () => render(<SignInForm />, { path: '/sign-in' });

describe('the sign-in form', () => {
  it('signs the visitor in with a trimmed lowercase email and shows the account menu', async () => {
    fetchMock.get(ME, unauthenticated).post(SIGN_IN, { user: mockUser });
    render(
      <>
        <SignInForm />
        <AccountMenu buttonClassName="" />
      </>,
      { path: '/sign-in' },
    );
    await screen.findByRole('link', { name: 'Đăng nhập' });
    await fill('  Mai@Example.com ', 'correct horse');
    await submit();

    await screen.findByTestId('account-button');
    expect(fetchMock).toHavePosted(SIGN_IN, {
      body: { email: 'mai@example.com', password: 'correct horse' },
    });
  });

  it('shows an alert and marks both fields when the credentials do not match', async () => {
    fetchMock.post(SIGN_IN, {
      status: 401,
      body: { error: 'invalid_credentials' },
    });
    form();
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    await fill('mai@example.com', 'wrong password');
    await submit();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Email hoặc mật khẩu không đúng',
    );
    expect(emailField().getAttribute('aria-invalid')).toBe('true');
    expect(passwordField().getAttribute('aria-invalid')).toBe('true');
  });

  it.each([
    [
      'tells a rate-limited visitor how many minutes to wait',
      {
        status: 429,
        body: { error: 'rate_limited' },
        headers: { 'retry-after': '600' },
      },
      '10 phút',
    ],
    [
      'asks the visitor to retry when the API cannot be reached',
      { throws: new TypeError('Failed to fetch') },
      'Hãy thử lại',
    ],
  ])('%s', async (_name, response, message) => {
    fetchMock.post(SIGN_IN, response);
    form();
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    await fill('mai@example.com', 'correct horse');
    await submit();

    expect((await screen.findByRole('alert')).textContent).toContain(message);
  });

  it('flags an invalid email or a short password without sending anything', async () => {
    form();
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    await fill('not-an-email', 'correct horse');
    await submit();
    await screen.findByText('Nhập một địa chỉ email hợp lệ.');

    await userEvent.clear(emailField());
    await userEvent.clear(passwordField());
    await fill('mai@example.com', 'short');
    await submit();
    await screen.findByRole('alert');
    expect(fetchMock).not.toHaveFetched(SIGN_IN);
  });

  it('disables the button while sending and sends once on a double submit', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    fetchMock.post(SIGN_IN, () => gate.then(() => ({ user: mockUser })));
    form();
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    await fill('mai@example.com', 'correct horse');
    await userEvent.type(passwordField(), '{Enter}{Enter}');

    const button = await screen.findByRole('button', {
      name: 'Đang đăng nhập...',
    });
    expect(button.hasAttribute('disabled')).toBe(true);
    release();
    await waitFor(() => expect(fetchMock).toHavePostedTimes(1, SIGN_IN));
  });
});

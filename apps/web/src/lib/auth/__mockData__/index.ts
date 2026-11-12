export const API = 'https://api.test';

export const mockUser = { id: 'u1', email: 'mai@example.com' };

// The routes of the auth API, as the browser requests them.
export const ME = `${API}/v1/auth/me`;
export const SIGN_IN = `${API}/v1/auth/sign-in`;
export const SIGN_UP = `${API}/v1/auth/sign-up`;
export const SIGN_OUT = `${API}/v1/auth/sign-out`;
export const VERIFY_EMAIL = `${API}/v1/auth/verify-email`;

export const unauthenticated = {
  status: 401,
  body: { error: 'unauthenticated' },
};

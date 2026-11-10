interface CookieLike {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  expirationDate?: number;
}

export function toSetCookie(cookie: CookieLike): string {
  const parts = [`${cookie.name}=${encodeURIComponent(cookie.value)}`];
  if (cookie.domain) parts.push(`Domain=${cookie.domain}`);
  if (cookie.path) parts.push(`Path=${cookie.path}`);
  if (cookie.expirationDate)
    parts.push(
      `Expires=${new Date(Date.now() + cookie.expirationDate).toUTCString()}`,
    );
  if (cookie.httpOnly) parts.push('HttpOnly');
  if (cookie.secure) parts.push('Secure');
  parts.push('SameSite=None');
  return parts.join('; ');
}

export const SESSION_COOKIE = 'session';

export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1 || pair.slice(0, eq).trim() !== name) continue;
    const value = pair.slice(eq + 1).trim();
    return value.startsWith('"') && value.endsWith('"') && value.length >= 2
      ? value.slice(1, -1)
      : value;
  }
  return undefined;
}

export interface CookieOptions {
  maxAgeSeconds: number;
  secure: boolean;
}

export function serializeCookie(
  name: string,
  value: string,
  { maxAgeSeconds, secure }: CookieOptions,
): string {
  const parts = [
    `${name}=${value}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

import { describe, expect, it, vi } from 'vitest';
import { RESEND_API_URL, ResendMailer } from '../../src/auth/mailer.ts';

const MESSAGE = { to: 'a@b.test', subject: 'Hi', text: 'link' };

describe('ResendMailer', () => {
  it('posts the message to Resend with the key', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    await new ResendMailer(
      're_key',
      'Animefork <no-reply@mail.test>',
      fetchFn as unknown as typeof fetch,
    ).send(MESSAGE);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RESEND_API_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer re_key',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Animefork <no-reply@mail.test>',
      to: ['a@b.test'],
      subject: 'Hi',
      text: 'link',
    });
  });

  it('throws without echoing the body when Resend refuses', async () => {
    const fetchFn = vi.fn(async () => new Response('secret', { status: 403 }));
    const mailer = new ResendMailer(
      're_key',
      'x@mail.test',
      fetchFn as unknown as typeof fetch,
    );
    await expect(mailer.send(MESSAGE)).rejects.toThrow('Resend answered 403');
  });
});

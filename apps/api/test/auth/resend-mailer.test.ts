import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { ResendMailer } from '../../src/auth/mailer.ts';

describe('ResendMailer', () => {
  it('posts the message to Resend with the API key', async () => {
    fetchMock.post('https://api.resend.com/emails', { id: 'mail-1' });
    const mailer = new ResendMailer('re_key', 'Animefork <no-reply@mail.test>');

    await mailer.send({
      to: 'ana@example.test',
      subject: 'Confirm your email',
      text: 'https://web.test/verify-email#token=abc',
    });

    expect(fetchMock).toHavePosted('https://api.resend.com/emails', {
      headers: { Authorization: 'Bearer re_key' },
      body: {
        from: 'Animefork <no-reply@mail.test>',
        to: ['ana@example.test'],
        subject: 'Confirm your email',
        text: 'https://web.test/verify-email#token=abc',
      },
    });
  });

  it('fails with the status when Resend refuses the message', async () => {
    fetchMock.post('https://api.resend.com/emails', 403);
    const mailer = new ResendMailer('re_key', 'Animefork <no-reply@mail.test>');

    const sent = mailer.send({
      to: 'ana@example.test',
      subject: 'Confirm your email',
      text: 'https://web.test/verify-email#token=abc',
    });

    await expect(sent).rejects.toThrow('Resend answered 403');
  });
});

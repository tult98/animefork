import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { ReplayTransport } from '../replay-transport.ts';

describe('the replay transport', () => {
  it('serves a page from the fixture file that matches its URL path', async () => {
    fetchMock
      .get('path:/fixtures/default/index.html', 'Psyren')
      .get('path:/fixtures/default/the-loai/hanh-dong.html', 'Action');
    const transport = new ReplayTransport();

    const home = await transport.get({ url: '/' });
    const genre = await transport.get({
      url: 'https://host.example/the-loai/hanh-dong/?page=2',
    });

    expect(home).toEqual({ status: 200, data: 'Psyren' });
    expect(genre).toEqual({ status: 200, data: 'Action' });
    expect(fetchMock).toHaveFetchedTimes(2);
  });

  it('reads from the configured fixture set and asks for text so a dev server cannot answer with index.html', async () => {
    fetchMock.get('path:/fixtures/invalid-title/index.html', 'not-a-number', {
      headers: { Accept: 'text/plain' },
    });

    const res = await new ReplayTransport({
      baseUrl: '/fixtures/invalid-title/',
    }).post({ url: '/', data: { a: 1 } });

    expect(res).toEqual({ status: 200, data: 'not-a-number' });
  });

  it('passes a missing fixture through as status 404', async () => {
    fetchMock.get('path:/fixtures/default/nope.html', 404);

    const res = await new ReplayTransport().get({ url: '/nope/' });

    expect(res.status).toBe(404);
  });
});

// Shared by ReplayTransport and scripts/capture-fixtures.ts so a capture lands exactly where replay reads it.
// Erasable TypeScript only: Node runs the capture script by stripping types.
export function fixtureFileFor(url: string): string {
  const { pathname } = new URL(url, 'http://fixture.invalid');
  const clean = pathname.replace(/^\/+|\/+$/g, '');
  if (clean === '') return 'index.html';
  return /\.[a-z0-9]+$/i.test(clean) ? clean : `${clean}.html`;
}

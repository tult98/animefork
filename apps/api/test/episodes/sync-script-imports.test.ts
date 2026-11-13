import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

it('loads every module the sync script imports under plain node, which cannot parse decorators', () => {
  const modules = [
    'src/art/art.config.ts',
    'src/config/app.config.ts',
    'src/episodes/episode.client.ts',
    'src/episodes/episode.store.ts',
    'src/episodes/episode.sync.ts',
    'src/episodes/episode.translate.ts',
  ];
  const load = modules.map((m) => `import('./${m}')`).join(',');
  expect(() =>
    execFileSync(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', '-e', `Promise.all([${load}])`],
      { cwd: root, stdio: 'pipe' },
    ),
  ).not.toThrow();
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fixtureFileFor } from '../lib/transport/fixture-path.ts';

const FIXTURES = resolve(import.meta.dirname, '../../public/fixtures');

// A captured upstream page, for the tests of a parser that need a real one. The test routes it itself: fetchMock.get(upstream(path), fixture(path)).
export const fixture = (path: string, set = 'default') =>
  readFileSync(resolve(FIXTURES, set, fixtureFileFor(path)), 'utf8');

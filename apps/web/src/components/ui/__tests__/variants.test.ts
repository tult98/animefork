import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KIND_CLASS, TONE_CLASS } from '../button.tsx';
import { NAV_PILL_CLASS } from '../header.tsx';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(here, '..', '..');
const read = (path: string) => readFileSync(path, 'utf8');

const bundle = read(join(srcDir, 'design', 'bundle.css'));
const bundleClasses = new Set(
  [...bundle.matchAll(/\.(af-[a-z0-9-]+)/g)].map((m) => m[1]),
);

const classesIn = (text: string) =>
  [...text.matchAll(/\baf-[a-z0-9-]+/g)].map((m) => m[0]);

describe('variant tables against bundle.css', () => {
  it('maps every kind to a class the stylesheet defines', () => {
    for (const cls of Object.values(KIND_CLASS)) {
      expect(bundleClasses, cls).toContain(cls);
    }
  });

  it('maps every tone to classes the stylesheet defines', () => {
    for (const tones of Object.values(TONE_CLASS)) {
      for (const [tone, value] of Object.entries(tones)) {
        for (const cls of value.split(' ')) {
          expect(bundleClasses, `${tone}: ${cls}`).toContain(cls);
        }
      }
    }
  });

  it('defines the nav pill class', () => {
    expect(bundleClasses).toContain(NAV_PILL_CLASS);
  });

  it('defines every af- class written in the primitives and the gallery', () => {
    const files = [
      ...readdirSync(here)
        .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))
        .map((f) => join(here, f)),
      join(srcDir, 'routes', 'design.tsx'),
    ];
    const used = new Set(files.flatMap((f) => classesIn(read(f))));
    expect(used.size).toBeGreaterThan(10);
    const missing = [...used].filter((cls) => !bundleClasses.has(cls));
    expect(missing).toEqual([]);
  });
});

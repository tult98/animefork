import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import { describe, expect, it } from 'vitest';
import {
  buildCss,
  tokensSchema,
  type Tokens,
} from '../../scripts/build-css.ts';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..');
const read = (name: string) => readFileSync(join(here, name), 'utf8');

describe('committed output', () => {
  it('matches a fresh build of tokens.json', () => {
    const tokens = tokensSchema.parse(JSON.parse(read('tokens.json')));
    const { tokensCss, themeCss } = buildCss(tokens);
    expect(read('tokens.css'), 'run pnpm nx tokens web').toBe(tokensCss);
    expect(read('theme.css'), 'run pnpm nx tokens web').toBe(themeCss);
  });
});

const fixture: Tokens = {
  color: {
    themes: [
      { id: 'stage', name: 'Stage' },
      { id: 'paper', name: 'Paper' },
    ],
    tokens: [
      { name: 'canvas', value: { stage: '#111111', paper: '#ffffff' } },
      { name: 'brand', value: { stage: '#d9381a', paper: '#d9381a' } },
      { name: 'cta', value: { stage: '{brand}', paper: '{brand}' } },
    ],
  },
  type: {
    families: { sans: '"Archivo", sans-serif' },
    groups: [
      {
        styles: [
          {
            name: 'rail-title',
            fontSize: '24px',
            fontWeight: 500,
            lineHeight: '1.3',
            letterSpacing: '0em',
          },
        ],
      },
    ],
  },
  spacing: { tokens: [{ name: 'space-gutter', value: '60px' }] },
  radius: { tokens: [{ name: 'radius-lg', value: '12px' }] },
  shadow: { tokens: [{ name: 'shadow-card', value: '0 8px 24px #000' }] },
};

describe('buildCss', () => {
  const { tokensCss, themeCss } = buildCss(fixture);

  it('puts stage values in :root and only differing values under paper', () => {
    expect(tokensCss).toContain(':root {');
    expect(tokensCss).toContain('--canvas: #111111;');
    const paper = tokensCss.slice(tokensCss.indexOf("[data-theme='paper']"));
    expect(paper).toContain('--canvas: #ffffff;');
    expect(paper).not.toContain('--brand');
  });

  it('resolves alias values to var()', () => {
    expect(tokensCss).toContain('--cta: var(--brand);');
  });

  it('maps spacing tokens to --spacing-* without the space- prefix', () => {
    expect(tokensCss).toContain('--space-gutter: 60px;');
    expect(themeCss).toContain('--spacing-gutter: var(--space-gutter);');
  });

  it('skips --spacing-* for names that collide with Tailwind size keys', () => {
    const { themeCss: css, tokensCss: vars } = buildCss({
      ...fixture,
      spacing: {
        tokens: ['xs', 'sm', 'md', 'lg', 'xl', 'row', 'gutter', 'section'].map(
          (key) => ({ name: `space-${key}`, value: '8px' }),
        ),
      },
    });
    for (const key of ['xs', 'sm', 'md', 'lg', 'xl']) {
      expect(css).not.toContain(`--spacing-${key}:`);
      expect(vars).toContain(`--space-${key}: 8px;`);
    }
    for (const key of ['row', 'gutter', 'section'])
      expect(css).toContain(`--spacing-${key}: var(--space-${key});`);
  });

  it('keeps colors as var() aliases so they switch with data-theme', () => {
    const inline = themeCss.slice(
      themeCss.indexOf('@theme inline'),
      themeCss.indexOf('@theme {'),
    );
    expect(inline).toContain('--color-canvas: var(--canvas);');
    expect(themeCss).not.toMatch(/--color-\w+: #/);
  });

  it('emits the four --text-* properties per style', () => {
    expect(themeCss).toContain('--text-rail-title: 24px;');
    expect(themeCss).toContain('--text-rail-title--line-height: 1.3;');
    expect(themeCss).toContain('--text-rail-title--font-weight: 500;');
    expect(themeCss).toContain('--text-rail-title--letter-spacing: 0em;');
  });

  it('writes radius, shadow and font literally in the plain @theme block', () => {
    const literal = themeCss.slice(themeCss.indexOf('@theme {'));
    expect(literal).toContain('--radius-lg: 12px;');
    expect(literal).toContain('--shadow-card: 0 8px 24px #000;');
    expect(literal).toContain('--font-sans: "Archivo", sans-serif;');
    expect(literal).not.toContain('var(');
  });
});

describe('committed theme.css under Tailwind', () => {
  it('keeps container sizes and exposes the non-colliding spacing', async () => {
    const compiler = await compile(
      `@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/utilities.css' layer(utilities);
${read('theme.css')}`,
      { base: here, onDependency: () => {} },
    );
    const css = compiler.build(['max-w-md', 'w-lg', 'px-gutter']);
    expect(css).toMatch(/--container-md:\s*28rem/);
    expect(css).toMatch(/max-width:\s*var\(--container-md\)/);
    expect(css).not.toMatch(/width:\s*var\(--space-(md|lg)\)/);
    expect(css).toMatch(/padding-inline:\s*var\(--space-gutter\)/);
  });
});

describe('no raw colors outside the design folder', () => {
  const raw = /#[0-9a-fA-F]{3,8}\b|\b(?:oklch|rgba?|hsla?)\(/;

  function* sources(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (path !== here) yield* sources(path);
      } else if (
        /\.(ts|tsx|css)$/.test(entry.name) &&
        !/\.test\.tsx?$/.test(entry.name) &&
        entry.name !== 'routeTree.gen.ts'
      ) {
        yield path;
      }
    }
  }

  it('finds none in src', () => {
    const hits: string[] = [];
    for (const file of sources(srcDir)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (raw.test(line)) hits.push(`${relative(srcDir, file)}:${i + 1}`);
        });
    }
    expect(hits, 'use a token instead of a raw color').toEqual([]);
  });
});

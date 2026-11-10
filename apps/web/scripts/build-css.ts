import { z } from 'zod';

const named = z.object({ name: z.string(), value: z.string() });

export const tokensSchema = z.object({
  color: z.object({
    themes: z.array(z.object({ id: z.string(), name: z.string() })),
    tokens: z.array(
      z.object({
        name: z.string(),
        value: z.record(z.string(), z.string()),
      }),
    ),
  }),
  type: z.object({
    families: z.object({ sans: z.string() }),
    groups: z.array(
      z.object({
        styles: z.array(
          z.object({
            name: z.string(),
            fontSize: z.string(),
            fontWeight: z.number(),
            lineHeight: z.string(),
            letterSpacing: z.string(),
          }),
        ),
      }),
    ),
  }),
  spacing: z.object({ tokens: z.array(named) }),
  radius: z.object({ tokens: z.array(named) }),
  shadow: z.object({ tokens: z.array(named) }),
});

export type Tokens = z.infer<typeof tokensSchema>;

export const HEADER =
  '/* AnimeFork - generated from tokens.json by scripts/build-tokens.ts, do not edit */';

const DEFAULT_THEME = 'stage';

const resolve = (value: string) => value.replace(/^\{([\w-]+)\}$/, 'var(--$1)');

const block = (selector: string, decls: string[]) =>
  [`${selector} {`, ...decls.map((d) => `  ${d}`), '}'].join('\n');

export function buildCss(tokens: Tokens): {
  tokensCss: string;
  themeCss: string;
} {
  const { color, type, spacing, radius, shadow } = tokens;
  const themeIds = color.themes.map((t) => t.id);
  if (!themeIds.includes(DEFAULT_THEME))
    throw new Error(`tokens.json has no "${DEFAULT_THEME}" theme`);

  const valueIn = (token: Tokens['color']['tokens'][number], theme: string) => {
    const value = token.value[theme];
    if (value === undefined)
      throw new Error(`color "${token.name}" has no ${theme} value`);
    return resolve(value);
  };

  const root = [
    ...color.tokens.map((t) => `--${t.name}: ${valueIn(t, DEFAULT_THEME)};`),
    ...spacing.tokens.map((t) => `--${t.name}: ${t.value};`),
    `--font-sans: ${type.families.sans};`,
  ];

  const themed = themeIds
    .filter((id) => id !== DEFAULT_THEME)
    .map((id) => {
      const decls = color.tokens
        .filter((t) => valueIn(t, id) !== valueIn(t, DEFAULT_THEME))
        .map((t) => `--${t.name}: ${valueIn(t, id)};`);
      return block(`[data-theme='${id}']`, decls);
    });

  const tokensCss =
    [HEADER, block(':root', root), ...themed].join('\n\n') + '\n';

  const inline = [
    ...color.tokens.map((t) => `--color-${t.name}: var(--${t.name});`),
    ...spacing.tokens.map((t) => {
      const suffix = t.name.replace(/^space-/, '');
      return `--spacing-${suffix}: var(--${t.name});`;
    }),
  ];

  const literal = [
    ...radius.tokens.map((t) => `--${t.name}: ${t.value};`),
    ...shadow.tokens.map((t) => `--${t.name}: ${t.value};`),
    `--font-sans: ${type.families.sans};`,
    ...type.groups.flatMap((g) =>
      g.styles.flatMap((s) => [
        `--text-${s.name}: ${s.fontSize};`,
        `--text-${s.name}--line-height: ${s.lineHeight};`,
        `--text-${s.name}--font-weight: ${s.fontWeight};`,
        `--text-${s.name}--letter-spacing: ${s.letterSpacing};`,
      ]),
    ),
  ];

  const themeCss =
    [HEADER, block('@theme inline', inline), block('@theme', literal)].join(
      '\n\n',
    ) + '\n';

  return { tokensCss, themeCss };
}

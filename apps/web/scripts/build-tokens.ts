import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCss, tokensSchema } from './build-css.ts';

const designDir = join(
  resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  'src',
  'design',
);

const tokens = tokensSchema.parse(
  JSON.parse(await readFile(join(designDir, 'tokens.json'), 'utf8')),
);
const { tokensCss, themeCss } = buildCss(tokens);

await writeFile(join(designDir, 'tokens.css'), tokensCss);
await writeFile(join(designDir, 'theme.css'), themeCss);

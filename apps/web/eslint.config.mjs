// Lives in apps/web, never the repo root: ESLint 8.57 in desktop-web would pick up a root flat config.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'artifacts',
      'playwright-report',
      'test-results',
      'src/routeTree.gen.ts',
      'src/lib/player/dha',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
);

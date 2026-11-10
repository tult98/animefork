// Lives in apps/extension, never the repo root: ESLint 8.57 in desktop-web would pick up a root flat config.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'client/dist', 'artifacts', 'out-tsc'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
);

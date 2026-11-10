# Design system source

AnimeFork design tokens, vendored from the design system artifact.

- Artifact: https://claude.ai/artifact/Hgi6Qcs23Mafs9iG5dRzgc
- Version: 1794284548-9ec9
- `tokens.json` sha256: `df89ab041b4546122ba95b84a90dcee089edc30ac4ddf8120b6158fb4afff445`

## Rules

- `tokens.json` is edited only in the artifact. Re-vendor it here, update the version and sha256 above, then run `pnpm nx tokens web`.
- `tokens.css` and `theme.css` are generated from `tokens.json` by `scripts/build-tokens.ts` and committed. Never edit them by hand. `tokens.test.ts` fails when they drift.
- Components use token utilities (`bg-canvas`, `text-muted`, `px-gutter`, `rounded-lg`). Raw colors are banned outside this folder.
- The logos in `public/brand/` are the artifact's files, unmodified. Never recolor or redraw them.

## Deliberate deviations

- Fonts. The artifact's Archivo woff2 files are a Latin subset with no Vietnamese glyphs and no weight 500, while the tokens use 500. We load `@fontsource/archivo` instead (`@fontsource/archivo/<weight>.css` for weights 400 to 900, which carry the latin, latin-ext and vietnamese faces with their unicode-range; the per-subset files such as `vietnamese-500.css` have no unicode-range and would shadow the other subsets, so do not import them) and do not vendor the artifact's font files. The family stack from the tokens is unchanged. `Noto Sans JP` stays in the stack as a fallback but is not loaded.

## Not vendored yet

- `components/bundle.css` and the `af-` components: slice 2.
- `netflix.design.md`: never.

import { readFileSync } from 'node:fs';
import js from '@eslint/js';
import globals from 'globals';

// ui/ reaches elements by their id (the browser makes every id in index.html a global), so those ids count as defined
const elementIds = Object.fromEntries(
  [...readFileSync(new URL('./index.html', import.meta.url), 'utf8').matchAll(/\bid="([A-Za-z_$][\w$]*)"/g)].map(
    (m) => [m[1], 'readonly'],
  ),
);

export default [
  { ignores: ['node_modules/', '_site/', 'coverage/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    rules: {
      // `catch (e) {}` is used on purpose where a failure is harmless (storage, parsing)
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `const {id, ...rest} = r` is how a key is left out
      'no-unused-vars': ['error', { caughtErrors: 'none', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  // core/ has no DOM or browser UI: keep it that way
  { files: ['core/**/*.js'], languageOptions: { globals: { ...globals['shared-node-browser'] } } },
  { files: ['ui/**/*.js', 'cloud.js'], languageOptions: { globals: { ...globals.browser, ...elementIds } } },
  { files: ['sw.js'], languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker } } },
  {
    files: ['test/**/*.js', 'design/**/*.js', 'docs/**/*.js', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  // the browser test and the screenshot script also run code inside the page (page.evaluate)
  { files: ['test/e2e/**/*.js', 'docs/screenshots/**/*.js'], languageOptions: { globals: { ...globals.browser } } },
];

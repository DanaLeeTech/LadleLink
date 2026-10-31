import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'apps/mobile/android/**',
      'apps/web/public/**',
      'packages/units/src/generated/**',
      'deploy/**',
      'remote/**',
      'scripts/**',
      'data/**',
      '.playwright-mcp/**',
      'docs/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly' },
    },
    rules: {
      // Parser JSON-LD/microdata traversal is deliberately untyped; retyping it is a large
      // behavioural-risk refactor, so surface it as a warning instead.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  prettier,
);

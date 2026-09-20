import js from '@eslint/js';
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'watch.js'] },
  js.configs.recommended,
  // Includes the parser setup plus the core-rule overrides TypeScript makes redundant
  // (no-undef, no-redeclare, ...), which is what `plugin:@typescript-eslint/recommended`
  // pulled in under the old .eslintrc.
  ...tseslint.configs['flat/recommended'],
  importPlugin.flatConfigs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: 'readonly',
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      prettier: prettierPlugin,
    },
    settings: {
      // Not 'detect': eslint-plugin-react's version detection calls context.getFilename(),
      // which ESLint 10 removed.
      react: { version: '19.3' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'import/no-unresolved': 'off',
      // TypeScript checks the props of every component; runtime propTypes would be
      // a second, weaker source of truth for the same thing.
      'react/prop-types': 'off',
    },
  },
  prettierConfig,
];

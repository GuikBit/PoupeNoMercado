// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');
const simpleImportSort = require('eslint-plugin-simple-import-sort');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // `any` é proibido no projeto — use `unknown` + narrowing (ver CLAUDE.md)
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    ignores: ['dist/**', 'android/**', 'ios/**', '.expo/**', 'coverage/**'],
  },
]);

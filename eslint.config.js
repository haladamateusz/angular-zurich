// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const eslintConfigPrettier = require('eslint-config-prettier');
const boundaries = require('eslint-plugin-boundaries');

module.exports = defineConfig([
  {
    ignores: ['.angular/**', 'dist/**', 'coverage/**', 'node_modules/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      eslintConfigPrettier,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    files: ['src/app/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/root-path': __dirname,
      'boundaries/elements': [
        { type: 'core', pattern: 'src/app/core', partialMatch: false },
        { type: 'ui', pattern: 'src/app/ui', partialMatch: false },
        { type: 'layout', pattern: 'src/app/layout', partialMatch: false },
        { type: 'pattern', pattern: 'src/app/pattern/*', partialMatch: false },
        {
          type: 'feature',
          pattern: 'src/app/feature/*',
          capture: ['feature'],
          partialMatch: false,
        },
        { type: 'environment', pattern: 'src/environments', partialMatch: false },
        { type: 'server', pattern: 'src/server', partialMatch: false },
      ],
      'boundaries/files': [
        { pattern: 'src/app/*.ts', category: 'app' },
        { pattern: 'src/app/feature/*/*.routes.ts', category: 'feature-route' },
      ],
      'boundaries/dependency-nodes': ['import', 'export', 'require', 'dynamic-import'],
      'import/resolver': {
        typescript: { project: './tsconfig.app.json' },
      },
    },
    rules: {
      'boundaries/no-unknown-files': 'error',
      'boundaries/no-unknown-dependencies': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { file: { categories: ['app'] } },
              allow: [
                { to: { file: { categories: ['app'] } } },
                { to: { element: { type: ['core', 'layout'] } } },
                {
                  to: { file: { categories: ['feature-route'] } },
                  dependency: { nodeKind: 'dynamic-import' },
                },
              ],
            },
            {
              from: { element: { type: 'core' } },
              allow: { to: { element: { type: ['core', 'environment'] } } },
            },
            {
              from: { element: { type: 'ui' } },
              allow: { to: { element: { type: 'ui' } } },
            },
            {
              from: { element: { type: 'layout' } },
              allow: { to: { element: { type: ['core', 'ui', 'layout', 'pattern'] } } },
            },
            {
              from: { element: { type: 'pattern' } },
              allow: { to: { element: { type: ['core', 'ui'] } } },
            },
            {
              from: { element: { type: 'feature' } },
              allow: { to: { element: { type: ['core', 'ui', 'pattern', 'environment'] } } },
            },
            {
              // A feature may compose another feature only through its lazy route entry point.
              from: { file: { categories: ['feature-route'] } },
              allow: {
                to: { file: { categories: ['feature-route'] } },
                dependency: { nodeKind: 'dynamic-import' },
              },
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
      eslintConfigPrettier,
    ],
    rules: {},
  },
]);

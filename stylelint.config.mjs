import configTailwindcss from '@dreamsicle.io/stylelint-config-tailwindcss/dist/stylelint.config.mjs';

/** @type {import('stylelint').Config} */
const stylelintConfig = {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['**/node_modules/**', '**/dist/**', '**/.angular/**'],
  languageOptions: {
    ...configTailwindcss.languageOptions,
    syntax: {
      ...configTailwindcss.languageOptions.syntax,
      types: {
        ...configTailwindcss.languageOptions.syntax.types,
      },
      properties: {
        ...configTailwindcss.languageOptions.syntax.properties,
      },
      atRules: {
        ...configTailwindcss.languageOptions.syntax.atRules,
      },
    },
  },
  rules: {
    ...configTailwindcss.rules,
    'no-empty-source': null,
    'no-descending-specificity': null,
    'comment-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'hue-degree-notation': null,
    'color-function-notation': null,
    'color-function-alias-notation': null,
    'alpha-value-notation': null,
    'media-feature-range-notation': null,
    'font-family-name-quotes': null,
    'number-max-precision': null,
    'custom-property-pattern': null,
    // Named `@theme <name> inline` preludes are valid in Tailwind v4 but not yet in Stylelint syntax.
    'at-rule-prelude-no-invalid': null,
    'selector-class-pattern':
      '^([a-z][a-z0-9]*)(-[a-z0-9]+)*(__[a-z][a-z0-9]*(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$',
    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: ['host', 'host-context', 'global', 'deep'],
      },
    ],
    'selector-pseudo-element-no-unknown': [
      true,
      {
        ignorePseudoElements: ['ng-deep'],
      },
    ],
  },
};

export default stylelintConfig;

import js from '@eslint/js';
import globals from 'globals';
import security from 'eslint-plugin-security';

export default [
  { ignores: ['**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'security/detect-object-injection': 'off', // dynamic keys here come from fixed whitelists; reviewed manually
    },
  },
  { files: ['**/test/**', 'vitest.config.js', 'test-setup.js'], rules: { 'security/detect-non-literal-regexp': 'off', 'security/detect-unsafe-regex': 'off' } },
];

import js from '@eslint/js';

export default [
  {
    ignores: [ 'node_modules/**' ]
  },
  {
    files: [ '**/*.js' ],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // node
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [ 'error', { args: 'after-used' } ],
      eqeqeq: [ 'error', 'smart' ],
      'no-var': 'error',
      'prefer-const': 'error',
      quotes: [ 'error', 'single', { avoidEscape: true } ],
      semi: [ 'error', 'always' ]
    }
  }
];

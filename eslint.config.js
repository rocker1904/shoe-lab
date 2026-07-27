import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // A `Map` built and consumed inside one `$derived.by` is never mutated afterwards, so
      // SvelteMap would buy reactivity nothing has asked for. The rule cannot see that scope.
      'svelte/prefer-svelte-reactivity': 'off',
    },
  },
);

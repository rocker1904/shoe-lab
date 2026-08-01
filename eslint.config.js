import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `.hunt/` is a bug hunt's scratch — probe scripts an agent wrote to prove one finding and then
  // abandoned, which are not code anyone maintains. The tracked instrument lives in `hunt/` and IS
  // linted. Without this, a hunt turns `npm run verify` red by doing its job (docs/hunting.md §The rig).
  { ignores: ['**/dist/**', '**/coverage/**', '.hunt/**'] },
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

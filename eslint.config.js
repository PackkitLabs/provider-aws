import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	{ ignores: ['dist', 'coverage'] },
	// Node scripts (the terraform-validation harness) run under Node — give them Node
	// globals so `process`/`console` aren't flagged no-undef.
	{ files: ['**/*.mjs', 'scripts/**/*.js'], languageOptions: { globals: globals.node } },
);

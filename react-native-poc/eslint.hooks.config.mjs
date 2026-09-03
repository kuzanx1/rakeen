// The project's main ESLint config is currently unrunnable: `npm run lint`
// dies with "Cannot read properties of undefined (reading 'allowShortCircuit')"
// because the hoisted eslint at the repo root and this package's
// @typescript-eslint are on incompatible majors. That is why a
// rules-of-hooks violation shipped to TestFlight and crashed the app on the
// first render after login.
//
// This standalone config runs the ONE rule that would have caught it, with
// no @typescript-eslint rules involved, so it works regardless of that
// version clash. Run it with `npm run lint:hooks`.
import hooks from 'eslint-plugin-react-hooks';
import ts from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    ignores: ['node_modules/**', 'ios/**', 'android/**', 'vendor/**'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Registered only so inline `eslint-disable` comments elsewhere in the
    // tree resolve; every rule in it stays off.
    plugins: { 'react-hooks': hooks, '@typescript-eslint': ts },
    rules: { 'react-hooks/rules-of-hooks': 'error' },
  },
];

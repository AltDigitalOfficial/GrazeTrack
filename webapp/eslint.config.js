import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['src/components/ui/button.tsx', 'src/components/ui/navigation-menu.tsx', 'src/lib/ranchContext.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/ui/input.tsx', 'src/components/ui/textarea.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="select"]',
          message: 'Use shared Select components from @/components/ui/select.',
        },
        {
          selector: 'JSXOpeningElement[name.name="input"]',
          message: 'Use shared Input component from @/components/ui/input.',
        },
        {
          selector: 'JSXOpeningElement[name.name="textarea"]',
          message: 'Use shared Textarea component from @/components/ui/textarea.',
        },
      ],
    },
  },
])

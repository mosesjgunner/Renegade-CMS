import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      '.next*/**',
      '.worktrees/**',
      '.phase-a/**',
      '.payload-upstream/**',
      'docs/media/evidence/**',
      'scratch/**',
      'public/vendor/**',
      'src/payload-types.ts',
      'src/app/(payload)/admin/importMap.js',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: ['src/migrations/*.ts'],
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react/no-unescaped-entities': 'off',
      '@next/next/no-img-element': 'off',
    },
  },
]

export default eslintConfig

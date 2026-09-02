import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      '.worktrees/**',
      '.phase-a/**',
      '.payload-upstream/**',
      'src/payload-types.ts',
      'src/app/(payload)/admin/importMap.js',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: ['src/migrations/*.ts'],
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  },
]

export default eslintConfig

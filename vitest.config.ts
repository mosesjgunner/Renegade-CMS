import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      APP_URL: process.env.APP_URL ?? 'http://localhost:3000',
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://renegade:renegade_dev_only@localhost:5432/renegade',
      PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ?? 'unit-test-secret-with-at-least-32-characters',
    },
  },
})

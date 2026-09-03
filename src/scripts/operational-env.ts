import { access, readFile } from 'node:fs/promises'

const required = ['POSTGRES_PASSWORD', 'PAYLOAD_SECRET', 'APP_URL', 'PROXY_MODE'] as const
const placeholder = /^(replace-with|change-me|example|https:\/\/cms\.example\.com)/i

export async function assertOperationalEnv(envFile: string) {
  try {
    await access(envFile)
  } catch {
    throw new Error(
      `Missing ${envFile}. For an isolated restore run \"npm run restore:prepare-env -- --env-file ${envFile}\"; production must be installed with install.sh or .env.production.example.`,
    )
  }
  const entries = Object.fromEntries(
    (await readFile(envFile, 'utf8'))
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        return index === -1 ? [line, ''] : [line.slice(0, index), line.slice(index + 1)]
      }),
  )
  const missing = required.filter((key) => {
    const value = entries[key]?.trim()
    return !value || placeholder.test(value)
  })
  if (missing.length)
    throw new Error(
      `${envFile} is not ready for Compose: set non-placeholder ${missing.join(', ')}. Secrets are never copied from production into an isolated restore target.`,
    )
  return entries
}

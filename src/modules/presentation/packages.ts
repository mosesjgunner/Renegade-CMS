import { createHash } from 'node:crypto'
import { readdir, readFile, lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { valid, validRange, satisfies } from 'semver'
import { themes, validateManifest } from './registry'
import { validateTokens, type DesignTokens } from './tokens'
import { RENEGADE_PRESENTATION_VERSION } from './contracts'
export type LocalTheme = {
  id: string
  version: string
  label: string
  renegade: string
  renderer: string
  tokens: DesignTokens
  assets: { path: string; sha256: string }[]
  migrations: { from: string; to: string; operation: 'defaults'; tokens: DesignTokens }[]
}
export type InstalledTheme = {
  package?: LocalTheme
  digest?: string
  directory: string
  error?: string
  compatible: boolean
}
const keys = ['id', 'version', 'label', 'renegade', 'renderer', 'tokens', 'assets', 'migrations']
export function validatePackage(value: unknown): LocalTheme {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Manifest must be a JSON object.')
  const p = value as LocalTheme
  if (Object.keys(p).some((k) => !keys.includes(k)) || keys.some((k) => !Object.hasOwn(p, k)))
    throw new Error(
      'Manifest contains unknown or missing fields; executable configuration is forbidden.',
    )
  if (
    typeof p.id !== 'string' ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(p.id) ||
    typeof p.version !== 'string' ||
    valid(p.version) !== p.version ||
    typeof p.renegade !== 'string' ||
    !p.renegade.trim() ||
    !validRange(p.renegade) ||
    typeof p.label !== 'string' ||
    !p.label ||
    p.label.length > 100
  )
    throw new Error('Invalid package identity, version, or compatibility range.')
  if (typeof p.renderer !== 'string' || !Object.hasOwn(themes, p.renderer))
    throw new Error('Renderer is not registered. Arbitrary imports are forbidden.')
  validateManifest(themes[p.renderer])
  validateTokens(p.tokens)
  if (!Array.isArray(p.assets) || !Array.isArray(p.migrations))
    throw new Error('Assets and migrations must be arrays.')
  const paths = new Set<string>()
  for (const asset of p.assets) {
    if (
      !asset ||
      typeof asset.path !== 'string' ||
      typeof asset.sha256 !== 'string' ||
      Object.keys(asset).sort().join(',') !== 'path,sha256' ||
      !/^assets\/[a-zA-Z0-9_-]+\.(png|jpg|webp|woff2)$/.test(asset.path) ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      paths.has(asset.path)
    )
      throw new Error('Invalid or duplicate asset. Only declared inert assets are allowed.')
    paths.add(asset.path)
  }
  const steps = new Set<string>()
  for (const m of p.migrations) {
    if (
      !m ||
      Object.keys(m).sort().join(',') !== 'from,operation,to,tokens' ||
      typeof m.from !== 'string' ||
      valid(m.from) !== m.from ||
      m.to !== p.version ||
      m.from === m.to ||
      m.operation !== 'defaults' ||
      steps.has(m.from)
    )
      throw new Error('Invalid presentation migration.')
    validateTokens(m.tokens)
    steps.add(m.from)
  }
  return p
}
export async function discoverThemes(
  root = path.join(process.cwd(), 'theme-packages'),
): Promise<InstalledTheme[]> {
  const result: InstalledTheme[] = []
  let boundary: string
  try {
    boundary = await realpath(root)
  } catch {
    return [
      {
        directory: 'theme-packages',
        compatible: false,
        error:
          'Package directory unavailable. Deploy theme-packages beside the running application.',
      },
    ]
  }
  for (const directory of await readdir(boundary)) {
    try {
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(directory)) throw new Error('Invalid package directory.')
      const base = path.join(boundary, directory)
      if ((await lstat(base)).isSymbolicLink() || !(await lstat(base)).isDirectory())
        throw new Error('Package must be a real directory.')
      const manifestPath = path.join(base, 'theme.json')
      if (!(await lstat(manifestPath)).isFile() || (await lstat(manifestPath)).size > 65536)
        throw new Error('Invalid manifest file.')
      const bytes = await readFile(manifestPath)
      const p = validatePackage(JSON.parse(bytes.toString()))
      const allowed = new Set(['theme.json', ...p.assets.map((a) => a.path)])
      const files = await readdir(base, { recursive: true })
      for (const rawFile of files) {
        const file = rawFile.split(path.sep).join('/')
        const stat = await lstat(path.join(base, file))
        if (
          stat.isSymbolicLink() ||
          (!stat.isFile() && !stat.isDirectory()) ||
          (!stat.isDirectory() && !allowed.has(file)) ||
          (stat.isDirectory() && file !== 'assets')
        )
          throw new Error('Undeclared files or symlinks are forbidden.')
      }
      for (const asset of p.assets) {
        const data = await readFile(path.join(base, asset.path))
        if (createHash('sha256').update(data).digest('hex') !== asset.sha256)
          throw new Error('Asset integrity mismatch. Reinstall the package.')
      }
      result.push({
        package: p,
        digest: createHash('sha256').update(bytes).digest('hex'),
        directory,
        compatible: satisfies(RENEGADE_PRESENTATION_VERSION, p.renegade),
      })
    } catch (error) {
      result.push({
        directory,
        compatible: false,
        error:
          error instanceof SyntaxError
            ? 'Malformed JSON manifest.'
            : error instanceof Error && !('code' in error)
              ? error.message
              : 'Package files cannot be read. Check the installation.',
      })
    }
  }
  const ids = result.filter((r) => r.package).map((r) => `${r.package!.id}@${r.package!.version}`)
  for (const r of result)
    if (
      r.package &&
      ids.filter((id) => id === `${r.package!.id}@${r.package!.version}`).length > 1
    ) {
      r.compatible = false
      r.error = 'Duplicate package identity/version. Remove the duplicate.'
    }
  return result
}
export function migrateTokens(p: LocalTheme, from: string, tokens: DesignTokens) {
  if (from === p.version) return validateTokens(tokens)
  const step = p.migrations.find((m) => m.from === from)
  if (!step)
    throw new Error(
      'No compatible migration. Save a fresh draft or install an intermediate version.',
    )
  return validateTokens({ ...step.tokens, ...tokens })
}

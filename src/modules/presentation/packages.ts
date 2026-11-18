import { createHash } from 'node:crypto'
import { readdir, readFile, lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { valid, validRange, satisfies } from 'semver'
import { themes, validateManifest } from './registry'
import { validateTokens, type DesignTokens } from './tokens'
import { RENEGADE_PRESENTATION_VERSION, RESPONSIVE_POLICIES } from './contracts'
export type LocalTheme = {
  id: string
  version: string
  label: string
  renegade: string
  renderer: string
  tokens: DesignTokens
  assets: { path: string; sha256: string }[]
  migrations: { from: string; to: string; operation: 'defaults'; tokens: DesignTokens }[]
  /** Registered responsive policy id (S2-09); absent means the core policy. */
  responsivePolicy?: string
  /** Content-type key → theme template id defaults (S2-09). */
  templateDefaults?: Record<string, string>
  /** Component id → variant names the package approves for it (S2-09). */
  componentVariants?: Record<string, string[]>
}
export type InstalledTheme = {
  package?: LocalTheme
  digest?: string
  directory: string
  error?: string
  compatible: boolean
}
const keys = ['id', 'version', 'label', 'renegade', 'renderer', 'tokens', 'assets', 'migrations']
/** Optional declarative extensions (S2-09). Existing packages that omit
 * them validate exactly as before; unknown keys remain forbidden. */
const optionalKeys = ['responsivePolicy', 'templateDefaults', 'componentVariants']
export function validatePackage(value: unknown): LocalTheme {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Manifest must be a JSON object.')
  const p = value as LocalTheme
  if (
    Object.keys(p).some((k) => ![...keys, ...optionalKeys].includes(k)) ||
    keys.some((k) => !Object.hasOwn(p, k))
  )
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
  // Declarative extensions (S2-09): references only — a package may name
  // a registered responsive policy, the renderer's own templates as
  // content-type defaults, and variants of the renderer's own components.
  // Anything else (raw CSS, foreign ids, code) is refused.
  if (p.responsivePolicy !== undefined) {
    if (
      typeof p.responsivePolicy !== 'string' ||
      !(RESPONSIVE_POLICIES as readonly string[]).includes(p.responsivePolicy)
    )
      throw new Error('Responsive policy is not registered.')
  }
  const manifest = themes[p.renderer]
  if (p.templateDefaults !== undefined) {
    if (
      !p.templateDefaults ||
      typeof p.templateDefaults !== 'object' ||
      Array.isArray(p.templateDefaults) ||
      Object.keys(p.templateDefaults).length > 32
    )
      throw new Error('Invalid template defaults.')
    for (const [contentType, templateId] of Object.entries(p.templateDefaults)) {
      if (
        !/^[a-z][a-z0-9-]{0,63}$/.test(contentType) ||
        typeof templateId !== 'string' ||
        !Object.hasOwn(manifest.templateRegistry, templateId)
      )
        throw new Error('Template default references an unregistered template.')
    }
  }
  if (p.componentVariants !== undefined) {
    if (
      !p.componentVariants ||
      typeof p.componentVariants !== 'object' ||
      Array.isArray(p.componentVariants) ||
      Object.keys(p.componentVariants).length > 128
    )
      throw new Error('Invalid component variants.')
    for (const [componentId, variants] of Object.entries(p.componentVariants)) {
      if (!Object.hasOwn(manifest.componentRegistry, componentId))
        throw new Error('Component variant references an unregistered component.')
      if (
        !Array.isArray(variants) ||
        variants.length < 1 ||
        variants.length > 16 ||
        variants.some(
          (variant) => typeof variant !== 'string' || !variant || variant.length > 40,
        ) ||
        new Set(variants).size !== variants.length
      )
        throw new Error('Invalid component variant list.')
    }
  }
  return p
}
export async function discoverThemes(
  root = process.env.RENEGADE_THEME_PACKAGES_DIR || path.join(process.cwd(), 'theme-packages'),
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

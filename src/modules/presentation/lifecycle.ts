import { createHash, randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import { discoverThemes, migrateTokens, type InstalledTheme } from './packages'
import { validateTokens, type DesignTokens } from './tokens'
import { themes, validateManifest } from './registry'
export type Configuration = {
  id: string
  version: string
  digest: string
  renderer: string
  tokens: DesignTokens
}
export type ThemeState = {
  revision: number
  active: Configuration | null
  draft: Configuration | null
  previous: Configuration | null
}
type Client = {
  query: <T = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: T[]; rowCount: number | null }>
  release: () => void
}
export type ThemePool = { query: Client['query']; connect: () => Promise<Client> }
export const themePool = (payload: Payload) => (payload.db as unknown as { pool: ThemePool }).pool
export async function readThemeState(pool: ThemePool, site: string): Promise<ThemeState> {
  const result = await pool.query<ThemeState>(
    'SELECT revision, active, draft, previous FROM presentation_theme_state WHERE site_id=$1',
    [site],
  )
  return result.rows[0] ?? { revision: 0, active: null, draft: null, previous: null }
}
export function preflight(configuration: Configuration, installed: InstalledTheme[]) {
  const item = installed.find(
    (i) => i.package?.id === configuration.id && i.package.version === configuration.version,
  )
  if (
    !item?.compatible ||
    item.error ||
    item.digest !== configuration.digest ||
    item.package?.renderer !== configuration.renderer
  )
    throw new Error(
      'Theme unavailable, incompatible, or changed on disk. Reinstall the pinned package and save a new draft.',
    )
  validateTokens(configuration.tokens)
  validateManifest(themes[configuration.renderer])
  // Exercise every registered template before committing. Packages cannot supply render code.
  for (const template of Object.values(themes[configuration.renderer].templateRegistry))
    template.render({ main: 'Theme preflight' })
  return configuration
}
export async function changeTheme(
  pool: ThemePool,
  input: {
    site: string
    actor: string
    revision: number
    action: 'draft' | 'activate' | 'rollback'
    id?: string
    version?: string
    tokens?: unknown
  },
  installed?: InstalledTheme[],
) {
  const packages = installed ?? (await discoverThemes())
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      'INSERT INTO presentation_theme_state (site_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [input.site],
    )
    const {
      rows: [state],
    } = await client.query<ThemeState>(
      'SELECT revision, active, draft, previous FROM presentation_theme_state WHERE site_id=$1 FOR UPDATE',
      [input.site],
    )
    if (state.revision !== input.revision)
      throw new Error('Theme changed in another session. Refresh before retrying.')
    if (!state.active) {
      const legacy = await client.query<{ theme_id: string }>(
        'SELECT theme_id FROM site_settings LIMIT 1',
      )
      const initial = packages.find(
        (p) =>
          p.package?.id === (legacy.rows[0]?.theme_id ?? 'neutral-starter') &&
          p.package.version === '1.0.0' &&
          p.compatible &&
          !p.error,
      )
      if (!initial?.package || !initial.digest)
        throw new Error('Install the current legacy theme at version 1.0.0 before changing themes.')
      state.active = preflight(
        {
          id: initial.package.id,
          version: initial.package.version,
          digest: initial.digest,
          renderer: initial.package.renderer,
          tokens: initial.package.tokens,
        },
        packages,
      )
    }
    if (input.action === 'draft') {
      const item = packages.find(
        (p) => p.package?.id === input.id && p.package?.version === input.version,
      )
      if (!item?.package || !item.compatible || item.error || !item.digest)
        throw new Error('Select an installed compatible theme.')
      const p = item.package
      const migrated =
        state.active?.id === p.id && state.active.version !== p.version
          ? migrateTokens(p, state.active.version, state.active.tokens)
          : {}
      state.draft = preflight(
        {
          id: p.id,
          version: p.version,
          digest: item.digest,
          renderer: p.renderer,
          tokens: validateTokens({
            ...p.tokens,
            ...migrated,
            ...validateTokens(input.tokens ?? {}),
          }),
        },
        packages,
      )
    } else {
      const candidate = input.action === 'activate' ? state.draft : state.previous
      if (!candidate)
        throw new Error(
          input.action === 'activate'
            ? 'Save a draft first.'
            : 'No previous configuration is available.',
        )
      preflight(candidate, packages)
      const previous = state.active
      state.active = candidate
      state.previous = previous
      state.draft = null
    }
    state.revision++
    await client.query(
      'UPDATE presentation_theme_state SET revision=$2, active=$3::jsonb, draft=$4::jsonb, previous=$5::jsonb WHERE site_id=$1',
      [
        input.site,
        state.revision,
        JSON.stringify(state.active),
        JSON.stringify(state.draft),
        JSON.stringify(state.previous),
      ],
    )
    await client.query(
      'INSERT INTO presentation_theme_audit (site_id, actor_id, action, revision, configuration) VALUES ($1,$2,$3,$4,$5::jsonb)',
      [input.site, input.actor, input.action, state.revision, JSON.stringify(state.active)],
    )
    await client.query('DELETE FROM presentation_theme_previews WHERE site_id=$1', [input.site])
    await client.query('COMMIT')
    return state
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
export async function createThemePreview(
  pool: ThemePool,
  site: string,
  actor: string,
  revision: number,
  source: 'draft' | 'previous' = 'draft',
) {
  const token = randomBytes(32).toString('base64url')
  const result = await pool.query(
    `INSERT INTO presentation_theme_previews (token_hash, site_id, actor_id, configuration, expires_at)
    SELECT $1, site_id, $3, candidate, NOW() + INTERVAL '15 minutes' FROM (
      SELECT site_id, revision, CASE WHEN $5 = 'previous' THEN previous ELSE draft END AS candidate
      FROM presentation_theme_state
    ) state WHERE site_id=$2 AND revision=$4 AND candidate IS NOT NULL AND candidate <> 'null'::jsonb RETURNING token_hash`,
    [hash(token), site, actor, revision, source],
  )
  if (!result.rowCount) throw new Error('Draft changed or is missing. Refresh and save a draft.')
  return token
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex')
export async function resolveConfiguration(
  pool: ThemePool,
  site: string,
  preview?: { actor: string; token: string },
) {
  const installed = await discoverThemes()
  if (preview) {
    const result = await pool.query<{ configuration: Configuration }>(
      'SELECT configuration FROM presentation_theme_previews WHERE token_hash=$1 AND site_id=$2 AND actor_id=$3 AND expires_at>NOW()',
      [hash(preview.token), site, preview.actor],
    )
    if (result.rows[0]) return preflight(result.rows[0].configuration, installed)
  }
  const state = await readThemeState(pool, site)
  if (!state.active) return null
  try {
    return preflight(state.active, installed)
  } catch {
    if (!state.previous)
      throw new Error(
        'Active theme is unavailable. Restore the installed package in Capability Center.',
      )
    preflight(state.previous, installed)
    // A concurrent activation wins; never overwrite it during automatic recovery.
    try {
      await changeTheme(
        pool,
        { site, actor: 'system', revision: state.revision, action: 'rollback' },
        installed,
      )
    } catch {
      const latest = await readThemeState(pool, site)
      if (latest.active && latest.revision !== state.revision)
        return preflight(latest.active, installed)
      throw new Error(
        'Theme recovery failed. Restore the previous package and retry from Capability Center.',
      )
    }
    return state.previous
  }
}

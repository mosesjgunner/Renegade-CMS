import type { Payload, Where } from 'payload'
import type { PublicRedirect } from '../../payload-types'

export type RedirectStatusCode = '301' | '302' | '307' | '308'
export type RedirectMatchType = 'exact' | 'prefix' | 'regex'

export type RedirectRuleInput = {
  id?: string
  fromPath: string
  toPath: string
  statusCode?: RedirectStatusCode | string
  match?: RedirectMatchType | string
  preserveQuery?: boolean
  enabled?: boolean
}

export type RedirectValidationResult = {
  valid: boolean
  error?: string
}

export type RedirectImportResult = {
  created: number
  updated: number
  skipped: number
  errors: string[]
  rules: PublicRedirect[]
}

const ALLOWED_STATUSES = new Set(['301', '302', '307', '308'])
const ALLOWED_MATCHES = new Set(['exact', 'prefix', 'regex'])

export function normalizePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return '/'
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function validateRedirectRuleInput(
  rule: RedirectRuleInput,
  existingRules: readonly RedirectRuleInput[] = [],
): RedirectValidationResult {
  const from = normalizePath(rule.fromPath)
  const to = normalizePath(rule.toPath)

  if (!rule.fromPath || !rule.fromPath.trim()) {
    return { valid: false, error: 'Source path (fromPath) is required.' }
  }
  if (!rule.toPath || !rule.toPath.trim()) {
    return { valid: false, error: 'Target path (toPath) is required.' }
  }
  if (from === to) {
    return { valid: false, error: 'A redirect cannot target its own source path.' }
  }

  const statusCode = String(rule.statusCode || '301')
  if (!ALLOWED_STATUSES.has(statusCode)) {
    return {
      valid: false,
      error: `Invalid status code '${statusCode}'. Must be one of 301, 302, 307, 308.`,
    }
  }

  const match = String(rule.match || 'exact')
  if (!ALLOWED_MATCHES.has(match)) {
    return {
      valid: false,
      error: `Invalid match type '${match}'. Must be exact, prefix, or regex.`,
    }
  }

  // Detect direct circular loop with existing rules (e.g. A -> B and B -> A)
  for (const existing of existingRules) {
    if (existing.id && rule.id && existing.id === rule.id) continue
    const exFrom = normalizePath(existing.fromPath)
    const exTo = normalizePath(existing.toPath)

    if (exFrom === to && exTo === from) {
      return {
        valid: false,
        error: `Circular redirect detected: '${from}' targets '${to}', which redirects back to '${from}'.`,
      }
    }
  }

  return { valid: true }
}

export function parseRedirectsCsv(csvText: string): {
  rules: RedirectRuleInput[]
  errors: string[]
} {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return { rules: [], errors: ['CSV content is empty.'] }

  const rules: RedirectRuleInput[] = []
  const errors: string[] = []

  let startIndex = 0
  const headerLine = lines[0].toLowerCase()
  if (headerLine.includes('frompath') || headerLine.includes('from')) {
    startIndex = 1
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('#')) continue
    const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''))

    if (parts.length < 2) {
      errors.push(`Line ${i + 1}: Insufficient columns (expected fromPath, toPath).`)
      continue
    }

    const fromPath = parts[0]
    const toPath = parts[1]
    const statusCode = (parts[2] as RedirectStatusCode) || '301'
    const match = (parts[3] as RedirectMatchType) || 'exact'
    const preserveQuery = parts[4] !== undefined ? parts[4].toLowerCase() === 'true' : true

    const ruleInput: RedirectRuleInput = {
      fromPath,
      toPath,
      statusCode,
      match,
      preserveQuery,
      enabled: true,
    }

    const validation = validateRedirectRuleInput(ruleInput, rules)
    if (!validation.valid) {
      errors.push(`Line ${i + 1}: ${validation.error}`)
    } else {
      rules.push(ruleInput)
    }
  }

  return { rules, errors }
}

export function generateRedirectsCsv(rules: readonly PublicRedirect[]): string {
  const header = 'fromPath,toPath,statusCode,match,preserveQuery,hitCount\n'
  const rows = rules.map((r) => {
    return `"${r.fromPath}","${r.toPath}","${r.statusCode}","${r.match}","${Boolean(r.preserveQuery)}",${r.hitCount || 0}`
  })
  return header + rows.join('\n')
}

export function parseRedirectsJson(jsonText: string): {
  rules: RedirectRuleInput[]
  errors: string[]
} {
  try {
    const parsed = JSON.parse(jsonText)
    const items = Array.isArray(parsed) ? parsed : [parsed]
    const rules: RedirectRuleInput[] = []
    const errors: string[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (typeof item !== 'object' || item === null) {
        errors.push(`Item ${i + 1}: Invalid object.`)
        continue
      }
      const ruleInput: RedirectRuleInput = {
        fromPath: String(item.fromPath || ''),
        toPath: String(item.toPath || ''),
        statusCode: (item.statusCode as RedirectStatusCode) || '301',
        match: (item.match as RedirectMatchType) || 'exact',
        preserveQuery: item.preserveQuery !== undefined ? Boolean(item.preserveQuery) : true,
        enabled: item.enabled !== undefined ? Boolean(item.enabled) : true,
      }
      const validation = validateRedirectRuleInput(ruleInput, rules)
      if (!validation.valid) {
        errors.push(`Item ${i + 1}: ${validation.error}`)
      } else {
        rules.push(ruleInput)
      }
    }
    return { rules, errors }
  } catch (error) {
    return {
      rules: [],
      errors: [
        `JSON parse error: ${error instanceof Error ? error.message : 'Invalid JSON format.'}`,
      ],
    }
  }
}

export function generateRedirectsJson(rules: readonly PublicRedirect[]): string {
  return JSON.stringify(
    rules.map((r) => ({
      id: r.id,
      fromPath: r.fromPath,
      toPath: r.toPath,
      statusCode: r.statusCode,
      match: r.match,
      preserveQuery: r.preserveQuery,
      enabled: r.enabled,
      hitCount: r.hitCount,
      lastHitAt: r.lastHitAt,
    })),
    null,
    2,
  )
}

export function toRedirectInput(rule: PublicRedirect): RedirectRuleInput {
  return {
    id: rule.id,
    fromPath: rule.fromPath,
    toPath: rule.toPath,
    statusCode: rule.statusCode,
    match: rule.match,
    preserveQuery: rule.preserveQuery ?? true,
    enabled: rule.enabled ?? true,
  }
}

export async function listRedirectRules(
  payload: Payload,
  siteId?: string,
): Promise<PublicRedirect[]> {
  const whereClause: Where | undefined = siteId ? { site: { equals: siteId } } : undefined
  const result = await payload.find({
    collection: 'public-redirects',
    where: whereClause,
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs as unknown as PublicRedirect[]
}

export async function importRedirectRules(
  payload: Payload,
  siteId: string,
  rules: readonly RedirectRuleInput[],
): Promise<RedirectImportResult> {
  const existing = await listRedirectRules(payload, siteId)
  const existingInputs = existing.map(toRedirectInput)
  const existingByFrom = new Map(existing.map((r) => [normalizePath(r.fromPath), r]))

  let created = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []
  const resultRules: PublicRedirect[] = []

  for (const rule of rules) {
    const from = normalizePath(rule.fromPath)
    const to = normalizePath(rule.toPath)
    const statusCode = (rule.statusCode as RedirectStatusCode) || '301'
    const match = (rule.match as RedirectMatchType) || 'exact'

    const validation = validateRedirectRuleInput(rule, existingInputs)
    if (!validation.valid) {
      skipped++
      errors.push(`Skipped '${rule.fromPath}': ${validation.error}`)
      continue
    }

    const matchExisting = existingByFrom.get(from)
    if (matchExisting) {
      try {
        const updatedDoc = (await payload.update({
          collection: 'public-redirects',
          id: matchExisting.id,
          data: {
            toPath: to,
            statusCode,
            match,
            preserveQuery: rule.preserveQuery !== undefined ? rule.preserveQuery : true,
            enabled: rule.enabled !== undefined ? rule.enabled : true,
          } as never,
          overrideAccess: true,
        })) as unknown as PublicRedirect
        updated++
        resultRules.push(updatedDoc)
      } catch (err) {
        skipped++
        errors.push(
          `Failed to update '${from}': ${err instanceof Error ? err.message : 'Update failed'}`,
        )
      }
    } else {
      try {
        const createdDoc = (await payload.create({
          collection: 'public-redirects',
          data: {
            site: siteId,
            fromPath: from,
            toPath: to,
            statusCode,
            match,
            preserveQuery: rule.preserveQuery !== undefined ? rule.preserveQuery : true,
            enabled: rule.enabled !== undefined ? rule.enabled : true,
            hitCount: 0,
          } as never,
          overrideAccess: true,
        })) as unknown as PublicRedirect
        created++
        resultRules.push(createdDoc)
      } catch (err) {
        skipped++
        errors.push(
          `Failed to create '${from}': ${err instanceof Error ? err.message : 'Create failed'}`,
        )
      }
    }
  }

  return { created, updated, skipped, errors, rules: resultRules }
}

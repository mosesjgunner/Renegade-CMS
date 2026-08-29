import type { CollectionConfig, GlobalConfig, TaskConfig } from 'payload'

/* Payload task input/output generics differ by task; registration only needs the shared slug. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RegisteredTask = TaskConfig<any>

export type DomainDefinition = {
  id: string
  collections?: readonly CollectionConfig[]
  globals?: readonly GlobalConfig[]
  tasks?: readonly RegisteredTask[]
  description?: string
}

export type PayloadRegistrations = {
  collections: CollectionConfig[]
  globals: GlobalConfig[]
  tasks: RegisteredTask[]
}

const registrations = <T extends { slug: string }>(
  domains: readonly DomainDefinition[],
  key: 'collections' | 'globals' | 'tasks',
): T[] => {
  const seen = new Set<string>()
  const result: T[] = []

  for (const domain of domains) {
    for (const item of (domain[key] ?? []) as unknown as readonly T[]) {
      if (seen.has(item.slug)) throw new Error(`Duplicate ${key.slice(0, -1)} slug: ${item.slug}`)
      seen.add(item.slug)
      result.push(item)
    }
  }

  return result
}

export function composePayloadDomains(domains: readonly DomainDefinition[]): PayloadRegistrations {
  const ids = new Set<string>()

  for (const domain of domains) {
    if (!domain.id.trim()) throw new Error('Payload domain ID must not be empty')
    if (ids.has(domain.id)) throw new Error(`Duplicate payload domain ID: ${domain.id}`)
    ids.add(domain.id)

    if (!domain.collections?.length && !domain.globals?.length && !domain.tasks?.length)
      throw new Error(`Payload domain "${domain.id}" has no registrations`)
  }

  return {
    collections: registrations<CollectionConfig>(domains, 'collections'),
    globals: registrations<GlobalConfig>(domains, 'globals'),
    tasks: registrations<TaskConfig>(domains, 'tasks'),
  }
}

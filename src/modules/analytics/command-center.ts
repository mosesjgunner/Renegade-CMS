export type CommandRole = 'creator' | 'moderator' | 'merchant' | 'analyst' | 'owner'
export type CommandRecord = Readonly<{
  id: string
  kind: string
  title: string
  status: 'open' | 'blocked' | 'failed' | 'scheduled' | 'healthy'
  scope?: string
  ownerId?: string
  action: string
  nextStep: string
  history: readonly string[]
  roles: readonly CommandRole[]
}>
export type CommandCenter = Readonly<{
  role: CommandRole
  sections: Readonly<Record<string, readonly CommandRecord[]>>
  collapsedHealthy: number
}>
const sectionFor = (record: CommandRecord) =>
  record.status === 'failed'
    ? 'provider-and-system-failures'
    : record.status === 'blocked'
      ? 'blocked'
      : record.status === 'scheduled'
        ? 'scheduled-next'
        : record.kind.includes('moderation') || record.kind.includes('discussion')
          ? 'community-needs-response'
          : record.kind.includes('revenue') ||
              record.kind.includes('order') ||
              record.kind.includes('affiliate')
            ? 'revenue'
            : 'attention-today'
export function commandCenter(
  records: readonly CommandRecord[],
  role: CommandRole,
  preferences: { hidden?: readonly string[]; order?: readonly string[] } = {},
): CommandCenter {
  const visible = records.filter((record) => record.roles.includes(role))
  const collapsedHealthy = visible.filter((record) => record.status === 'healthy').length
  const sections: Record<string, CommandRecord[]> = {}
  for (const record of visible.filter((record) => record.status !== 'healthy')) {
    const section = sectionFor(record)
    if (!preferences.hidden?.includes(section)) (sections[section] ??= []).push(record)
  }
  for (const key of preferences.order ?? [])
    if (sections[key]) {
      const value = sections[key]
      delete sections[key]
      sections[key] = value
    }
  return { role, sections, collapsedHealthy }
}

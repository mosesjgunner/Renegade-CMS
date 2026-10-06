/** Private self-auditing is limited to the server-configured application origin. */
export function allowConfiguredSelfAudit(origin: string, appUrl: string | undefined): boolean {
  if (!appUrl) return false
  try {
    const target = new URL(origin)
    return target.origin === new URL(appUrl).origin && ['http:', 'https:'].includes(target.protocol)
  } catch {
    return false
  }
}

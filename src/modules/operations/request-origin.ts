/** Browser-origin guard for the custom admin cookie, including native Payload APIs.
 * Authorization remains in each handler. Non-browser operator clients can omit
 * browser headers; a browser cannot omit Origin on these unsafe requests.
 */
export function trustedAdminMutationOrigin(method: string, headers: Headers, appUrl: string) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return true
  if (!/(?:^|;\s*)renegade-passkey=/.test(headers.get('cookie') ?? '')) return true
  const origin = headers.get('origin')
  const referer = headers.get('referer')
  if (origin === null && referer === null) {
    return !['cross-site', 'same-site'].includes(headers.get('sec-fetch-site') ?? '')
  }
  try {
    const candidate = new URL(origin ?? referer!)
    return candidate.origin === new URL(appUrl).origin
  } catch {
    return false
  }
}

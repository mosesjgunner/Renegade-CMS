/** Explicit isolated ActivityPub peers may share the application's loopback network.
 * Public destinations retain the normal outbound policy. Numeric loopback origins
 * avoid DNS rebinding and can never authorize LAN or metadata-service addresses.
 */
export function isConfiguredLocalPeer(
  target: string,
  configured = process.env.NETWORK_LOCAL_PEER_ORIGINS ?? '',
): boolean {
  const origins = configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const url = new URL(value)
      if (
        url.protocol !== 'https:' ||
        !['127.0.0.1', '[::1]'].includes(url.hostname) ||
        !url.port ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        throw new Error('Local network peers require an HTTPS numeric-loopback origin and port.')
      return url.origin
    })
  return origins.includes(new URL(target).origin)
}

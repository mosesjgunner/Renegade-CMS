/** Synthetic contract only; no network, credentials, or production provider behavior. */
export interface CreatorProviderRequest {
  siteId: string
  actorId: string
  operation: string
  key: string
  requestHash: string
}

export interface CreatorProvider {
  deliver(request: CreatorProviderRequest): Promise<{ remoteId: string }>
}

export function createSyntheticProvider(fail = false): CreatorProvider {
  const requests = new Map<string, { requestHash: string; remoteId: string }>()
  return {
    async deliver(request) {
      if (fail) throw new Error('synthetic provider unavailable')
      const scope = JSON.stringify([
        request.siteId,
        request.actorId,
        request.operation,
        request.key,
      ])
      const previous = requests.get(scope)
      if (previous && previous.requestHash !== request.requestHash) {
        throw new Error('idempotency conflict')
      }
      if (previous) return { remoteId: previous.remoteId }
      const remoteId = `synthetic-${requests.size + 1}`
      requests.set(scope, { requestHash: request.requestHash, remoteId })
      return { remoteId }
    },
  }
}

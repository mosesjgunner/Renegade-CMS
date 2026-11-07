import { readBoundedJson, safeFetch, type Lookup } from '../core/external-boundary'
import { isConfiguredLocalPeer } from './local-peer'
export async function fetchRemoteJson(
  input: string,
  options: { resolve?: Lookup; fetcher?: typeof fetch; allowPrivateDevelopment?: boolean } = {},
) {
  const localPeer = isConfiguredLocalPeer(input)
  const response = await safeFetch(
    input,
    { headers: { accept: 'application/json, application/activity+json, application/ld+json' } },
    {
      ...options,
      allowHttp: false,
      allowPrivate: options.allowPrivateDevelopment || localPeer,
      ...(localPeer ? { maxRedirects: 0 } : {}),
      allowedContentTypes: ['application/json', 'application/activity+json', 'application/ld+json'],
      retries: 2,
    },
  )
  if (!response.ok) throw new Error('Remote request was not accepted.')
  return readBoundedJson(response)
}

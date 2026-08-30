import { readBoundedJson, safeFetch, type Lookup } from '../core/external-boundary'
export async function fetchRemoteJson(
  input: string,
  options: { resolve?: Lookup; fetcher?: typeof fetch; allowPrivateDevelopment?: boolean } = {},
) {
  const response = await safeFetch(
    input,
    { headers: { accept: 'application/json, application/activity+json, application/ld+json' } },
    {
      ...options,
      allowHttp: false,
      allowPrivate: options.allowPrivateDevelopment,
      allowedContentTypes: ['application/json', 'application/activity+json', 'application/ld+json'],
      retries: 2,
    },
  )
  if (!response.ok) throw new Error('Remote request was not accepted.')
  return readBoundedJson(response)
}

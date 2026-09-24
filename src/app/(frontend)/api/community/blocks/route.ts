import { POST as updateRelationship } from '../relationships/route'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  return updateRelationship(
    new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({ ...body, kind: 'block' }),
    }),
  )
}

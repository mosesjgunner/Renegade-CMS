import config from '@payload-config'
import { getPayload } from 'payload'
import { confirmDoubleOptIn } from '@/modules/audience/service'
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string }
  try {
    await confirmDoubleOptIn(await getPayload({ config }), body.token ?? '')
    return Response.json({ status: 'confirmed' })
  } catch {
    return Response.json(
      { error: 'Confirmation link is invalid or already used.' },
      { status: 400 },
    )
  }
}

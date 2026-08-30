import { activityJson, publicationActor } from './actor'
export const dynamic = 'force-dynamic'
export async function GET(_: Request, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params
  const actor = await publicationActor(handle)
  return actor
    ? activityJson(actor.document)
    : Response.json({ error: 'Actor not found.' }, { status: 404 })
}

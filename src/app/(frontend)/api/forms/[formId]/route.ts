/** Public forms remain deferred until their complete operator/visitor path is accepted. */
export async function POST() {
  return Response.json({ error: 'Public forms are deferred for this release.' }, { status: 410 })
}
export async function GET() {
  return Response.json({ error: 'Public forms are deferred for this release.' }, { status: 410 })
}

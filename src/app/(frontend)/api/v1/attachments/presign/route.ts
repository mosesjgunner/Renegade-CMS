export const runtime = 'nodejs'
export async function POST() {
  return Response.json(
    {
      error:
        'Private message attachment uploads are deferred pending configured storage acceptance.',
    },
    { status: 410, headers: { 'cache-control': 'private, no-store' } },
  )
}

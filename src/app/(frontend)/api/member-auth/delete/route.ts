/** Preserve existing data until a governed deletion finalizer is operable. */
export async function POST() {
  return Response.json(
    { error: 'Permanent deletion is deferred. Deactivation is available in member settings.' },
    { status: 410 },
  )
}

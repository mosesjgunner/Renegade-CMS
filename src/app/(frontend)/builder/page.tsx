import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function BuilderIndexPage() {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: await headers() })
  if (!auth.user) redirect('/admin/login')

  let targetLayoutId: string | null = null

  try {
    const layouts = await payload.find({
      collection: 'page-layouts' as never,
      limit: 1,
      sort: '-updatedAt',
      depth: 0,
    })
    const docs = (layouts.docs || []) as Array<{ id: string }>
    if (docs.length > 0 && docs[0]?.id) {
      targetLayoutId = docs[0].id
    }
  } catch {
    // If page-layouts collection is not yet ready or errors, fall through
  }

  if (targetLayoutId) {
    redirect(`/builder/${targetLayoutId}`)
  }

  redirect('/admin/collections/page-layouts')
}

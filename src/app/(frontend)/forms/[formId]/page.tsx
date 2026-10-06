import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import config from '@payload-config'
import { getPayload } from 'payload'
import { publicSiteForHost } from '@/modules/public/site-scope'
import { loadPublicForm } from '@/modules/audience/form-runtime'
import { PublicForm } from '@/modules/audience/PublicForm'

export const dynamic = 'force-dynamic'
export default async function FormPage({ params }: { params: Promise<{ formId: string }> }) {
  const payload = await getPayload({ config })
  const siteId = await publicSiteForHost(payload, (await headers()).get('host'))
  if (!siteId || !payload.collections['form-definitions']) notFound()
  const { formId } = await params
  const result = await payload.find({
    collection: 'form-definitions' as never,
    where: { and: [{ site: { equals: siteId } }, { publicPath: { equals: `/forms/${formId}` } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const loaded = result.docs[0]
    ? await loadPublicForm(payload, String(result.docs[0].id), siteId)
    : null
  if (!loaded) notFound()
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1>{String(loaded.form.title ?? loaded.form.name)}</h1>
      {loaded.form.copy ? <p>{String(loaded.form.copy)}</p> : null}
      <PublicForm
        formId={String(loaded.form.id)}
        fields={loaded.snapshot.fields}
        consentText={loaded.snapshot.consentText}
      />
    </main>
  )
}

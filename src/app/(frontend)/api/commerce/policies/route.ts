import config from '@payload-config'
import { getPayload } from 'payload'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { policyHref, siteMerchantPolicies } from '@/modules/commerce/policies'

export const dynamic = 'force-dynamic'

/** The site's configured merchant policies (type, version, title, link). */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const site = await catalogSiteForHost(payload, request.headers.get('host')).catch(() => '')
  if (!site) return Response.json({ error: 'Store not found.' }, { status: 404 })
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const policies = await siteMerchantPolicies(payload as any, site)
  return Response.json(
    {
      policies: policies.map((policy) => ({
        type: policy.type,
        version: policy.version,
        title: policy.title,
        href: policyHref(policy),
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { siteMerchantPolicies } from '@/modules/commerce/policies'
import type { MerchantPolicyType } from '@/modules/commerce/merchant-config'

export const dynamic = 'force-dynamic'

const TYPES: readonly MerchantPolicyType[] = ['terms', 'privacy', 'returns', 'shipping']

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>
}): Promise<Metadata> {
  const { type } = await params
  return { title: `${type[0].toUpperCase()}${type.slice(1)} policy`, robots: { index: true } }
}

export default async function PolicyPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  if (!TYPES.includes(type as MerchantPolicyType)) notFound()
  const payload = await getPayload({ config })
  const siteId = await catalogSiteForHost(payload, (await headers()).get('host')).catch(() => null)
  if (!siteId) notFound()
  const policies = await siteMerchantPolicies(payload as any, siteId)
  const policy = policies.find((candidate) => candidate.type === type)
  if (!policy) notFound()
  if (policy.url && !policy.body) redirect(policy.url)
  return (
    <main className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-black mb-2">{policy.title}</h1>
      <p className="text-sm text-muted-foreground mb-8">Version {policy.version}</p>
      {policy.body ? (
        <div className="whitespace-pre-wrap leading-relaxed">{policy.body}</div>
      ) : policy.url ? (
        <p>
          This policy is published by the seller at{' '}
          <a className="underline font-semibold" href={policy.url}>
            {policy.url}
          </a>
          .
        </p>
      ) : (
        <p>The seller has not published the text of this policy yet.</p>
      )}
    </main>
  )
}

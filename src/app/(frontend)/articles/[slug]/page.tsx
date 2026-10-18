import CanonicalPage, { generateMetadata as canonicalMetadata } from '../../[...path]/page'

type Args = { params: Promise<{ slug: string }> }
export const dynamic = 'force-dynamic'

// The explicit route must use the same site, revision, entitlement and breadcrumb
// resolver as custom canonical paths; Next routes it before the catch-all.
const canonicalArgs = async ({ params }: Args) => ({
  params: Promise.resolve({ path: ['articles', (await params).slug] }),
})
export async function generateMetadata(args: Args) {
  return canonicalMetadata(await canonicalArgs(args))
}
export default async function ArticlePage(args: Args) {
  return CanonicalPage(await canonicalArgs(args))
}

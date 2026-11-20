import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import POS from './POS'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Point of sale',
  robots: { index: false, follow: false },
}

/**
 * UXI-D10 repair (UXI-09): /pos is an operator surface, so it carries
 * the same server-side staff gate as the frontend /admin layout and
 * /connections — an unauthenticated or non-staff visitor is sent to
 * staff sign-in instead of being shown a till.
 */
export default async function PosPage() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role))) {
    redirect('/login')
  }
  return <POS />
}

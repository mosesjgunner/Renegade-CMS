import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role))) {
    redirect('/login')
  }
  return children
}

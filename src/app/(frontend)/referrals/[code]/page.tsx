import { ReferralConsent } from '@/modules/commerce/ReferralConsent'

export default async function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return (
    <main>
      <h1>Referral disclosure</h1>
      <ReferralConsent code={code} />
    </main>
  )
}

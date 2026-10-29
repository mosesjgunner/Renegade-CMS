import { AffiliateOfferConsent } from '@/modules/commerce/AffiliateOfferConsent'
export default async function AffiliatePage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params
  return (
    <main>
      <h1>Affiliate disclosure</h1>
      <AffiliateOfferConsent offerId={offerId} />
    </main>
  )
}

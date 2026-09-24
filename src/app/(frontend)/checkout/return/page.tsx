import { CheckoutStatus } from '@/modules/commerce/CheckoutStatus'

export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { session = '' } = await searchParams
  return (
    <main>
      <CheckoutStatus sessionId={session} />
    </main>
  )
}

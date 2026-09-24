import { CheckoutStatus } from '@/modules/commerce/CheckoutStatus'

export default async function CheckoutCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { session = '' } = await searchParams
  return (
    <main>
      <CheckoutStatus sessionId={session} cancelled />
    </main>
  )
}

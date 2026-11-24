import { CartView } from '@/modules/commerce/CartView'

export const dynamic = 'force-dynamic'

export default function CheckoutPage() {
  return (
    <div data-checkout-page="true">
      <CartView mode="checkout" />
    </div>
  )
}

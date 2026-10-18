import { CartView } from '@/modules/commerce/CartView'

export const dynamic = 'force-dynamic'

export default function CheckoutPage() {
  return (
    <div data-checkout-page="true">
      <h2 className="sr-only">Checkout</h2>
      <CartView />
    </div>
  )
}

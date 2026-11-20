import type { Metadata } from 'next'

import { CartView } from '@/modules/commerce/CartView'

export const metadata: Metadata = { title: 'Cart' }

export const dynamic = 'force-dynamic'

export default function CartPage() {
  return <CartView />
}

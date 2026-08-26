import Link from 'next/link'

export default function CartPage() {
  return (
    <main className="max-w-4xl mx-auto p-8 space-y-4">
      <h1 className="text-3xl font-black">Cart</h1>
      <p>Your cart is stored server-side and prices are re-quoted at checkout.</p>
      <Link href="/store">Continue shopping</Link>
    </main>
  )
}

'use client'
import { useEffect, useState } from 'react'

export type ShowcaseProduct = {
  id: string
  name: string
  path: string
  price: string
  available: boolean
}

export function LiveProductShowcase() {
  const [products, setProducts] = useState<ShowcaseProduct[]>([])
  const [message, setMessage] = useState('Loading products…')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/catalog', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Catalog unavailable.')
        const body = await response.json()
        setProducts(body.products)
        setMessage(body.products.length ? '' : 'No products are published yet.')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setMessage('Catalog unavailable.')
      })
    return () => controller.abort()
  }, [])
  return (
    <div aria-live="polite">
      {message && <p>{message}</p>}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        {products.map((product) => (
          <article key={product.id} className="rounded border p-4">
            <h4>
              <a href={product.path}>{product.name}</a>
            </h4>
            <p>{product.price}</p>
            <p>{product.available ? 'Available' : 'Unavailable'}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

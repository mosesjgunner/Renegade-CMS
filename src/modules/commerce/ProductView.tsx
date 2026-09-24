import Link from 'next/link'
import {
  affiliateFreshness,
  catalogProductFromDocument,
  formatMinorMoney,
  resolveActiveOffer,
  trackedAffiliateUrl,
} from './catalog'
import { AddToCartControl } from './AddToCartControl'

const id = (value: unknown) =>
  typeof value === 'object' && value !== null
    ? String((value as { id?: unknown }).id ?? '')
    : String(value ?? '')

export function ProductCard({ product }: { product: Record<string, unknown> }) {
  const catalog = catalogProductFromDocument(product)
  const affiliate = catalog.affiliate ? affiliateFreshness(catalog.affiliate) : null
  const offer = resolveActiveOffer(catalog, {
    variantSku: catalog.variants[0]?.sku,
    currency: String(catalog.offers[0]?.currency ?? 'USD'),
  })
  const media = Array.isArray(product.media) ? product.media[0] : undefined
  const mediaId = id(media)
  const alt =
    typeof media === 'object' && media
      ? String((media as Record<string, unknown>).altText ?? catalog.name)
      : catalog.name
  return (
    <article className="surface-card overflow-hidden">
      {mediaId ? (
        <img
          src={`/media/${encodeURIComponent(mediaId)}?variant=thumbnail`}
          alt={alt}
          className="aspect-[4/3] w-full object-cover"
        />
      ) : null}
      <div className="p-5 space-y-3">
        <h2 className="text-xl font-bold">
          <Link href={catalog.canonicalPath}>{catalog.name}</Link>
        </h2>
        {typeof product.summary === 'string' ? <p>{product.summary}</p> : null}
        {affiliate?.price ? (
          <p className="font-semibold">
            {formatMinorMoney(affiliate.price.amountMinor, affiliate.price.currency)} at seller
          </p>
        ) : offer && !catalog.capabilities.includes('affiliate') ? (
          <p className="font-semibold">
            {formatMinorMoney(offer.amountMinor, offer.currency)}{' '}
            <span className="text-sm font-normal">
              {offer.taxDisplay === 'inclusive'
                ? 'tax included'
                : offer.taxDisplay === 'exclusive'
                  ? 'plus applicable tax'
                  : ''}
            </span>
          </p>
        ) : (
          <p>Price unavailable</p>
        )}
        <Link href={catalog.canonicalPath} aria-label={`View ${catalog.name}`}>
          View product
        </Link>
      </div>
    </article>
  )
}

export function ProductDetail({ product }: { product: Record<string, unknown> }) {
  const catalog = catalogProductFromDocument(product)
  const media = Array.isArray(product.media) ? product.media : []
  const firstCurrency = catalog.offers.find((offer) => offer.status === 'active')?.currency ?? 'USD'
  const affiliate = catalog.affiliate ? affiliateFreshness(catalog.affiliate) : null
  return (
    <article className="surface-card p-6 sm:p-10 space-y-8">
      <header className="space-y-3">
        <p>
          <Link href="/store">Store</Link>
        </p>
        <h1 className="text-4xl font-black">{catalog.name}</h1>
        {typeof product.summary === 'string' ? <p className="text-xl">{product.summary}</p> : null}
      </header>
      {media.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {media.map((item, index) => {
            const mediaId = id(item)
            const alt =
              typeof item === 'object' && item
                ? String(
                    (item as Record<string, unknown>).altText ??
                      `${catalog.name} image ${index + 1}`,
                  )
                : `${catalog.name} image ${index + 1}`
            return mediaId ? (
              <img
                key={mediaId}
                src={`/media/${encodeURIComponent(mediaId)}?variant=${index ? 'inline' : 'hero'}`}
                alt={alt}
                className="w-full rounded-lg object-cover"
              />
            ) : null
          })}
        </div>
      ) : null}
      {typeof product.description === 'string' ? (
        <div className="prose dark:prose-invert whitespace-pre-line">{product.description}</div>
      ) : null}
      <section aria-labelledby="purchase-heading" className="space-y-4 border-t pt-6">
        <h2 id="purchase-heading" className="text-2xl font-bold">
          Options and availability
        </h2>
        <ul className="space-y-3">
          {catalog.variants
            .filter((variant) => variant.status !== 'archived')
            .map((variant) => {
              const offer = resolveActiveOffer(catalog, {
                variantSku: variant.sku,
                currency: firstCurrency,
              })
              const unavailable =
                variant.status === 'unavailable' ||
                (variant.inventory?.policy === 'tracked' && variant.inventory.quantity === 0)
              const displayedPrice = catalog.capabilities.includes('affiliate')
                ? affiliate?.price
                : offer
              return (
                <li key={variant.sku} className="rounded border p-4">
                  <strong>{variant.title}</strong> <span>({variant.sku})</span>
                  <br />
                  {displayedPrice ? (
                    <span>
                      {formatMinorMoney(displayedPrice.amountMinor, displayedPrice.currency)} ·{' '}
                      {'taxDisplay' in displayedPrice && displayedPrice.taxDisplay === 'inclusive'
                        ? 'tax included'
                        : 'taxDisplay' in displayedPrice &&
                            displayedPrice.taxDisplay === 'exclusive'
                          ? 'plus applicable tax'
                          : catalog.capabilities.includes('affiliate')
                            ? 'confirm tax at seller'
                            : 'tax not applicable'}
                    </span>
                  ) : (
                    <span>Price unavailable</span>
                  )}
                  <br />
                  <span>
                    {catalog.capabilities.includes('affiliate') && affiliate?.stale
                      ? 'Remote availability unknown; confirm at seller'
                      : unavailable
                        ? 'Unavailable'
                        : variant.inventory?.policy === 'affiliate'
                          ? `Seller availability: ${affiliate?.availability ?? 'unknown'}`
                          : variant.inventory?.policy === 'pod'
                            ? 'Availability confirmed at provider handoff'
                            : 'Available'}
                  </span>
                  {offer?.recurring ? (
                    <span>
                      {' '}
                      · Renews every {offer.recurring.intervalCount} {offer.recurring.interval}
                      {offer.recurring.intervalCount === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </li>
              )
            })}
        </ul>
        {!catalog.capabilities.includes('affiliate') && (
          <AddToCartControl
            productId={String(catalog.id ?? product.id ?? '')}
            productName={catalog.name}
            isDonation={catalog.capabilities.includes('donation')}
            donationMinimumMinor={catalog.offers[0]?.donation?.minimumMinor}
            variants={catalog.variants
              .filter((v) => v.status !== 'archived')
              .map((v) => {
                const off = resolveActiveOffer(catalog, {
                  variantSku: v.sku,
                  currency: firstCurrency,
                })
                return {
                  sku: v.sku,
                  title: v.title,
                  status: v.status,
                  inventoryPolicy: v.inventory?.policy,
                  inventoryQuantity: v.inventory?.quantity,
                  priceMinor: off?.amountMinor ?? '0',
                  currency: off?.currency ?? firstCurrency,
                  unavailable:
                    v.status === 'unavailable' ||
                    (v.inventory?.policy === 'tracked' && v.inventory.quantity === 0),
                }
              })}
          />
        )}
        {catalog.capabilities.includes('affiliate') && catalog.affiliate ? (
          <div className="rounded border p-4 space-y-2">
            <p>
              <strong>Affiliate disclosure:</strong> {catalog.affiliate.disclosure}
            </p>
            <p>
              {affiliate?.stale
                ? 'Remote price and stock have not been verified recently; confirm them at the seller.'
                : `Seller availability: ${affiliate?.availability ?? 'unknown'}.`}
            </p>
            <a
              href={trackedAffiliateUrl(catalog.affiliate)}
              rel="nofollow sponsored noopener"
              target="_blank"
            >
              View at seller <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        ) : (
          <p>
            Checkout availability depends on the site’s enabled payment methods. Product browsing
            and published prices do not require payment credentials.
          </p>
        )}
      </section>
      {Array.isArray(product.disclosures) && product.disclosures.length ? (
        <section aria-labelledby="disclosures">
          <h2 id="disclosures" className="text-xl font-bold">
            Disclosures
          </h2>
          <ul>
            {product.disclosures.map((item, index) => (
              <li key={index}>
                {String(
                  typeof item === 'object' && item
                    ? ((item as Record<string, unknown>).text ?? JSON.stringify(item))
                    : item,
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  )
}

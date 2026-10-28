/** Accept purchase choices only; ownership and money always come from the server. */
export function validateCartMutation(body: unknown, method: string): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid cart payload.'
  const data = body as Record<string, unknown>
  const allowed =
    method === 'POST'
      ? ['productId', 'variantSku', 'quantity', 'donationAmountMinor', 'customOptions']
      : [
          'expectedVersion',
          'lineId',
          'variantSku',
          'quantity',
          'appliedCouponCodes',
          'shippingAddress',
          'billingAddress',
          'selectedShippingRateId',
        ]
  if (Object.keys(data).some((key) => !allowed.includes(key))) return 'Unsupported cart field.'
  if (
    data.variantSku !== undefined &&
    (typeof data.variantSku !== 'string' || !data.variantSku || data.variantSku.length > 200)
  )
    return 'Invalid variant SKU.'
  if (
    data.quantity !== undefined &&
    (typeof data.quantity !== 'number' ||
      !Number.isSafeInteger(data.quantity) ||
      data.quantity < (method === 'POST' ? 1 : 0) ||
      data.quantity > 9999)
  )
    return 'Invalid cart quantity.'
  if (
    data.expectedVersion !== undefined &&
    (typeof data.expectedVersion !== 'number' ||
      !Number.isSafeInteger(data.expectedVersion) ||
      data.expectedVersion < 1)
  )
    return 'Invalid cart version.'
  if (
    data.appliedCouponCodes !== undefined &&
    (!Array.isArray(data.appliedCouponCodes) ||
      data.appliedCouponCodes.length > 20 ||
      data.appliedCouponCodes.some((code) => typeof code !== 'string' || code.length > 100))
  )
    return 'Invalid coupon codes.'
  if (
    data.donationAmountMinor !== undefined &&
    (typeof data.donationAmountMinor !== 'string' || !/^\d{1,12}$/.test(data.donationAmountMinor))
  )
    return 'Invalid donation amount.'
  return null
}

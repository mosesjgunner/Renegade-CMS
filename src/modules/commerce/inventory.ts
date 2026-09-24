export const RESERVATION_TTL_MS = 15 * 60 * 1000 // 15 minutes max

export type InventoryAvailabilityPolicy = 'untracked' | 'tracked' | 'pod' | 'digital' | 'preorder'

export type VariantInventoryRecord = Readonly<{
  productId: string
  variantSku: string
  policy: InventoryAvailabilityPolicy
  quantityAvailable?: number
  allowBackorder?: boolean
  preorderWindow?: Readonly<{
    startsAt: string
    endsAt?: string
    expectedReleaseDate?: string
    maxPreorderQuantity?: number
    currentPreorders?: number
  }>
  podAvailable?: boolean
  digitalAvailable?: boolean
  status?: 'active' | 'unavailable' | 'archived'
}>

export type InventoryReservation = Readonly<{
  id: string
  siteId: string
  cartId: string
  proposalId?: string
  productId: string
  variantSku: string
  quantity: number
  expiresAt: string
  status: 'active' | 'consumed' | 'released' | 'expired'
  createdAt: string
}>

export type AvailabilityCheckResult = Readonly<{
  available: boolean
  policy: InventoryAvailabilityPolicy
  requestedQuantity: number
  availableQuantity?: number
  reason?: string
  isPreorder?: boolean
  expectedReleaseDate?: string
}>

export function checkLineAvailability(
  record: VariantInventoryRecord,
  requestedQuantity: number,
  nowIso = new Date().toISOString(),
): AvailabilityCheckResult {
  if (record.status === 'unavailable' || record.status === 'archived') {
    return {
      available: false,
      policy: record.policy,
      requestedQuantity,
      reason: 'Product variant is unavailable.',
    }
  }

  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity <= 0) {
    return {
      available: false,
      policy: record.policy,
      requestedQuantity,
      reason: 'Requested quantity must be a positive integer.',
    }
  }

  switch (record.policy) {
    case 'untracked':
      return { available: true, policy: 'untracked', requestedQuantity }

    case 'digital':
      if (record.digitalAvailable === false) {
        return {
          available: false,
          policy: 'digital',
          requestedQuantity,
          reason: 'Digital delivery is currently unavailable.',
        }
      }
      return { available: true, policy: 'digital', requestedQuantity }

    case 'pod':
      if (record.podAvailable === false) {
        return {
          available: false,
          policy: 'pod',
          requestedQuantity,
          reason: 'Print-on-demand variant is temporarily out of stock with provider.',
        }
      }
      return { available: true, policy: 'pod', requestedQuantity }

    case 'preorder': {
      const window = record.preorderWindow
      if (!window) {
        return {
          available: false,
          policy: 'preorder',
          requestedQuantity,
          reason: 'Preorder configuration is missing.',
        }
      }
      if (window.startsAt > nowIso) {
        return {
          available: false,
          policy: 'preorder',
          requestedQuantity,
          reason: 'Preorder has not started yet.',
        }
      }
      if (window.endsAt && window.endsAt <= nowIso) {
        return {
          available: false,
          policy: 'preorder',
          requestedQuantity,
          reason: 'Preorder window has closed.',
        }
      }
      if (window.maxPreorderQuantity !== undefined) {
        const current = window.currentPreorders ?? 0
        if (current + requestedQuantity > window.maxPreorderQuantity) {
          return {
            available: false,
            policy: 'preorder',
            requestedQuantity,
            availableQuantity: Math.max(0, window.maxPreorderQuantity - current),
            reason: 'Preorder quantity cap reached.',
          }
        }
      }
      return {
        available: true,
        policy: 'preorder',
        requestedQuantity,
        isPreorder: true,
        expectedReleaseDate: window.expectedReleaseDate,
      }
    }

    case 'tracked': {
      const available = record.quantityAvailable ?? 0
      if (available < requestedQuantity) {
        if (record.allowBackorder) {
          return {
            available: true,
            policy: 'tracked',
            requestedQuantity,
            availableQuantity: available,
          }
        }
        return {
          available: false,
          policy: 'tracked',
          requestedQuantity,
          availableQuantity: Math.max(0, available),
          reason: `Insufficient inventory (only ${Math.max(0, available)} available).`,
        }
      }
      return { available: true, policy: 'tracked', requestedQuantity, availableQuantity: available }
    }

    default:
      return {
        available: false,
        policy: 'untracked',
        requestedQuantity,
        reason: 'Unknown inventory policy.',
      }
  }
}

/**
 * Checks whether an active reservation has expired.
 * Reservations cannot live forever.
 */
export function isReservationExpired(
  reservation: InventoryReservation,
  nowIso = new Date().toISOString(),
): boolean {
  return reservation.status !== 'active' || reservation.expiresAt <= nowIso
}

/**
 * Derives a reservation expiry date safely capped by RESERVATION_TTL_MS.
 */
export function deriveReservationExpiry(fromNowMs = RESERVATION_TTL_MS): string {
  const cap = Math.min(fromNowMs, RESERVATION_TTL_MS)
  return new Date(Date.now() + cap).toISOString()
}

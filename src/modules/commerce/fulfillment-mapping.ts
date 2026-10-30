/* eslint-disable @typescript-eslint/no-explicit-any -- canonical Payload JSON snapshots */
import { createHmac, randomUUID } from 'node:crypto'
import { adapterForPodConnection } from './pod-adapters'
import sharp from 'sharp'
import { loadConfig } from '../core/config'
import { mediaStorage, inspectMedia } from '../media/storage'
import { mediaStorageKey } from '../media/workflow'
import { computeCompositeArtworkHash, validatePodMapping } from './pod-mapping'
import {
  COLOR_FIDELITY_DISCLAIMER,
  computeEffectiveDpi,
  verifySoldPrintRendition,
} from './print-renditions'
import { validateShippingAddressForPod } from './fulfillment-plan'

export const fulfillmentId = (value: any) => String(value?.id ?? value ?? '')
const signingSecret = () => loadConfig().payloadSecret

export async function inspectPodArtwork(payload: any, siteId: string, area: any) {
  const asset = await payload.findByID({
    collection: 'media-assets',
    id: area.mediaAssetId ?? area.artworkRenditionId,
    depth: 0,
    overrideAccess: true,
  })
  if (
    fulfillmentId(asset.site) !== siteId ||
    asset.publicPolicy !== 'private' ||
    asset.rightsStatus !== 'approved' ||
    ['quarantined', 'failed'].includes(asset.processingState) ||
    (asset.rightsExpiresAt && Date.parse(asset.rightsExpiresAt) <= Date.now())
  )
    throw new Error('Artwork must be same-site, private, available and rights-approved.')
  const key = await mediaStorageKey(payload, asset)
  const bytes = key ? await mediaStorage(loadConfig()).get(key) : undefined
  if (!bytes) throw new Error('Artwork original bytes are unavailable.')
  const info = inspectMedia(bytes)
  if (info.mimeType !== 'image/png' || info.sha256 !== asset.checksum)
    throw new Error('Artwork must be a checksum-verified PNG.')
  const metadata = await sharp(bytes, { limitInputPixels: 64000000 }).metadata()
  // Decode actual pixels as well as reading headers. No antivirus/provider processing claim.
  await sharp(bytes, { limitInputPixels: 64000000 }).raw().toBuffer()
  const placement = area.placement
  if (
    !placement ||
    !['topMm', 'leftMm', 'widthMm', 'heightMm'].every(
      (key) => Number.isFinite(placement[key]) && placement[key] >= 0,
    ) ||
    placement.widthMm <= 0 ||
    placement.heightMm <= 0 ||
    !metadata.width ||
    !metadata.height ||
    metadata.width < 1000 ||
    metadata.height < 1000 ||
    Math.min(
      computeEffectiveDpi(metadata.width, placement.widthMm),
      computeEffectiveDpi(metadata.height, placement.heightMm),
    ) < 150
  )
    throw new Error(
      'Artwork dimensions/placement must provide at least 150 effective DPI and 1000 pixels per side.',
    )
  const now = new Date().toISOString()
  const frozen: any = {
    renditionId: asset.id,
    mediaAssetId: asset.id,
    revision: 1,
    hash: info.sha256,
    placement,
    printArea: area.area,
    colorFidelityDisclaimer: COLOR_FIDELITY_DISCLAIMER,
    effectiveDpi: computeEffectiveDpi(metadata.width, placement.widthMm),
    frozenAt: now,
  }
  const raw = [
    frozen.renditionId,
    frozen.mediaAssetId,
    frozen.revision,
    frozen.hash,
    frozen.printArea,
    placement.topMm,
    placement.leftMm,
    placement.widthMm,
    placement.heightMm,
    frozen.effectiveDpi,
    now,
  ].join(';')
  frozen.integritySignature = createHmac('sha256', signingSecret()).update(raw).digest('hex')
  return {
    area: {
      area: area.area,
      artworkRenditionId: asset.id,
      artworkHash: info.sha256,
      artworkRevision: 1,
      placement,
    },
    frozen,
    evidence: {
      mediaAssetId: asset.id,
      checksum: info.sha256,
      width: metadata.width,
      height: metadata.height,
      sizeBytes: bytes.length,
      inspection: 'decoded-private-png',
      antivirus: 'not-claimed',
    },
  }
}

/** Owner/admin reviewed configuration, never a browser-authored approval/status or artwork hash. */
export async function configureFulfillmentMapping(
  payload: any,
  product: any,
  input: any,
  actorId: string,
) {
  const siteId = fulfillmentId(product.site),
    merchantId = fulfillmentId(product.merchantConnection)
  const variant = product.variants?.find((v: any) => v.sku === input.variantSku)
  if (!variant || !['manual', 'pod'].includes(input.mode))
    throw new Error('An existing variant and manual/POD mode are required.')
  const prior = Array.isArray(product.podMappings) ? product.podMappings : []
  const version = Number(prior.find((m: any) => m.variantSku === variant.sku)?.version ?? 0) + 1
  let mapping: any = {
    id: randomUUID(),
    siteId,
    productId: String(product.id),
    variantSku: variant.sku,
    optionValues: variant.optionValues ?? {},
    merchantConnectionId: merchantId,
    mode: input.mode,
    version,
    reviewStatus: 'approved',
    reviewedBy: actorId,
    reviewedAt: new Date().toISOString(),
  }
  if (input.mode === 'pod') {
    const connection = await payload.findByID({
      collection: 'pod-connections',
      id: input.connectionId,
      depth: 0,
      overrideAccess: true,
    })
    if (
      fulfillmentId(connection.site) !== siteId ||
      fulfillmentId(connection.merchantConnection) !== merchantId ||
      connection.status !== 'active'
    )
      throw new Error('Provider must be active and bound to the product site and merchant.')
    if (!['pod-emulator', 'printful', 'printify'].includes(connection.providerKey))
      throw new Error('Unsupported POD provider.')
    if (!Array.isArray(input.printAreas) || !input.printAreas.length || input.printAreas.length > 5)
      throw new Error('Print areas are required.')
    const art = await Promise.all(
      input.printAreas.map((area: any) => inspectPodArtwork(payload, siteId, area)),
    )
    if (
      new Set(art.map((a: any) => a.area.area)).size !== art.length ||
      art.some((a: any) => !connection.capabilities?.supportedPrintAreas?.includes(a.area.area))
    )
      throw new Error('Duplicate or unsupported provider print areas.')
    mapping = {
      ...mapping,
      connectionId: connection.id,
      providerKey: connection.providerKey,
      remoteProductId: String(input.remoteProductId ?? ''),
      remoteVariantId: String(input.remoteVariantId ?? ''),
      printAreas: art.map((a: any) => a.area),
      pinnedArtworkHash: computeCompositeArtworkHash(art.map((a: any) => a.area)),
      artworkRevisionId: art.map((a: any) => a.area.artworkHash).join(':'),
      artworkEvidence: art.map((a: any) => a.evidence),
      soldRenditions: art.map((a: any) => a.frozen),
      mockupProvenance: { source: 'publisher', generatedAt: new Date().toISOString() },
      snapshot: {
        costMinor: String(input.costMinor ?? ''),
        currency: String(input.currency ?? ''),
        available: true,
        observedAt: new Date().toISOString(),
      },
      providerMode:
        connection.providerKey === 'pod-emulator' || process.env.RENEGADE_POD_SIMULATOR_URL
          ? 'deterministic-emulator'
          : 'unverified-external-configuration',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    mapping.snapshot.available = false
    mapping.availabilityEvidence = 'unconfigured-provider-preflight'
    if (connection.providerKey === 'pod-emulator' || process.env.RENEGADE_POD_SIMULATOR_URL) {
      const adapter = adapterForPodConnection(connection)
      const remote = (await adapter.getVariants(mapping.remoteProductId)).find(
        (v) => v.id === mapping.remoteVariantId,
      )
      if (
        !remote ||
        !remote.available ||
        Object.entries(variant.optionValues ?? {}).some(
          ([key, value]) =>
            ['size', 'color'].includes(key) &&
            String(value).toLowerCase() !== String((remote as any)[key]).toLowerCase(),
        )
      )
        throw new Error('Local adapter variant/options are unavailable or do not match.')
      const templates = await adapter.getTemplates(remote.id)
      for (const area of art) {
        const template = templates.find((t) => t.printArea === area.area.area),
          p = area.area.placement
        if (
          !template ||
          p.leftMm < template.printAreaBounds.leftMm ||
          p.topMm < template.printAreaBounds.topMm ||
          p.leftMm + p.widthMm >
            template.printAreaBounds.leftMm + template.printAreaBounds.widthMm ||
          p.topMm + p.heightMm > template.printAreaBounds.topMm + template.printAreaBounds.heightMm
        )
          throw new Error('Artwork placement exceeds the provider template bounds.')
      }
      mapping.providerPreflight = await Promise.all(
        art.map(async (area: any) => {
          const result = await adapter.preflight({
            variantId: remote.id,
            printArea: area.area.area,
            artwork: {
              id: area.area.artworkRenditionId,
              hash: area.area.artworkHash,
              mimeType: 'image/png',
              widthPx: area.evidence.width,
              heightPx: area.evidence.height,
              dpi: area.frozen.effectiveDpi,
            },
            placement: area.area.placement,
          })
          if (!result.passed) throw new Error('Provider preflight rejected artwork.')
          return result
        }),
      )
      mapping.snapshot = {
        costMinor: remote.costMinor,
        currency: remote.currency,
        available: true,
        observedAt: new Date().toISOString(),
      }
      mapping.availabilityEvidence = 'deterministic-emulator-catalog-and-template'
      mapping.providerCapabilities = adapter.capabilities
    }
    const validation = validatePodMapping(mapping, variant)
    if (!validation.valid) throw new Error(validation.issues.join(' '))
  }
  await payload.update({
    collection: 'products',
    id: product.id,
    data: { podMappings: [...prior.filter((m: any) => m.variantSku !== variant.sku), mapping] },
    context: { fulfillmentMappingWrite: true },
    overrideAccess: true,
  })
  return mapping
}

/** Freeze fulfillment facts before any provider payment is initiated; later catalog edits cannot replace them. */
export async function freezeFulfillmentLines(
  payload: any,
  lines: any[],
  products: any[],
  scope: { siteId: string; merchantId: string; currency: string; shipping: any },
) {
  const hasPhysical = lines.some((line: any) => !line.entitlement && line.kind !== 'digital')
  if (hasPhysical) {
    const validation = validateShippingAddressForPod(scope.shipping, true)
    if (!validation.valid) throw new Error(validation.issues.join(' '))
  }
  for (const line of lines) {
    if (line.entitlement || line.kind === 'digital') continue
    const product = products.find((p: any) => String(p.id) === line.productId)
    const variant = product?.variants?.find((v: any) => v.sku === line.variantSku)
    if (
      !product ||
      fulfillmentId(product.site) !== scope.siteId ||
      fulfillmentId(product.merchantConnection) !== scope.merchantId ||
      !variant
    )
      throw new Error('Fulfillment product/site/merchant/variant mismatch.')
    const mappings = Array.isArray(product.podMappings) ? product.podMappings : []
    let mapping = mappings.find((m: any) => m.variantSku === line.variantSku)
    const requiresPod =
      product.productCapabilities?.includes('pod') ||
      ['pod', 'pod-provider'].includes(variant.inventoryPolicy) ||
      product.kind === 'pod'
    if (!mapping && requiresPod)
      throw new Error('POD variant requires a reviewed mapping before checkout.')
    if (!mapping)
      mapping = {
        mode: 'manual',
        siteId: scope.siteId,
        productId: product.id,
        variantSku: variant.sku,
        merchantConnectionId: scope.merchantId,
        version: 1,
        reviewStatus: 'approved',
        source: 'physical-manual-policy',
      }
    if (
      mapping.siteId !== scope.siteId ||
      mapping.productId !== product.id ||
      mapping.merchantConnectionId !== scope.merchantId ||
      mapping.reviewStatus !== 'approved'
    )
      throw new Error('Mapping scope or review does not match the checkout.')
    if (mapping.mode === 'pod') {
      const connection = await payload.findByID({
        collection: 'pod-connections',
        id: mapping.connectionId,
        depth: 0,
        overrideAccess: true,
      })
      if (
        fulfillmentId(connection.site) !== scope.siteId ||
        fulfillmentId(connection.merchantConnection) !== scope.merchantId ||
        connection.providerKey !== mapping.providerKey ||
        connection.status !== 'active' ||
        mapping.snapshot.currency !== scope.currency
      )
        throw new Error('POD provider/site/merchant/currency binding is unavailable.')
      const validation = validatePodMapping(mapping, variant)
      if (!validation.valid) throw new Error(validation.issues.join(' '))
      if (!mapping.snapshot.available)
        throw new Error('Provider variant availability has not been observed.')
      const address = validateShippingAddressForPod(
        scope.shipping,
        Boolean(mapping.providerCapabilities?.supportsPoBoxDelivery),
      )
      if (!address.valid) throw new Error(address.issues.join(' '))
      for (const area of mapping.printAreas) {
        const actual = await inspectPodArtwork(payload, scope.siteId, {
          ...area,
          mediaAssetId: area.artworkRenditionId,
        })
        if (actual.area.artworkHash !== area.artworkHash)
          throw new Error('Mapped artwork changed; a new review is required.')
      }
    }
    line.fulfillmentSnapshot = JSON.parse(JSON.stringify(mapping))
    line.kind = mapping.mode === 'pod' ? 'pod' : 'physical'
  }
  return lines
}

export async function assertFulfillmentOrderEligible(payload: any, order: any) {
  if (
    !['paid', 'fulfilling', 'fulfilled'].includes(order.state) ||
    !order.receipt ||
    order.receipt.state !== 'issued' ||
    BigInt(order.refundExtension?.refundedAmountMinor ?? '0') > 0n
  )
    throw new Error('Only settled, unrefunded, uncancelled orders are eligible for fulfillment.')
  const rows = await payload.find({
    collection: 'payment-intents',
    where: { checkoutSession: { equals: fulfillmentId(order.checkoutSession) } },
    limit: 2,
    depth: 0,
    overrideAccess: true,
  })
  const payment = rows.docs.find(
    (p: any) =>
      p.state === 'paid' &&
      p.amountMinor === order.amountMinor &&
      p.currency === order.currency &&
      fulfillmentId(p.site) === fulfillmentId(order.site) &&
      fulfillmentId(p.merchantConnection) === fulfillmentId(order.merchantConnection) &&
      (p.financialEvents?.some(
        (e: any) => e.kind === 'succeeded' && e.resultingState === 'succeeded',
      ) ||
        (p.cryptoInvoice?.state === 'confirmed' &&
          p.cryptoInvoice.requiredConfirmations >= 1 &&
          p.cryptoInvoice.confirmations >= p.cryptoInvoice.requiredConfirmations &&
          Array.isArray(p.cryptoInvoice.transactionIds) &&
          p.cryptoInvoice.transactionIds.length > 0 &&
          p.cryptoInvoice.detectedAmountAtomic === p.cryptoInvoice.exactAmountAtomic &&
          /^[1-9][0-9]*$/.test(p.cryptoInvoice.exactAmountAtomic))) &&
      !p.financialEvents?.some((e: any) =>
        ['refunded', 'partially-refunded', 'disputed', 'cancelled'].includes(e.kind),
      ),
  )
  if (!payment)
    throw new Error('Verified matching settlement evidence is required for fulfillment.')
}

export async function assertFrozenFulfillment(payload: any, order: any, lines: any[]) {
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1)
      throw new Error('Invalid fulfillment quantity.')
    const mapping = line.fulfillmentSnapshot
    if (!mapping) continue
    if (
      mapping.siteId !== fulfillmentId(order.site) ||
      mapping.productId !== line.productId ||
      mapping.variantSku !== line.variantSku ||
      mapping.merchantConnectionId !== fulfillmentId(order.merchantConnection)
    )
      throw new Error('Frozen fulfillment instructions cross the order site/merchant/variant.')
    if (mapping.mode !== 'pod') continue
    for (const frozen of mapping.soldRenditions ?? []) {
      if (!verifySoldPrintRendition(frozen, signingSecret()))
        throw new Error('Sold artwork integrity check failed.')
      const actual = await inspectPodArtwork(payload, fulfillmentId(order.site), {
        mediaAssetId: frozen.mediaAssetId,
        placement: frozen.placement,
        area: frozen.printArea,
      })
      if (actual.area.artworkHash !== frozen.hash)
        throw new Error('Frozen artwork bytes changed; operator reconciliation is required.')
    }
    if (!mapping.soldRenditions?.length)
      throw new Error('POD instructions require frozen artwork evidence.')
  }
}

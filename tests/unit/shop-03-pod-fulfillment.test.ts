import { describe, expect, it } from 'vitest'
import {
  POD_ADAPTER_CONTRACT_VERSION,
  PodProviderError,
} from '../../src/modules/commerce/pod-contract'
import { PodEmulatorAdapter } from '../../src/modules/commerce/pod-emulator'
import { PrintfulPodAdapter } from '../../src/modules/commerce/pod-real-provider'
import {
  createPodConnection,
  decryptCredential,
  decryptPodConnectionCredentials,
  disablePodConnection,
  getPublicPodConnectionProjection,
  redactSecret,
  rotatePodConnectionCredentials,
} from '../../src/modules/commerce/pod-connection'
import {
  COLOR_FIDELITY_DISCLAIMER,
  freezeSoldPrintRendition,
  validatePrintRendition,
  verifySoldPrintRendition,
  type GovernedPrintRendition,
} from '../../src/modules/commerce/print-renditions'
import {
  remapPodVariant,
  reviewPodMapping,
  validatePodMapping,
  type DetailedPodMapping,
} from '../../src/modules/commerce/pod-mapping'
import {
  buildFulfillmentPlan,
  createPodJobAfterPaidAcceptance,
  isPodJobEligibleForSubmission,
  validateShippingAddressForPod,
  type FulfillmentLineItem,
} from '../../src/modules/commerce/fulfillment-plan'
import {
  applyNormalizedPodEvent,
  reconcilePodJobWithProvider,
  sanitizeTrackingUrl,
} from '../../src/modules/commerce/pod-reconciliation'
import {
  cancelPodJob,
  createReprintPodJob,
  placePodJobOnHold,
  releasePodJobHold,
  submitPodJobWithRetry,
  updatePodJobRecipientAddress,
} from '../../src/modules/commerce/pod-operations'
import {
  acknowledgeManualFulfillmentPackage,
  handoffFailedPodJobToManual,
  MANUAL_FULFILLMENT_DISCLAIMER,
  shipManualFulfillmentPackage,
} from '../../src/modules/commerce/manual-fulfillment'
import type { CatalogVariant } from '../../src/modules/commerce/catalog'

describe('SHOP-03 Print-on-Demand & Fulfillment Contracts', () => {
  const testEncryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

  const sampleRendition: GovernedPrintRendition = {
    id: 'rend-001',
    mediaAssetId: 'med-asset-1',
    revision: 1,
    hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    filename: 'renegade-front.png',
    mimeType: 'image/png',
    sizeBytes: 4 * 1024 * 1024,
    widthPx: 3600,
    heightPx: 4800,
    dpi: 300,
    colorProfile: 'sRGB',
    hasTransparency: true,
    rightsStatus: 'approved',
    rightsExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    malwareStatus: 'clean',
    publicOriginal: false,
    reviewStatus: 'approved',
    approvedBy: 'art_director',
    approvedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const sampleCatalogVariant: CatalogVariant = {
    sku: 'SHIRT-M-BLK',
    title: 'Renegade Heavyweight Tee - M / Black',
    optionValues: { size: 'm', color: 'black' },
    status: 'active',
    weightGrams: 220,
    dimensionsMm: { length: 290, width: 210, height: 15 },
    inventory: { policy: 'pod' },
  }

  const sampleMapping: DetailedPodMapping = {
    id: 'map-tee-m-blk',
    siteId: 'site-party',
    productId: 'prod-tee',
    variantSku: 'SHIRT-M-BLK',
    optionValues: { size: 'm', color: 'black' },
    providerKey: 'pod-emulator',
    remoteProductId: 'emu-tee-101',
    remoteVariantId: 'emu-tee-m-blk',
    printAreas: [
      {
        area: 'front',
        artworkRenditionId: sampleRendition.id,
        artworkHash: sampleRendition.hash,
        artworkRevision: 1,
        placement: { topMm: 50, leftMm: 50, widthMm: 280, heightMm: 380 },
      },
    ],
    pinnedArtworkHash: 'c85fe62be71844b3602167d3077755866dc64971c2266dbad22a1547ddb7325b', // composite hash for area front
    artworkRevisionId: 'rev-front-1',
    mockupProvenance: {
      source: 'provider',
      generatedAt: new Date().toISOString(),
      url: 'https://emulator.renegade.internal/mockups/tee.png',
    },
    snapshot: {
      costMinor: '1250',
      currency: 'USD',
      available: true,
      observedAt: new Date().toISOString(),
    },
    reviewStatus: 'approved',
    reviewedBy: 'merch_lead',
    reviewedAt: new Date().toISOString(),
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  // Calculate matching composite hash
  const renditionsMap = new Map([[sampleRendition.id, sampleRendition]])

  // --- 1. Versioned Adapter & Deterministic Emulator ---
  describe('1. Versioned POD Adapter & Deterministic Emulator', () => {
    const emulator = new PodEmulatorAdapter()

    it('declares the contract version shop-03.v1 and complete capability matrix', () => {
      expect(emulator.contractVersion).toBe(POD_ADAPTER_CONTRACT_VERSION)
      expect(emulator.contractVersion).toBe('shop-03.v1')
      expect(emulator.capabilities.supportedPrintAreas).toContain('front')
      expect(emulator.capabilities.supportsCancellation).toBe(true)
      expect(emulator.capabilities.supportsPartialShipments).toBe(true)
      expect(emulator.capabilities.supportsPoBoxDelivery).toBe(false)
    })

    it('performs health checks and supports degradation simulation', async () => {
      expect((await emulator.health()).ready).toBe(true)
      emulator.setHealth(false, 'Simulated maintenance window')
      const down = await emulator.health()
      expect(down.ready).toBe(false)
      expect(down.health).toBe('unavailable')
      expect(down.reason).toBe('Simulated maintenance window')
      emulator.reset()
      expect((await emulator.health()).ready).toBe(true)
    })

    it('returns catalog, variants, and print area templates deterministically', async () => {
      const catalog = await emulator.getCatalog()
      expect(catalog.length).toBeGreaterThan(0)
      const tee = catalog.find((c) => c.id === 'emu-tee-101')
      expect(tee?.name).toBe('Renegade Heavyweight Cotton Tee')

      const variants = await emulator.getVariants('emu-tee-101')
      expect(variants.some((v) => v.sku === 'EMU-TEE-M-BLK')).toBe(true)

      const templates = await emulator.getTemplates('emu-tee-m-blk')
      expect(templates.find((t) => t.printArea === 'front')?.minDpi).toBe(150)
    })

    it('validates file formats, minimum 150 DPI, and dimensions', async () => {
      const valid = await emulator.validateFile({
        filename: 'graphic.png',
        mimeType: 'image/png',
        sizeBytes: 2048000,
        widthPx: 3000,
        heightPx: 4000,
        dpi: 300,
      })
      expect(valid.valid).toBe(true)

      const lowDpi = await emulator.validateFile({
        filename: 'low.png',
        mimeType: 'image/png',
        sizeBytes: 500000,
        widthPx: 500,
        heightPx: 500,
        dpi: 72,
      })
      expect(lowDpi.valid).toBe(false)
      expect(lowDpi.issues.some((i) => i.includes('below the required 150 DPI'))).toBe(true)
      expect(lowDpi.issues.some((i) => i.includes('1000x1000 pixels'))).toBe(true)
    })

    it('performs preflight check, effective DPI calculation, and mockup provenance', async () => {
      const preflight = await emulator.preflight({
        variantId: 'emu-tee-m-blk',
        printArea: 'front',
        artwork: {
          id: 'art-1',
          hash: 'hash-abc',
          mimeType: 'image/png',
          widthPx: 3600,
          heightPx: 4800,
          dpi: 300,
        },
        placement: { topMm: 50, leftMm: 50, widthMm: 280, heightMm: 380 },
      })
      expect(preflight.passed).toBe(true)
      expect(preflight.effectiveDpi).toBeGreaterThanOrEqual(300)
      expect(preflight.provenance.source).toBe('provider')
      expect(preflight.mockupUrl).toBeDefined()
    })

    it('estimates costs deterministically', async () => {
      const estimate = await emulator.estimateCost({
        variantId: 'emu-tee-m-blk',
        quantity: 2,
        recipientAddress: { country: 'US', state: 'TX', postalCode: '78701' },
      })
      expect(estimate.productionCostMinor).toBe('2500')
      expect(estimate.shippingCostMinor).toBe('450')
      expect(estimate.totalCostMinor).toBe('2950')
      expect(estimate.currency).toBe('USD')
    })
  })

  // --- 2. Configured Real Provider Boundaries & Opt-In Guard ---
  describe('2. Configured Real Provider Boundaries & Opt-In Guard', () => {
    it('enforces live creation protection and excludes live creation from tests', async () => {
      const realAdapter = new PrintfulPodAdapter({
        apiKey: 'prn_live_test_api_token_12345',
        storeId: 'store_99',
        allowLiveCreation: false, // Default: live creation blocked!
      })

      expect(realAdapter.key).toBe('printful')
      expect(realAdapter.metadata.liveCreationOptInRequired).toBe(true)

      // Submitting without explicit opt-in throws configuration error
      await expect(
        realAdapter.createOrder({
          orderId: 'ord-test',
          idempotencyKey: 'idem-1',
          recipient: {
            name: 'Test Buyer',
            address1: '123 Main St',
            city: 'Portland',
            postalCode: '97201',
            country: 'US',
          },
          items: [
            {
              variantId: 'sync-1',
              quantity: 1,
              printAreas: [],
            },
          ],
        }),
      ).rejects.toThrow('Live Printful order creation is protected')
    })
  })

  // --- 3. Encrypted Least-Privilege Connection & Redaction ---
  describe('3. Encrypted Least-Privilege Connection & Redaction', () => {
    it('encrypts API tokens at rest using AES-256-GCM and redacts keys in public views', () => {
      const conn = createPodConnection(
        {
          id: 'conn-pf-1',
          siteId: 'site-party',
          providerKey: 'printful',
          label: 'Printful Merch',
          apiKey: 'prn_token_super_secret_abcdef123456',
          webhookSecret: 'whsec_999888777666',
          capabilities: emulatorCapabilities(),
        },
        testEncryptionKey,
      )

      expect(conn.encryptedApiKey).not.toContain('super_secret')
      expect(conn.encryptedApiKey.split(':')).toHaveLength(3) // iv:tag:ciphertext

      // Decrypt verifies original secret
      const decrypted = decryptPodConnectionCredentials(conn, testEncryptionKey)
      expect(decrypted.apiKey).toBe('prn_token_super_secret_abcdef123456')
      expect(decrypted.webhookSecret).toBe('whsec_999888777666')

      // Public projection hides secret completely and presents redaction
      const publicView = getPublicPodConnectionProjection(conn, testEncryptionKey)
      expect(publicView.redactedApiKey).toBe('prn_***3456')
      expect((publicView as any).encryptedApiKey).toBeUndefined()
    })

    it('rotates credentials safely and supports safe disable', () => {
      const conn = createPodConnection(
        {
          id: 'conn-pf-2',
          siteId: 'site-party',
          providerKey: 'printful',
          label: 'Printful Merch',
          apiKey: 'prn_old_key_12345678',
          capabilities: emulatorCapabilities(),
        },
        testEncryptionKey,
      )

      const rotated = rotatePodConnectionCredentials(
        conn,
        { apiKey: 'prn_new_key_87654321', webhookSecret: 'wh_new_secret' },
        testEncryptionKey,
      )
      expect(decryptCredential(rotated.encryptedApiKey, testEncryptionKey)).toBe(
        'prn_new_key_87654321',
      )

      const disabled = disablePodConnection(rotated, 'Provider billing suspended')
      expect(disabled.status).toBe('disabled')
      expect(disabled.disabledReason).toBe('Provider billing suspended')
    })
  })

  // --- 4. Private Governed Print Renditions & Immutable Sold Snapshots ---
  describe('4. Governed Print Renditions & Immutable Sold Snapshots', () => {
    it('validates DPI, dimensions, clean malware status, approved rights, and private originals', () => {
      const valid = validatePrintRendition(sampleRendition)
      expect(valid.valid).toBe(true)

      // Rejects public original (must be private!)
      const publicOrig = validatePrintRendition({
        ...sampleRendition,
        publicOriginal: true as any,
      })
      expect(publicOrig.valid).toBe(false)
      expect(publicOrig.issues.some((i) => i.includes('publicOriginal must be false'))).toBe(true)

      // Rejects unapproved rights or malware
      const infected = validatePrintRendition({
        ...sampleRendition,
        malwareStatus: 'infected',
      })
      expect(infected.valid).toBe(false)

      const unapprovedRights = validatePrintRendition({
        ...sampleRendition,
        rightsStatus: 'restricted',
      })
      expect(unapprovedRights.valid).toBe(false)

      // Rejects expired rights
      const expired = validatePrintRendition({
        ...sampleRendition,
        rightsExpiresAt: new Date(Date.now() - 1000).toISOString(),
      })
      expect(expired.valid).toBe(false)
    })

    it('enforces color fidelity disclaimer and freezes immutable sold snapshot', () => {
      expect(COLOR_FIDELITY_DISCLAIMER).toContain('No color-fidelity promise')

      const soldSnapshot = freezeSoldPrintRendition(
        sampleRendition,
        { topMm: 50, leftMm: 50, widthMm: 280, heightMm: 380 },
        'front',
      )

      expect(soldSnapshot.colorFidelityDisclaimer).toBe(COLOR_FIDELITY_DISCLAIMER)
      expect(soldSnapshot.effectiveDpi).toBeGreaterThanOrEqual(300)
      expect(verifySoldPrintRendition(soldSnapshot)).toBe(true)

      // Subsequent alterations to the snapshot are caught by signature verification
      const tampered = { ...soldSnapshot, hash: 'malicious_tampered_hash' }
      expect(verifySoldPrintRendition(tampered)).toBe(false)
    })
  })

  // --- 5. POD Mapping Validation & Deliberate Remap ---
  describe('5. POD Mapping Validation & Deliberate Remap', () => {
    it('rejects mapping when option values mismatch catalog variant', () => {
      const mismatchedVariant: CatalogVariant = {
        ...sampleCatalogVariant,
        optionValues: { size: 'l', color: 'black' }, // Variant is Large, mapping is Medium
      }

      const check = validatePodMapping(sampleMapping, mismatchedVariant, renditionsMap)
      expect(check.valid).toBe(false)
      expect(check.issues.some((i) => i.includes('do not exactly match canonical variant'))).toBe(
        true,
      )
    })

    it('rejects mapping when artwork hash does not match rendition', () => {
      const badHashMap: DetailedPodMapping = {
        ...sampleMapping,
        printAreas: [
          {
            ...sampleMapping.printAreas[0]!,
            artworkHash: 'corrupted_hash',
          },
        ],
      }

      const check = validatePodMapping(badHashMap, sampleCatalogVariant, renditionsMap)
      expect(check.valid).toBe(false)
      expect(check.issues.some((i) => i.includes('Artwork hash mismatch'))).toBe(true)
    })

    it('allows deliberate remap that increments version and returns to pending review', () => {
      const remapped = remapPodVariant(
        sampleMapping,
        {
          remoteVariantId: 'emu-tee-m-blk-v2',
        },
        {
          approvedBy: 'lead_designer',
          justification: 'Switched to updated blank with narrower neckline',
        },
      )

      expect(remapped.version).toBe(2)
      expect(remapped.reviewStatus).toBe('pending')
      expect(remapped.remoteVariantId).toBe('emu-tee-m-blk-v2')
      expect(remapped.reviewNotes).toContain('Switched to updated blank')

      // Deliberate approval
      const reviewed = reviewPodMapping(remapped, {
        status: 'approved',
        reviewedBy: 'ops_lead',
        notes: 'Approved new blank',
      })
      expect(reviewed.reviewStatus).toBe('approved')
    })
  })

  // --- 6. FulfillmentPlan Splitting & Exactly-One PODJob Creation ---
  describe('6. FulfillmentPlan Splitting & Exactly-One PODJob Creation', () => {
    const activeConn = createPodConnection(
      {
        id: 'conn-emu-1',
        siteId: 'site-party',
        providerKey: 'pod-emulator',
        label: 'Emulator',
        apiKey: 'emu_key_123',
        capabilities: emulatorCapabilities(),
      },
      testEncryptionKey,
    )

    const disabledConn = disablePodConnection(
      createPodConnection(
        {
          id: 'conn-pf-disabled',
          siteId: 'site-party',
          providerKey: 'printful',
          label: 'Printful Disabled',
          apiKey: 'pf_key_123',
          capabilities: emulatorCapabilities(),
        },
        testEncryptionKey,
      ),
      'Account suspended',
    )

    const connectionsMap = new Map([
      ['pod-emulator', activeConn],
      ['printful', disabledConn],
    ])

    const podLine: FulfillmentLineItem = {
      lineId: 'line-1',
      productId: 'prod-tee',
      variantSku: 'SHIRT-M-BLK',
      title: 'Renegade Tee',
      quantity: 1,
      unitPriceMinor: '2800',
      lineAmountMinor: '2800',
      kind: 'pod',
      podMapping: sampleMapping,
      soldRenditions: [
        freezeSoldPrintRendition(
          sampleRendition,
          { topMm: 50, leftMm: 50, widthMm: 280, heightMm: 380 },
          'front',
        ),
      ],
    }

    const disabledLine: FulfillmentLineItem = {
      ...podLine,
      lineId: 'line-2',
      podMapping: {
        ...sampleMapping,
        providerKey: 'printful',
      },
    }

    const digitalLine: FulfillmentLineItem = {
      lineId: 'line-3',
      productId: 'prod-album',
      variantSku: 'ALBUM-FLAC',
      title: 'Party Album',
      quantity: 1,
      unitPriceMinor: '1500',
      lineAmountMinor: '1500',
      kind: 'digital',
    }

    const validAddress = {
      name: 'Robin Hunter',
      address1: '789 Congress Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    }

    it('splits lines into provider POD, manual fallback, and digital grants', () => {
      const plan = buildFulfillmentPlan({
        orderId: 'order_1001',
        siteId: 'site-party',
        currency: 'USD',
        recipientAddress: validAddress,
        items: [podLine, disabledLine, digitalLine],
        connectionsByProviderKey: connectionsMap,
      })

      // 1 provider package for active emulator
      expect(plan.providerJobs).toHaveLength(1)
      expect(plan.providerJobs[0]?.providerKey).toBe('pod-emulator')

      // 1 manual package because printful provider is disabled!
      expect(plan.manualPackages).toHaveLength(1)
      expect(plan.manualPackages[0]?.reason).toBe('provider-disabled')

      // 1 digital grant
      expect(plan.digitalGrants).toHaveLength(1)
    })

    it('enforces Authoritative Paid Acceptance before creating PODJob', () => {
      const plan = buildFulfillmentPlan({
        orderId: 'order_1002',
        siteId: 'site-party',
        currency: 'USD',
        recipientAddress: validAddress,
        items: [podLine],
        connectionsByProviderKey: connectionsMap,
      })

      // Cannot create PODJob if payment is pending or authorized only
      expect(() =>
        createPodJobAfterPaidAcceptance({
          plan,
          packageIndex: 0,
          orderPaymentState: 'pending-payment',
        }),
      ).toThrow('payment status is "pending-payment", must be "paid"')

      // Succeeded payment creates PODJob in on_hold state with hold window
      const job = createPodJobAfterPaidAcceptance({
        plan,
        packageIndex: 0,
        orderPaymentState: 'paid',
        holdWindowMs: 3600000,
      })
      expect(job.state).toBe('on_hold')
      expect(job.holdExpiresAt).toBeDefined()
      expect(job.attemptCount).toBe(0)
    })

    it('enforces PO box rejection at the address boundary', () => {
      const poBoxAddress = {
        name: 'John Doe',
        address1: 'P.O. Box 456',
        city: 'Austin',
        postalCode: '78701',
        country: 'US',
      }
      const check = validateShippingAddressForPod(poBoxAddress, false)
      expect(check.valid).toBe(false)
      expect(check.policy).toBe('po-box-rejected')
    })
  })

  // --- 7. Hold Window, Address Boundary & Cancel Deadline ---
  describe('7. Hold Window, Address Boundary & Cancel Deadline', () => {
    const emulator = new PodEmulatorAdapter()
    const validAddress = {
      name: 'Robin Hunter',
      address1: '789 Congress Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    }

    const podLine: FulfillmentLineItem = {
      lineId: 'line-1',
      productId: 'prod-tee',
      variantSku: 'SHIRT-M-BLK',
      title: 'Renegade Tee',
      quantity: 1,
      unitPriceMinor: '2800',
      lineAmountMinor: '2800',
      kind: 'pod',
      podMapping: sampleMapping,
      soldRenditions: [
        freezeSoldPrintRendition(
          sampleRendition,
          { topMm: 50, leftMm: 50, widthMm: 280, heightMm: 380 },
          'front',
        ),
      ],
    }

    const plan = buildFulfillmentPlan({
      orderId: 'order_hold_test',
      siteId: 'site-party',
      currency: 'USD',
      recipientAddress: validAddress,
      items: [podLine],
      connectionsByProviderKey: new Map([
        [
          'pod-emulator',
          createPodConnection(
            {
              id: 'c1',
              siteId: 'site-party',
              providerKey: 'pod-emulator',
              label: 'Emulator',
              apiKey: 'key',
              capabilities: emulatorCapabilities(),
            },
            testEncryptionKey,
          ),
        ],
      ]),
    })

    it('allows hold release and hold placement', () => {
      const job = createPodJobAfterPaidAcceptance({
        plan,
        packageIndex: 0,
        orderPaymentState: 'paid',
        holdWindowMs: 3600000,
      })
      expect(job.state).toBe('on_hold')
      expect(isPodJobEligibleForSubmission(job)).toBe(false)

      const released = releasePodJobHold(job, 'operator_override')
      expect(released.state).toBe('created')
      expect(isPodJobEligibleForSubmission(released)).toBe(true)

      const putOnHold = placePodJobOnHold(released, 'Customer requested hold to check size')
      expect(putOnHold.state).toBe('on_hold')
      expect(isPodJobEligibleForSubmission(putOnHold)).toBe(false)
    })

    it('enforces address boundary: allows address update during hold, rejects after submission', async () => {
      const job = createPodJobAfterPaidAcceptance({
        plan,
        packageIndex: 0,
        orderPaymentState: 'paid',
        holdWindowMs: 3600000,
      })

      // While on hold, address update succeeds and re-hashes payload
      const updatedAddress = { ...validAddress, address1: '900 Colorado St' }
      const updatedJob = updatePodJobRecipientAddress(job, updatedAddress)
      expect(updatedJob.recipientSnapshot.address1).toBe('900 Colorado St')
      expect(updatedJob.payloadHash).not.toBe(job.payloadHash)

      // Release hold and submit to provider
      const released = releasePodJobHold(updatedJob)
      const submitOutcome = await submitPodJobWithRetry({
        job: released,
        adapter: emulator,
      })
      expect(submitOutcome.success).toBe(true)
      const submittedJob = submitOutcome.job
      expect(submittedJob.state).toBe('submitted')

      // Once submitted, modifying address violates boundary and throws!
      expect(() =>
        updatePodJobRecipientAddress(submittedJob, { ...validAddress, address1: 'New St' }),
      ).toThrow('Address boundary violation')
    })

    it('enforces cancel deadline: allows cancel before production, rejects in production', async () => {
      const job = createPodJobAfterPaidAcceptance({
        plan,
        packageIndex: 0,
        orderPaymentState: 'paid',
        holdWindowMs: 0, // No hold
      })

      const submitOutcome = await submitPodJobWithRetry({ job, adapter: emulator })
      expect(submitOutcome.success).toBe(true)
      const submittedJob = submitOutcome.job

      // Advance emulator state to in_production
      emulator.advanceOrderState(submittedJob.externalOrderId!, 'in_production')

      // Attempting to cancel in production is rejected!
      await expect(cancelPodJob(submittedJob, emulator, 'Customer changed mind')).rejects.toThrow(
        'Provider rejected cancellation',
      )
    })
  })

  // --- 8. Event Reducer, Disorder, Partial Shipments & Safe Tracking ---
  describe('8. Event Reducer, Disorder, Partial Shipments & Safe Tracking', () => {
    const emulator = new PodEmulatorAdapter()
    const validAddress = {
      name: 'Robin Hunter',
      address1: '789 Congress Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    }

    const podLines: FulfillmentLineItem[] = [
      {
        lineId: 'line-1',
        productId: 'prod-tee',
        variantSku: 'SHIRT-M-BLK',
        title: 'Renegade Tee',
        quantity: 1,
        unitPriceMinor: '2800',
        lineAmountMinor: '2800',
        kind: 'pod',
        podMapping: sampleMapping,
      },
      {
        lineId: 'line-2',
        productId: 'prod-mug',
        variantSku: 'MUG-BLK',
        title: 'Renegade Mug',
        quantity: 1,
        unitPriceMinor: '1600',
        lineAmountMinor: '1600',
        kind: 'pod',
        podMapping: {
          ...sampleMapping,
          variantSku: 'MUG-BLK',
          optionValues: { size: 'standard', color: 'black' },
          remoteProductId: 'emu-mug-202',
          remoteVariantId: 'emu-mug-blk',
        },
      },
    ]

    const plan = buildFulfillmentPlan({
      orderId: 'order_evt_test',
      siteId: 'site-party',
      currency: 'USD',
      recipientAddress: validAddress,
      items: podLines,
      connectionsByProviderKey: new Map([
        [
          'pod-emulator',
          createPodConnection(
            {
              id: 'c1',
              siteId: 'site-party',
              providerKey: 'pod-emulator',
              label: 'Emulator',
              apiKey: 'key',
              capabilities: emulatorCapabilities(),
            },
            testEncryptionKey,
          ),
        ],
      ]),
    })

    it('absorbs out-of-order events without regressing terminal or later states', () => {
      const job = createPodJobAfterPaidAcceptance({
        plan,
        packageIndex: 0,
        orderPaymentState: 'paid',
        holdWindowMs: 0,
      })

      // 1. Shipped event arrives first (out of order, before in_production)
      const shippedEvent = {
        providerEventId: 'evt-shipped-1',
        providerKey: 'pod-emulator',
        externalOrderId: 'emu_ord_123',
        kind: 'shipped' as const,
        occurredAt: new Date().toISOString(),
        tracking: {
          carrier: 'USPS',
          trackingNumber: '9400100000000000000000',
          trackingUrl:
            'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400100000000000000000',
        },
        rawEvidence: {},
      }

      const jobShipped = applyNormalizedPodEvent(job, shippedEvent)
      expect(jobShipped.state).toBe('shipped')

      // 2. Delayed in_production event arrives later -> Monotonicity prevents regressing back to in_production!
      const delayedEvent = {
        providerEventId: 'evt-prod-1',
        providerKey: 'pod-emulator',
        externalOrderId: 'emu_ord_123',
        kind: 'in_production' as const,
        occurredAt: new Date(Date.now() - 10000).toISOString(),
        rawEvidence: {},
      }

      const jobAfterDelayed = applyNormalizedPodEvent(jobShipped, delayedEvent)
      expect(jobAfterDelayed.state).toBe('shipped') // Remains shipped!
    })

    it('tracks partial shipments and promotes to shipped when all lines are fulfilled', () => {
      const job = createPodJobAfterPaidAcceptance({
        plan,
        packageIndex: 0,
        orderPaymentState: 'paid',
        holdWindowMs: 0,
      })

      // Ship package 1: line 0 only
      const partialEvent = {
        providerEventId: 'evt-part-1',
        providerKey: 'pod-emulator',
        externalOrderId: 'emu_ord_123',
        kind: 'partially_shipped' as const,
        occurredAt: new Date().toISOString(),
        fulfillments: [
          {
            fulfillmentId: 'ful-1',
            status: 'shipped' as const,
            lineIndices: [0],
            carrier: 'USPS',
            trackingNumber: '9400111111111111111111',
          },
        ],
        rawEvidence: {},
      }

      const jobPartiallyShipped = applyNormalizedPodEvent(job, partialEvent)
      expect(jobPartiallyShipped.state).toBe('partially_shipped')

      // Ship package 2: line 1
      const secondShipmentEvent = {
        providerEventId: 'evt-part-2',
        providerKey: 'pod-emulator',
        externalOrderId: 'emu_ord_123',
        kind: 'partially_shipped' as const,
        occurredAt: new Date().toISOString(),
        fulfillments: [
          {
            fulfillmentId: 'ful-2',
            status: 'shipped' as const,
            lineIndices: [1],
            carrier: 'UPS',
            trackingNumber: '1Z9999999999999999',
          },
        ],
        rawEvidence: {},
      }

      const jobFullyShipped = applyNormalizedPodEvent(jobPartiallyShipped, secondShipmentEvent)
      expect(jobFullyShipped.state).toBe('shipped')
    })

    it('sanitizes tracking URLs against injection attacks and allows verified carrier domains', () => {
      // Rejects javascript: protocol
      expect(sanitizeTrackingUrl('javascript:alert(1)', 'USPS', '9400100000')).toBe(
        'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400100000',
      )

      // Rejects unapproved malicious domains
      expect(sanitizeTrackingUrl('https://evil-phishing.com/track', 'USPS', '9400100000')).toBe(
        'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400100000',
      )

      // Preserves verified carrier domain
      const safeUsps = 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400100000'
      expect(sanitizeTrackingUrl(safeUsps, 'USPS', '9400100000')).toBe(safeUsps)
    })
  })

  // --- 9. Failure, Retry, Manual Handoff & Reprint ---
  describe('9. Failure, Retry, Manual Handoff & Reprint', () => {
    it('exhausts retries and transitions to Explicit Manual Fulfillment Package with declaration', async () => {
      const failingAdapter = new PodEmulatorAdapter()
      failingAdapter.setHealth(false, 'Network connection refused')

      const validAddress = {
        name: 'Robin Hunter',
        address1: '789 Congress Ave',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'US',
      }

      const plan = buildFulfillmentPlan({
        orderId: 'order_fail_test',
        siteId: 'site-party',
        currency: 'USD',
        recipientAddress: validAddress,
        items: [
          {
            lineId: 'line-1',
            productId: 'prod-tee',
            variantSku: 'SHIRT-M-BLK',
            title: 'Renegade Tee',
            quantity: 1,
            unitPriceMinor: '2800',
            lineAmountMinor: '2800',
            kind: 'pod',
            podMapping: sampleMapping,
          },
        ],
        connectionsByProviderKey: new Map([
          [
            'pod-emulator',
            createPodConnection(
              {
                id: 'c1',
                siteId: 'site-party',
                providerKey: 'pod-emulator',
                label: 'Emulator',
                apiKey: 'key',
                capabilities: emulatorCapabilities(),
              },
              testEncryptionKey,
            ),
          ],
        ]),
      })

      let job = createPodJobAfterPaidAcceptance({
        plan,
        packageIndex: 0,
        orderPaymentState: 'paid',
        holdWindowMs: 0,
      })

      // Attempt 1 -> retryable
      const res1 = await submitPodJobWithRetry({ job, adapter: failingAdapter })
      expect(res1.success).toBe(false)
      if (res1.success) throw new Error('Expected the first POD attempt to fail.')
      expect(res1.retryable).toBe(true)
      expect(res1.handoffRequired).toBe(false)
      job = res1.job

      // Attempt 2 -> retryable
      const res2 = await submitPodJobWithRetry({ job, adapter: failingAdapter })
      job = res2.job
      expect(job.attemptCount).toBe(2)

      // Attempt 3 -> max attempts exhausted -> triggers handoff!
      const res3 = await submitPodJobWithRetry({ job, adapter: failingAdapter })
      expect(res3.success).toBe(false)
      if (res3.success) throw new Error('Expected the exhausted POD attempt to fail.')
      expect(res3.handoffRequired).toBe(true)
      expect(res3.job.state).toBe('failed')

      // Convert to Explicit Manual Fulfillment Package
      const manualPkg = handoffFailedPodJobToManual(res3.job, 'Provider offline after 3 attempts')

      expect(manualPkg.source).toBe('pod-submission-exhausted')
      expect(manualPkg.status).toBe('pending_acknowledgement')
      expect(manualPkg.disclaimer).toBe(MANUAL_FULFILLMENT_DISCLAIMER)
      expect(manualPkg.disclaimer).toContain('NEVER IMPLY AUTOMATION')

      // Operator acknowledgement and dispatch workflow
      const acknowledged = acknowledgeManualFulfillmentPackage(manualPkg, 'lead_printmaker')
      expect(acknowledged.status).toBe('acknowledged')
      expect(acknowledged.acknowledgement?.acknowledgedBy).toBe('lead_printmaker')

      const shipped = shipManualFulfillmentPackage(
        acknowledged,
        { carrier: 'USPS', trackingNumber: '9400199999999999999999' },
        'lead_printmaker',
      )
      expect(shipped.status).toBe('shipped')
      expect(shipped.externalFulfillment?.carrier).toBe('USPS')
    })

    it('creates replacement reprint job linked to parent with responsibility policy', () => {
      const validAddress = {
        name: 'Robin Hunter',
        address1: '789 Congress Ave',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'US',
      }

      const plan = buildFulfillmentPlan({
        orderId: 'order_reprint_test',
        siteId: 'site-party',
        currency: 'USD',
        recipientAddress: validAddress,
        items: [
          {
            lineId: 'line-1',
            productId: 'prod-tee',
            variantSku: 'SHIRT-M-BLK',
            title: 'Renegade Tee',
            quantity: 1,
            unitPriceMinor: '2800',
            lineAmountMinor: '2800',
            kind: 'pod',
            podMapping: sampleMapping,
          },
        ],
        connectionsByProviderKey: new Map([
          [
            'pod-emulator',
            createPodConnection(
              {
                id: 'c1',
                siteId: 'site-party',
                providerKey: 'pod-emulator',
                label: 'Emulator',
                apiKey: 'key',
                capabilities: emulatorCapabilities(),
              },
              testEncryptionKey,
            ),
          ],
        ]),
      })

      const originalJob = createPodJobAfterPaidAcceptance({
        plan,
        packageIndex: 0,
        orderPaymentState: 'paid',
        holdWindowMs: 0,
      })

      const reprint = createReprintPodJob({
        originalJob,
        reason: 'Garment arrived with misaligned print',
        responsibility: 'provider_defect',
        actor: 'support_agent',
      })

      expect(reprint.id).toContain('pod_reprint_')
      expect(reprint.idempotencyKey).toContain(':reprint:1')
      expect(reprint.state).toBe('created')
      expect(reprint.attemptCount).toBe(0)
      expect((reprint as any).parentJobId).toBe(originalJob.id)
      expect((reprint as any).responsibility).toBe('provider_defect')
    })
  })

  // --- 10. End-to-End Acceptance ---
  describe('10. End-to-End Acceptance: One paid test line routes exactly once', () => {
    it('routes one paid test line through the emulator, fulfills, receives tracking, and preserves immutable snapshot', async () => {
      const emulator = new PodEmulatorAdapter()
      const validAddress = {
        name: 'Alex Mercer',
        address1: '100 Broadway',
        city: 'New York',
        state: 'NY',
        postalCode: '10005',
        country: 'US',
      }

      const soldRendition = freezeSoldPrintRendition(
        sampleRendition,
        { topMm: 50, leftMm: 50, widthMm: 280, heightMm: 380 },
        'front',
      )

      const lineItem: FulfillmentLineItem = {
        lineId: 'line-acceptance-1',
        productId: 'prod-tee',
        variantSku: 'SHIRT-M-BLK',
        title: 'Renegade Heavyweight Tee - M / Black',
        quantity: 1,
        unitPriceMinor: '2800',
        lineAmountMinor: '2800',
        kind: 'pod',
        podMapping: sampleMapping,
        soldRenditions: [soldRendition],
      }

      // Step 1: Build Fulfillment Plan
      const plan = buildFulfillmentPlan({
        orderId: 'order_acc_001',
        siteId: 'site-party',
        currency: 'USD',
        recipientAddress: validAddress,
        items: [lineItem],
        connectionsByProviderKey: new Map([
          [
            'pod-emulator',
            createPodConnection(
              {
                id: 'conn-1',
                siteId: 'site-party',
                providerKey: 'pod-emulator',
                label: 'Emulator',
                apiKey: 'key',
                capabilities: emulatorCapabilities(),
              },
              testEncryptionKey,
            ),
          ],
        ]),
      })

      expect(plan.providerJobs).toHaveLength(1)

      // Step 2: Authoritative Paid Acceptance -> Exactly One PODJob
      const job = createPodJobAfterPaidAcceptance({
        plan,
        packageIndex: 0,
        orderPaymentState: 'paid',
        holdWindowMs: 0, // Direct release for test
      })

      expect(job.state).toBe('created')

      // Step 3: Submit to Emulator
      const submitOutcome = await submitPodJobWithRetry({ job, adapter: emulator })
      expect(submitOutcome.success).toBe(true)
      const submittedJob = submitOutcome.job
      expect(submittedJob.state).toBe('submitted')
      expect(submittedJob.externalOrderId).toBeDefined()

      // Step 4: Reconcile with Provider
      emulator.simulatePartialShipment(
        submittedJob.externalOrderId!,
        [0],
        'USPS',
        '9400100000000000000001',
      )

      const reconciledJob = await reconcilePodJobWithProvider(submittedJob, emulator)
      expect(reconciledJob.state).toBe('shipped')
      expect((reconciledJob as any).fulfillments).toHaveLength(1)
      expect((reconciledJob as any).fulfillments[0].trackingNumber).toBe('9400100000000000000001')

      // Step 5: Sold snapshot remains immutable and untampered
      expect(verifySoldPrintRendition(soldRendition)).toBe(true)
    })
  })
})

function emulatorCapabilities() {
  return {
    supportedPrintAreas: ['front', 'back', 'sleeve_left', 'sleeve_right', 'all_over'] as const,
    supportsCancellation: true,
    supportsPartialShipments: true,
    supportsLivePreflight: true,
    supportsLiveCostEstimation: true,
    supportsAutomaticReprint: true,
    supportsReturnRouting: true,
    supportsPoBoxDelivery: false,
  }
}

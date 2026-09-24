import { getPayload } from 'payload'

import { migrations } from '../migrations'
import { isDedicatedDatabase } from './verification-contract'

/**
 * Rehearses the commerce migrations on the last known-good baseline. This is
 * intentionally separate from the full fresh gate so an unrelated earlier
 * domain migration cannot hide whether the Commerce SQL itself is valid.
 */
export async function verifyCommerceMigrations() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl || !isDedicatedDatabase(databaseUrl, '_release_acceptance'))
    throw new Error('Set DATABASE_URL to a dedicated database ending in _release_acceptance.')
  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })
  try {
    const stop = migrations.findIndex(
      (migration) => migration.name === '20260920_100000_comm_01_member_auth_lifecycle',
    )
    const selected = [
      ...migrations.slice(0, stop),
      ...migrations.filter((migration) =>
        [
          '20260921_020000_comm_03a_comment_identity',
          '20260922_130000_commerce_canonical_contract',
          '20260923_010000_shop_01_catalog_workflows',
          '20260923_020000_shop_02_carts_and_checkout_proposals',
          '20260923_030000_shop_04_payment_operations',
          '20260923_040000_shop_05_subscriptions',
          '20260923_050000_shop_06_affiliate_and_referrals',
          '20260923_060000_shop_07_donations',
          '20260923_080000_shop_03_pod_and_fulfillment',
        ].includes(migration.name),
      ),
    ]
    const database = payload.db as typeof payload.db & {
      migrate: (args: { migrations: typeof migrations }) => Promise<void>
      pool: {
        query: (query: string) => Promise<{ rows: Array<Record<string, unknown>> }>
      }
    }
    // The canonical UUIDv7 function (introduced before Commerce) uses
    // gen_random_bytes. Production bootstrap grants this extension too.
    await database.pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await database.migrate({ migrations: selected })
    await database.migrate({ migrations: selected })
    const result = await database.pool.query(
      `SELECT to_regclass('public.digital_delivery_grants') AS grants,
              to_regclass('public.catalog_import_runs') AS imports,
              to_regclass('public.checkout_proposals') AS proposals,
              to_regclass('public.promotions') AS promotions,
              to_regclass('public.inventory_reservations') AS reservations,
              to_regclass('public.payment_attempts') AS payment_attempts,
              to_regclass('public.commerce_refunds') AS refunds,
              to_regclass('public.commerce_disputes') AS disputes,
              to_regclass('public.affiliate_offers') AS affiliate_offers,
              to_regclass('public.commission_ledgers') AS commission_ledgers,
              to_regclass('public.settlement_batches') AS settlement_batches,
              to_regclass('public.donation_campaigns') AS donation_campaigns,
              to_regclass('public.donation_intents') AS donation_intents,
              to_regclass('public.donations') AS donations,
              to_regclass('public.donation_events') AS donation_events,
              to_regclass('public.pod_connections') AS pod_connections,
              to_regclass('public.pod_jobs') AS pod_jobs,
              to_regclass('public.manual_fulfillment_packages') AS manual_packages,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'offers') AS offers,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'carts' AND column_name = 'version') AS cart_version`,
    )
    const evidence = result.rows[0]
    if (
      !evidence?.grants ||
      !evidence.imports ||
      !evidence.proposals ||
      !evidence.promotions ||
      !evidence.reservations ||
      !evidence.payment_attempts ||
      !evidence.refunds ||
      !evidence.disputes ||
      !evidence.affiliate_offers ||
      !evidence.commission_ledgers ||
      !evidence.settlement_batches ||
      !evidence.donation_campaigns ||
      !evidence.donation_intents ||
      !evidence.donations ||
      !evidence.donation_events ||
      !evidence.pod_connections ||
      !evidence.pod_jobs ||
      !evidence.manual_packages ||
      evidence.offers !== true ||
      evidence.cart_version !== true
    )
      throw new Error(`Commerce migration evidence is incomplete: ${JSON.stringify(evidence)}`)
    console.log(`Commerce migration acceptance passed: ${JSON.stringify(evidence)}`)
  } finally {
    await payload.db.destroy?.()
  }
}

if (process.argv[1]?.endsWith('verify-commerce-migrations.ts')) {
  verifyCommerceMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

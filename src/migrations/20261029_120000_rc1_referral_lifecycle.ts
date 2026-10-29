import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE enum_payload_jobs_task_slug ADD VALUE IF NOT EXISTS 'commerce-reconcile-referrals';
    ALTER TYPE enum_payload_jobs_log_task_slug ADD VALUE IF NOT EXISTS 'commerce-reconcile-referrals';
    CREATE TABLE referral_codes (
      id uuid PRIMARY KEY DEFAULT renegade_uuid_v7(),
      site_id uuid NOT NULL REFERENCES sites(id),
      program_id uuid NOT NULL REFERENCES referral_programs(id),
      member_id uuid NOT NULL REFERENCES members(id),
      code varchar NOT NULL,
      created_by varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(site_id, code)
    );
    CREATE TABLE referral_claims (
      id uuid PRIMARY KEY DEFAULT renegade_uuid_v7(),
      site_id uuid NOT NULL REFERENCES sites(id),
      code_id uuid NOT NULL REFERENCES referral_codes(id),
      token_hash varchar NOT NULL UNIQUE,
      snapshot jsonb NOT NULL,
      checkout_session_id uuid REFERENCES checkout_sessions(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      UNIQUE(checkout_session_id)
    );
    ALTER TABLE commission_ledgers ADD COLUMN reversed_amount_minor varchar NOT NULL DEFAULT '0';
    ALTER TABLE commission_ledgers ADD COLUMN event_key varchar;
    CREATE UNIQUE INDEX commission_ledgers_event_key_idx ON commission_ledgers(site_id, event_key);
    CREATE UNIQUE INDEX commission_ledgers_order_accrual_idx ON commission_ledgers(order_id) WHERE type = 'accrual';
    CREATE UNIQUE INDEX affiliate_conversions_site_network_event_unique ON affiliate_conversions(site_id, network, external_event_id);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS affiliate_conversions_site_network_event_unique;
    DROP INDEX IF EXISTS commission_ledgers_order_accrual_idx;
    DROP INDEX IF EXISTS commission_ledgers_event_key_idx;
    ALTER TABLE commission_ledgers DROP COLUMN IF EXISTS event_key;
    ALTER TABLE commission_ledgers DROP COLUMN IF EXISTS reversed_amount_minor;
    DROP TABLE IF EXISTS referral_claims;
    DROP TABLE IF EXISTS referral_codes;
  `)
}

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/** AUD-00: pin the approved message revision per recipient before worker dispatch. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "email_deliveries" ADD COLUMN IF NOT EXISTS "message_snapshot" jsonb;
    UPDATE "email_deliveries" d
      SET "message_snapshot" = jsonb_build_object(
        'subject', m."subject", 'blocks', m."blocks", 'kind', m."kind", 'reviewedAt', m."reviewed_at"
      )
      FROM "email_messages" m
      WHERE d."message_id" = m."id" AND d."message_snapshot" IS NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "email_deliveries" DROP COLUMN IF EXISTS "message_snapshot";`)
}

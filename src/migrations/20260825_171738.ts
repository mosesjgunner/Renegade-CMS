import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "videos" ADD COLUMN "provider_identity" varchar NOT NULL;
  CREATE UNIQUE INDEX "videos_provider_identity_idx" ON "videos" USING btree ("provider_identity");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "videos_provider_identity_idx";
  ALTER TABLE "videos" DROP COLUMN "provider_identity";`)
}

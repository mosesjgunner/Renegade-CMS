import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "users_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL,
      "path" varchar NOT NULL,
      "sites_id" uuid
    );
    ALTER TABLE "users_rels" ADD COLUMN IF NOT EXISTS "sites_id" uuid;
    DO $$ BEGIN
      ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_parent_fk"
        FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_sites_fk"
        FOREIGN KEY ("sites_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "users_rels_order_idx" ON "users_rels" ("order");
    CREATE INDEX IF NOT EXISTS "users_rels_parent_idx" ON "users_rels" ("parent_id");
    CREATE INDEX IF NOT EXISTS "users_rels_path_idx" ON "users_rels" ("path");
    CREATE INDEX IF NOT EXISTS "users_rels_sites_idx" ON "users_rels" ("sites_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "users_rels_parent_site_unique" ON "users_rels" ("parent_id", "path", "sites_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // users_rels can contain other relationship fields. Remove only this field's
  // records; retaining the shared table avoids deleting unrelated relationships.
  await db.execute(sql`DELETE FROM "users_rels" WHERE "path" = 'adminSites';`)
}

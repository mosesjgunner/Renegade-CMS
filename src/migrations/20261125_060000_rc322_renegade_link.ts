import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * RC3-22 (#70): Renegade-to-Renegade syndication storage — peer trust
 * links (bound to one site each) and the items received over them.
 * Hand-written in the RC3-21 generated style (the Payload migrate:create
 * generator blocks on an interactive prompt in this environment).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "discussion_posts" ADD COLUMN IF NOT EXISTS "federation" jsonb;

    CREATE TABLE IF NOT EXISTS "renegade_peer_links" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" varchar,
      "peer_origin" varchar NOT NULL,
      "site_id" uuid NOT NULL,
      "peer_public_key" varchar NOT NULL,
      "state" varchar NOT NULL DEFAULT 'active',
      "established_at" timestamptz,
      "revoked_at" timestamptz,
      "note" varchar,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "renegade_peer_links_peer_origin_idx" ON "renegade_peer_links"("peer_origin");
    CREATE INDEX IF NOT EXISTS "renegade_peer_links_site_idx" ON "renegade_peer_links"("site_id");
    CREATE INDEX IF NOT EXISTS "renegade_peer_links_updated_at_idx" ON "renegade_peer_links"("updated_at");
    CREATE INDEX IF NOT EXISTS "renegade_peer_links_created_at_idx" ON "renegade_peer_links"("created_at");
    DO $$ BEGIN
      ALTER TABLE "renegade_peer_links"
        ADD CONSTRAINT "renegade_peer_links_site_id_sites_id_fk"
        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    CREATE TABLE IF NOT EXISTS "syndicated_items" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "link_id" uuid NOT NULL,
      "site_id" uuid NOT NULL,
      "source_item_id" varchar NOT NULL,
      "dedupe_key" varchar NOT NULL,
      "kind" varchar NOT NULL DEFAULT 'post',
      "title" varchar NOT NULL,
      "body" varchar NOT NULL,
      "source_url" varchar,
      "state" varchar NOT NULL DEFAULT 'received',
      "received_at" timestamptz NOT NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "syndicated_items_dedupe_key_idx" ON "syndicated_items"("dedupe_key");
    CREATE INDEX IF NOT EXISTS "syndicated_items_link_idx" ON "syndicated_items"("link_id");
    CREATE INDEX IF NOT EXISTS "syndicated_items_site_idx" ON "syndicated_items"("site_id");
    CREATE INDEX IF NOT EXISTS "syndicated_items_updated_at_idx" ON "syndicated_items"("updated_at");
    CREATE INDEX IF NOT EXISTS "syndicated_items_created_at_idx" ON "syndicated_items"("created_at");
    DO $$ BEGIN
      ALTER TABLE "syndicated_items"
        ADD CONSTRAINT "syndicated_items_link_id_renegade_peer_links_id_fk"
        FOREIGN KEY ("link_id") REFERENCES "public"."renegade_peer_links"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "syndicated_items"
        ADD CONSTRAINT "syndicated_items_site_id_sites_id_fk"
        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "renegade_peer_links_id" uuid;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_renegade_peer_links_fk"
        FOREIGN KEY ("renegade_peer_links_id") REFERENCES "public"."renegade_peer_links"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_renegade_peer_links_id_idx" ON "payload_locked_documents_rels" USING btree ("renegade_peer_links_id");
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "syndicated_items_id" uuid;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_syndicated_items_fk"
        FOREIGN KEY ("syndicated_items_id") REFERENCES "public"."syndicated_items"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_syndicated_items_id_idx" ON "payload_locked_documents_rels" USING btree ("syndicated_items_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "discussion_posts" DROP COLUMN IF EXISTS "federation";
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_renegade_peer_links_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_renegade_peer_links_id_idx";
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_syndicated_items_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_syndicated_items_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "renegade_peer_links_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "syndicated_items_id";
    DROP TABLE IF EXISTS "syndicated_items";
    DROP TABLE IF EXISTS "renegade_peer_links";
  `)
}

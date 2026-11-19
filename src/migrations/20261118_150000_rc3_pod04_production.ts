import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * POD-04 (POD-REQ-09, POD-REQ-10, POD-REQ-37): production management.
 *
 * podcast-episodes gain `production_state` (the POD-04 production
 * lifecycle: idea/scripted/scheduled-record/recorded/editing/review/
 * scheduled/published/withdrawn; existing rows take the 'idea'
 * default). podcast-shows gain `guest_consent_policy` (off/warn/block,
 * default warn). Three new tables:
 * - `podcast_guests` — the guest book (site-scoped production data:
 *   name, email, contact/links JSON, bio, optional authors link).
 * - `podcast_guest_appearances` — guest↔episode appearances with prep
 *   notes, planned questions, and the per-appearance consent record.
 * - `podcast_episode_approvals` — the minimal approval record the
 *   publish gate reads (Workflow #19's approval machinery is bound to
 *   article/content bundles and has no record-level primitive; see
 *   src/modules/podcast-studio/production.ts).
 * Each new table gains its `payload_locked_documents_rels` column
 * following the standard Payload pattern. Relationship columns are
 * nullable at the DB level with ON DELETE SET NULL, matching every
 * existing Payload table in this schema (required-ness is enforced
 * by Payload validation, not the column) — an earlier draft made
 * them NOT NULL, which broke episode deletion outright (the SET NULL
 * action violated the constraint); caught by the POD-04 L1 recovery
 * journey before commit.
 *
 * Rollback note: `down` drops exactly what `up` adds. Dropping the
 * three tables destroys the guest book, appearance/consent history,
 * and approval history recorded after this migration; dropping the
 * two columns discards production states and consent policies (every
 * episode falls back to 'idea' and every show to 'warn' on
 * re-migrate). Export podcast-episodes / podcast-shows /
 * podcast-guests / podcast-guest-appearances /
 * podcast-episode-approvals first if a rollback must keep that state.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_episodes_production_state" AS ENUM('idea', 'scripted', 'scheduled-record', 'recorded', 'editing', 'review', 'scheduled', 'published', 'withdrawn');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_shows_guest_consent_policy" AS ENUM('off', 'warn', 'block');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_podcast_episode_approvals_decision" AS ENUM('approved', 'rejected', 'changes-requested');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    ALTER TABLE "podcast_episodes"
      ADD COLUMN IF NOT EXISTS "production_state" "enum_podcast_episodes_production_state" DEFAULT 'idea';
    ALTER TABLE "podcast_shows"
      ADD COLUMN IF NOT EXISTS "guest_consent_policy" "enum_podcast_shows_guest_consent_policy" DEFAULT 'warn';
    CREATE TABLE IF NOT EXISTS "podcast_guests" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "site_id" uuid,
      "name" varchar NOT NULL,
      "email" varchar,
      "contact" jsonb,
      "bio" varchar,
      "links" jsonb,
      "author_id" uuid,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "podcast_guest_appearances" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "guest_id" uuid,
      "episode_id" uuid,
      "role" varchar DEFAULT 'guest',
      "prep_notes" varchar,
      "questions" jsonb,
      "consent_at" timestamp(3) with time zone,
      "consent_by" varchar,
      "consent_scope" varchar,
      "release_url" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "podcast_episode_approvals" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "episode_id" uuid,
      "approver" varchar NOT NULL,
      "decision" "enum_podcast_episode_approvals_decision" NOT NULL,
      "note" varchar,
      "decided_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "podcast_guests_id" uuid,
      ADD COLUMN IF NOT EXISTS "podcast_guest_appearances_id" uuid,
      ADD COLUMN IF NOT EXISTS "podcast_episode_approvals_id" uuid;
    DO $$ BEGIN
      ALTER TABLE "podcast_guests"
        ADD CONSTRAINT "podcast_guests_site_id_sites_id_fk"
        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_guests"
        ADD CONSTRAINT "podcast_guests_author_id_authors_id_fk"
        FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_guest_appearances"
        ADD CONSTRAINT "podcast_guest_appearances_guest_id_podcast_guests_id_fk"
        FOREIGN KEY ("guest_id") REFERENCES "public"."podcast_guests"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_guest_appearances"
        ADD CONSTRAINT "podcast_guest_appearances_episode_id_podcast_episodes_id_fk"
        FOREIGN KEY ("episode_id") REFERENCES "public"."podcast_episodes"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "podcast_episode_approvals"
        ADD CONSTRAINT "podcast_episode_approvals_episode_id_podcast_episodes_id_fk"
        FOREIGN KEY ("episode_id") REFERENCES "public"."podcast_episodes"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_podcast_guests_fk"
        FOREIGN KEY ("podcast_guests_id") REFERENCES "public"."podcast_guests"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_podcast_guest_appearances_fk"
        FOREIGN KEY ("podcast_guest_appearances_id") REFERENCES "public"."podcast_guest_appearances"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_podcast_episode_approvals_fk"
        FOREIGN KEY ("podcast_episode_approvals_id") REFERENCES "public"."podcast_episode_approvals"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE INDEX IF NOT EXISTS "podcast_guests_site_idx" ON "podcast_guests" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "podcast_guests_author_idx" ON "podcast_guests" USING btree ("author_id");
    CREATE INDEX IF NOT EXISTS "podcast_guests_updated_at_idx" ON "podcast_guests" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "podcast_guests_created_at_idx" ON "podcast_guests" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "podcast_guest_appearances_guest_idx" ON "podcast_guest_appearances" USING btree ("guest_id");
    CREATE INDEX IF NOT EXISTS "podcast_guest_appearances_episode_idx" ON "podcast_guest_appearances" USING btree ("episode_id");
    CREATE INDEX IF NOT EXISTS "podcast_guest_appearances_updated_at_idx" ON "podcast_guest_appearances" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "podcast_guest_appearances_created_at_idx" ON "podcast_guest_appearances" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "podcast_episode_approvals_episode_idx" ON "podcast_episode_approvals" USING btree ("episode_id");
    CREATE INDEX IF NOT EXISTS "podcast_episode_approvals_updated_at_idx" ON "podcast_episode_approvals" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "podcast_episode_approvals_created_at_idx" ON "podcast_episode_approvals" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_podcast_guests_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_guests_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_podcast_guest_appearances_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_guest_appearances_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_podcast_episode_approvals_id_idx" ON "payload_locked_documents_rels" USING btree ("podcast_episode_approvals_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_podcast_guests_fk",
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_podcast_guest_appearances_fk",
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_podcast_episode_approvals_fk";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_podcast_guests_id_idx";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_podcast_guest_appearances_id_idx";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_podcast_episode_approvals_id_idx";
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "podcast_guests_id",
      DROP COLUMN IF EXISTS "podcast_guest_appearances_id",
      DROP COLUMN IF EXISTS "podcast_episode_approvals_id";
    DROP TABLE IF EXISTS "podcast_episode_approvals";
    DROP TABLE IF EXISTS "podcast_guest_appearances";
    DROP TABLE IF EXISTS "podcast_guests";
    ALTER TABLE "podcast_episodes"
      DROP COLUMN IF EXISTS "production_state";
    ALTER TABLE "podcast_shows"
      DROP COLUMN IF EXISTS "guest_consent_policy";
    DROP TYPE IF EXISTS "public"."enum_podcast_episode_approvals_decision";
    DROP TYPE IF EXISTS "public"."enum_podcast_shows_guest_consent_policy";
    DROP TYPE IF EXISTS "public"."enum_podcast_episodes_production_state";
  `)
}

import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/** Durable machine credentials, webhook records, and network foundation schema. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "api_clients" (
      "id" uuid PRIMARY KEY NOT NULL, "site_id" uuid NOT NULL, "publication_id" uuid, "space_id" uuid,
      "name" varchar NOT NULL, "token_prefix" varchar NOT NULL, "token_hash" varchar NOT NULL, "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "expires_at" timestamp(3) with time zone, "revoked_at" timestamp(3) with time zone, "last_used_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "webhook_subscriptions" (
      "id" uuid PRIMARY KEY NOT NULL, "site_id" uuid NOT NULL, "publication_id" uuid, "space_id" uuid, "events" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "target" varchar NOT NULL, "secret_ref" varchar NOT NULL, "status" varchar DEFAULT 'active' NOT NULL, "failure_count" numeric DEFAULT 0 NOT NULL, "rotated_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
      "id" uuid PRIMARY KEY NOT NULL, "subscription_id" uuid NOT NULL, "event_id" varchar NOT NULL, "event_type" varchar NOT NULL, "idempotency_key" varchar NOT NULL,
      "state" varchar DEFAULT 'queued' NOT NULL, "attempts" numeric DEFAULT 0 NOT NULL, "next_attempt_at" timestamp(3) with time zone, "redacted_response" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "integration_audit_events" (
      "id" uuid PRIMARY KEY NOT NULL, "site_id" uuid NOT NULL, "publication_id" uuid, "space_id" uuid, "action" varchar NOT NULL, "client_id" uuid,
      "subject" jsonb, "outcome" varchar NOT NULL, "occurred_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL, "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "network_settings" (
      "id" serial PRIMARY KEY NOT NULL,
      "canonical_origin" varchar,
      "enabled_protocols" jsonb DEFAULT '[]'::jsonb,
      "registration_policy" varchar DEFAULT 'closed',
      "remote_policy" jsonb DEFAULT '{"default":"allow"}'::jsonb,
      "public_contact" jsonb,
      "updated_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone
    );
    CREATE TABLE IF NOT EXISTS "network_signing_keys" (
      "id" uuid PRIMARY KEY NOT NULL,
      "key_id" varchar NOT NULL,
      "algorithm" varchar NOT NULL,
      "public_key" varchar NOT NULL,
      "state" varchar DEFAULT 'active' NOT NULL,
      "not_before" timestamp(3) with time zone NOT NULL,
      "retired_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "remote_instances" (
      "id" uuid PRIMARY KEY NOT NULL,
      "origin" varchar NOT NULL,
      "status" varchar DEFAULT 'unknown' NOT NULL,
      "metadata" jsonb,
      "last_seen_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "remote_actors" (
      "id" uuid PRIMARY KEY NOT NULL,
      "instance_id" uuid NOT NULL,
      "canonical_id" varchar NOT NULL,
      "handle" varchar,
      "profile" jsonb,
      "last_fetched_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "remote_objects" (
      "id" uuid PRIMARY KEY NOT NULL,
      "instance_id" uuid NOT NULL,
      "actor_id" uuid,
      "canonical_id" varchar NOT NULL,
      "object_type" varchar,
      "reference" jsonb,
      "last_fetched_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "network_relationships" (
      "id" uuid PRIMARY KEY NOT NULL,
      "local_subject_type" varchar NOT NULL,
      "local_subject_id" varchar NOT NULL,
      "remote_actor_id" uuid NOT NULL,
      "kind" varchar NOT NULL,
      "state" varchar DEFAULT 'pending' NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "inbound_network_activities" (
      "id" uuid PRIMARY KEY NOT NULL,
      "protocol" varchar NOT NULL,
      "remote_actor_id" uuid,
      "remote_activity_id" varchar NOT NULL,
      "dedupe_key" varchar NOT NULL,
      "received_at" timestamp(3) with time zone NOT NULL,
      "status" varchar DEFAULT 'received' NOT NULL,
      "envelope" jsonb NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "outbound_network_deliveries" (
      "id" uuid PRIMARY KEY NOT NULL,
      "protocol" varchar NOT NULL,
      "remote_instance_id" uuid NOT NULL,
      "target" varchar NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "status" varchar DEFAULT 'queued' NOT NULL,
      "envelope" jsonb NOT NULL,
      "next_attempt_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "network_delivery_attempts" (
      "id" uuid PRIMARY KEY NOT NULL,
      "delivery_id" uuid NOT NULL,
      "idempotency_key" varchar NOT NULL,
      "attempt" numeric NOT NULL,
      "started_at" timestamp(3) with time zone NOT NULL,
      "finished_at" timestamp(3) with time zone,
      "outcome" jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "network_access_decisions" (
      "id" uuid PRIMARY KEY NOT NULL,
      "subject" varchar NOT NULL,
      "subject_type" varchar NOT NULL,
      "decision" varchar NOT NULL,
      "reason" varchar,
      "expires_at" timestamp(3) with time zone,
      "note" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "network_audit_events" (
      "id" uuid PRIMARY KEY NOT NULL,
      "action" varchar NOT NULL,
      "subject" varchar NOT NULL,
      "actor_id" uuid,
      "details" jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "api_clients_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "webhook_subscriptions_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "webhook_deliveries_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "integration_audit_events_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "network_signing_keys_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "remote_instances_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "remote_actors_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "remote_objects_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "network_relationships_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "inbound_network_activities_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "outbound_network_deliveries_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "network_delivery_attempts_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "network_access_decisions_id" uuid;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "network_audit_events_id" uuid;

    DO $$ BEGIN ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_id_webhook_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."webhook_subscriptions"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "integration_audit_events" ADD CONSTRAINT "integration_audit_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "integration_audit_events" ADD CONSTRAINT "integration_audit_events_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "integration_audit_events" ADD CONSTRAINT "integration_audit_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "integration_audit_events" ADD CONSTRAINT "integration_audit_events_client_id_api_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."api_clients"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "remote_actors" ADD CONSTRAINT "remote_actors_instance_id_remote_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."remote_instances"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "remote_objects" ADD CONSTRAINT "remote_objects_instance_id_remote_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."remote_instances"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "remote_objects" ADD CONSTRAINT "remote_objects_actor_id_remote_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."remote_actors"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "network_relationships" ADD CONSTRAINT "network_relationships_remote_actor_id_remote_actors_id_fk" FOREIGN KEY ("remote_actor_id") REFERENCES "public"."remote_actors"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "inbound_network_activities" ADD CONSTRAINT "inbound_network_activities_remote_actor_id_remote_actors_id_fk" FOREIGN KEY ("remote_actor_id") REFERENCES "public"."remote_actors"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "outbound_network_deliveries" ADD CONSTRAINT "outbound_network_deliveries_remote_instance_id_remote_instances_id_fk" FOREIGN KEY ("remote_instance_id") REFERENCES "public"."remote_instances"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN ALTER TABLE "network_delivery_attempts" ADD CONSTRAINT "network_delivery_attempts_delivery_id_outbound_network_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."outbound_network_deliveries"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS "api_clients_token_prefix_idx" ON "api_clients" USING btree ("token_prefix");
    CREATE INDEX IF NOT EXISTS "api_clients_site_idx" ON "api_clients" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "webhook_subscriptions_site_idx" ON "webhook_subscriptions" USING btree ("site_id");
    CREATE INDEX IF NOT EXISTS "webhook_deliveries_event_id_idx" ON "webhook_deliveries" USING btree ("event_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "webhook_deliveries_idempotency_key_idx" ON "webhook_deliveries" USING btree ("idempotency_key");
    CREATE INDEX IF NOT EXISTS "integration_audit_events_site_idx" ON "integration_audit_events" USING btree ("site_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "network_signing_keys_key_id_idx" ON "network_signing_keys" USING btree ("key_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "remote_instances_origin_idx" ON "remote_instances" USING btree ("origin");
    CREATE UNIQUE INDEX IF NOT EXISTS "remote_actors_canonical_id_idx" ON "remote_actors" USING btree ("canonical_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "remote_objects_canonical_id_idx" ON "remote_objects" USING btree ("canonical_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "network_relationships_idempotency_key_idx" ON "network_relationships" USING btree ("idempotency_key");
    CREATE UNIQUE INDEX IF NOT EXISTS "inbound_network_activities_dedupe_key_idx" ON "inbound_network_activities" USING btree ("dedupe_key");
    CREATE UNIQUE INDEX IF NOT EXISTS "outbound_network_deliveries_idempotency_key_idx" ON "outbound_network_deliveries" USING btree ("idempotency_key");
    CREATE UNIQUE INDEX IF NOT EXISTS "network_access_decisions_subject_idx" ON "network_access_decisions" USING btree ("subject");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    DROP TABLE IF EXISTS "network_audit_events" CASCADE;
    DROP TABLE IF EXISTS "network_access_decisions" CASCADE;
    DROP TABLE IF EXISTS "network_delivery_attempts" CASCADE;
    DROP TABLE IF EXISTS "outbound_network_deliveries" CASCADE;
    DROP TABLE IF EXISTS "inbound_network_activities" CASCADE;
    DROP TABLE IF EXISTS "network_relationships" CASCADE;
    DROP TABLE IF EXISTS "remote_objects" CASCADE;
    DROP TABLE IF EXISTS "remote_actors" CASCADE;
    DROP TABLE IF EXISTS "remote_instances" CASCADE;
    DROP TABLE IF EXISTS "network_signing_keys" CASCADE;
    DROP TABLE IF EXISTS "network_settings" CASCADE;
    DROP TABLE IF EXISTS "integration_audit_events" CASCADE;
    DROP TABLE IF EXISTS "webhook_deliveries" CASCADE;
    DROP TABLE IF EXISTS "webhook_subscriptions" CASCADE;
    DROP TABLE IF EXISTS "api_clients" CASCADE;
  `)
}

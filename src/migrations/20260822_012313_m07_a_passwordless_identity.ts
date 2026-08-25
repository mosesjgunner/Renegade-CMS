import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_linked_identities_kind" AS ENUM('passkey', 'oauth', 'social', 'wallet', 'email-magic-link');
  CREATE TYPE "public"."enum_member_sessions_created_from" AS ENUM('magic-link', 'passkey', 'oauth', 'wallet', 'recovery');
  CREATE TYPE "public"."enum_identity_tokens_purpose" AS ENUM('magic-link-sign-in', 'identity-link', 'wallet-nonce');
  CREATE TABLE "linked_identities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"kind" "enum_linked_identities_kind" NOT NULL,
  	"provider_key" varchar NOT NULL,
  	"external_subject" varchar NOT NULL,
  	"verified_at" timestamp(3) with time zone,
  	"revoked_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "member_sessions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"token_hash" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"revoked_at" timestamp(3) with time zone,
  	"last_seen_at" timestamp(3) with time zone,
  	"device_label" varchar,
  	"created_from" "enum_member_sessions_created_from" NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "identity_tokens" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"purpose" "enum_identity_tokens_purpose" NOT NULL,
  	"token_hash" varchar NOT NULL,
  	"email_hash" varchar,
  	"member_id" uuid,
  	"browser_binding_hash" varchar,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"consumed_at" timestamp(3) with time zone,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "member_recovery_codes" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid NOT NULL,
  	"code_hash" varchar NOT NULL,
  	"used_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "identity_audit_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"member_id" uuid,
  	"event" varchar NOT NULL,
  	"details" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "members" ADD COLUMN "deletion_requested_at" timestamp(3) with time zone;
  ALTER TABLE "members" ADD COLUMN "verified_email_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "linked_identities_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "member_sessions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "identity_tokens_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "member_recovery_codes_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "identity_audit_events_id" uuid;
  ALTER TABLE "linked_identities" ADD CONSTRAINT "linked_identities_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "member_sessions" ADD CONSTRAINT "member_sessions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "identity_tokens" ADD CONSTRAINT "identity_tokens_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "member_recovery_codes" ADD CONSTRAINT "member_recovery_codes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "identity_audit_events" ADD CONSTRAINT "identity_audit_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "linked_identities_member_idx" ON "linked_identities" USING btree ("member_id");
  CREATE INDEX "linked_identities_provider_key_idx" ON "linked_identities" USING btree ("provider_key");
  CREATE INDEX "linked_identities_external_subject_idx" ON "linked_identities" USING btree ("external_subject");
  CREATE INDEX "linked_identities_updated_at_idx" ON "linked_identities" USING btree ("updated_at");
  CREATE INDEX "linked_identities_created_at_idx" ON "linked_identities" USING btree ("created_at");
  CREATE UNIQUE INDEX "providerKey_externalSubject_idx" ON "linked_identities" USING btree ("provider_key","external_subject");
  CREATE INDEX "member_sessions_member_idx" ON "member_sessions" USING btree ("member_id");
  CREATE UNIQUE INDEX "member_sessions_token_hash_idx" ON "member_sessions" USING btree ("token_hash");
  CREATE INDEX "member_sessions_expires_at_idx" ON "member_sessions" USING btree ("expires_at");
  CREATE INDEX "member_sessions_updated_at_idx" ON "member_sessions" USING btree ("updated_at");
  CREATE INDEX "member_sessions_created_at_idx" ON "member_sessions" USING btree ("created_at");
  CREATE UNIQUE INDEX "identity_tokens_token_hash_idx" ON "identity_tokens" USING btree ("token_hash");
  CREATE INDEX "identity_tokens_email_hash_idx" ON "identity_tokens" USING btree ("email_hash");
  CREATE INDEX "identity_tokens_member_idx" ON "identity_tokens" USING btree ("member_id");
  CREATE INDEX "identity_tokens_expires_at_idx" ON "identity_tokens" USING btree ("expires_at");
  CREATE INDEX "identity_tokens_updated_at_idx" ON "identity_tokens" USING btree ("updated_at");
  CREATE INDEX "identity_tokens_created_at_idx" ON "identity_tokens" USING btree ("created_at");
  CREATE INDEX "member_recovery_codes_member_idx" ON "member_recovery_codes" USING btree ("member_id");
  CREATE UNIQUE INDEX "member_recovery_codes_code_hash_idx" ON "member_recovery_codes" USING btree ("code_hash");
  CREATE INDEX "member_recovery_codes_updated_at_idx" ON "member_recovery_codes" USING btree ("updated_at");
  CREATE INDEX "member_recovery_codes_created_at_idx" ON "member_recovery_codes" USING btree ("created_at");
  CREATE INDEX "identity_audit_events_member_idx" ON "identity_audit_events" USING btree ("member_id");
  CREATE INDEX "identity_audit_events_event_idx" ON "identity_audit_events" USING btree ("event");
  CREATE INDEX "identity_audit_events_updated_at_idx" ON "identity_audit_events" USING btree ("updated_at");
  CREATE INDEX "identity_audit_events_created_at_idx" ON "identity_audit_events" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_linked_identities_fk" FOREIGN KEY ("linked_identities_id") REFERENCES "public"."linked_identities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_member_sessions_fk" FOREIGN KEY ("member_sessions_id") REFERENCES "public"."member_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_identity_tokens_fk" FOREIGN KEY ("identity_tokens_id") REFERENCES "public"."identity_tokens"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_member_recovery_codes_fk" FOREIGN KEY ("member_recovery_codes_id") REFERENCES "public"."member_recovery_codes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_identity_audit_events_fk" FOREIGN KEY ("identity_audit_events_id") REFERENCES "public"."identity_audit_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_linked_identities_id_idx" ON "payload_locked_documents_rels" USING btree ("linked_identities_id");
  CREATE INDEX "payload_locked_documents_rels_member_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("member_sessions_id");
  CREATE INDEX "payload_locked_documents_rels_identity_tokens_id_idx" ON "payload_locked_documents_rels" USING btree ("identity_tokens_id");
  CREATE INDEX "payload_locked_documents_rels_member_recovery_codes_id_idx" ON "payload_locked_documents_rels" USING btree ("member_recovery_codes_id");
  CREATE INDEX "payload_locked_documents_rels_identity_audit_events_id_idx" ON "payload_locked_documents_rels" USING btree ("identity_audit_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "linked_identities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "member_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "identity_tokens" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "member_recovery_codes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "identity_audit_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "linked_identities" CASCADE;
  DROP TABLE "member_sessions" CASCADE;
  DROP TABLE "identity_tokens" CASCADE;
  DROP TABLE "member_recovery_codes" CASCADE;
  DROP TABLE "identity_audit_events" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_linked_identities_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_member_sessions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_identity_tokens_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_member_recovery_codes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_identity_audit_events_fk";
  
  DROP INDEX "payload_locked_documents_rels_linked_identities_id_idx";
  DROP INDEX "payload_locked_documents_rels_member_sessions_id_idx";
  DROP INDEX "payload_locked_documents_rels_identity_tokens_id_idx";
  DROP INDEX "payload_locked_documents_rels_member_recovery_codes_id_idx";
  DROP INDEX "payload_locked_documents_rels_identity_audit_events_id_idx";
  ALTER TABLE "members" DROP COLUMN "deletion_requested_at";
  ALTER TABLE "members" DROP COLUMN "verified_email_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "linked_identities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "member_sessions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "identity_tokens_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "member_recovery_codes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "identity_audit_events_id";
  DROP TYPE "public"."enum_linked_identities_kind";
  DROP TYPE "public"."enum_member_sessions_created_from";
  DROP TYPE "public"."enum_identity_tokens_purpose";`)
}

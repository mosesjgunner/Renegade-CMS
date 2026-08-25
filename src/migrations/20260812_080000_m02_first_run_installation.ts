import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_users_role" AS ENUM('owner', 'staff');
    CREATE TYPE "public"."enum_installation_state_state" AS ENUM('incomplete', 'installing', 'complete');
    ALTER TABLE "users" DROP COLUMN "reset_password_token", DROP COLUMN "reset_password_expiration", DROP COLUMN "salt", DROP COLUMN "hash", DROP COLUMN "login_attempts", DROP COLUMN "lock_until";
    DROP TABLE "users_sessions";
    ALTER TABLE "users" ADD COLUMN "role" "enum_users_role" DEFAULT 'owner' NOT NULL;
    CREATE TABLE "installation_state" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "singleton" boolean DEFAULT true NOT NULL,
      "state" "enum_installation_state_state" DEFAULT 'incomplete' NOT NULL,
      "bootstrap_token_hash" varchar,
      "bootstrap_expires_at" timestamp(3) with time zone,
      "registration_challenge" varchar,
      "registration_email" varchar,
      "owner_user_id" uuid,
      "completed_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE "passkeys" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "credential_id" varchar NOT NULL,
      "public_key" varchar NOT NULL,
      "counter" bigint DEFAULT 0 NOT NULL,
      "device_type" varchar NOT NULL,
      "backed_up" boolean DEFAULT false NOT NULL,
      "login_challenge" varchar,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE "recovery_codes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "code_hash" varchar NOT NULL,
      "used_at" timestamp(3) with time zone
    );
    ALTER TABLE "installation_state" ADD CONSTRAINT "installation_state_owner_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE no action;
    ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    CREATE UNIQUE INDEX "installation_state_singleton_idx" ON "installation_state" USING btree ("singleton");
    CREATE UNIQUE INDEX "passkeys_credential_id_idx" ON "passkeys" USING btree ("credential_id");
    CREATE UNIQUE INDEX "recovery_codes_code_hash_idx" ON "recovery_codes" USING btree ("code_hash");
    CREATE INDEX "passkeys_user_id_idx" ON "passkeys" USING btree ("user_id");
    CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes" USING btree ("user_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "recovery_codes" CASCADE;
    DROP TABLE "passkeys" CASCADE;
    DROP TABLE "installation_state" CASCADE;
    ALTER TABLE "users" DROP COLUMN "role";
    CREATE TABLE "users_sessions" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "created_at" timestamp(3) with time zone,
      "expires_at" timestamp(3) with time zone NOT NULL,
      CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
    );
    ALTER TABLE "users" ADD COLUMN "reset_password_token" varchar, ADD COLUMN "reset_password_expiration" timestamp(3) with time zone, ADD COLUMN "salt" varchar, ADD COLUMN "hash" varchar, ADD COLUMN "login_attempts" numeric DEFAULT 0, ADD COLUMN "lock_until" timestamp(3) with time zone;
    DROP TYPE "public"."enum_installation_state_state";
    DROP TYPE "public"."enum_users_role";`)
}

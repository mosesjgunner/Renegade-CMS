import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE moderation_cases DROP CONSTRAINT IF EXISTS moderation_cases_target_type_check;
    ALTER TABLE moderation_cases ADD CONSTRAINT moderation_cases_target_type_check CHECK (target_type IN ('comment','forum_post','forum_topic','member_profile','message','post','discussion'));
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Never delete canonical evidence to permit a rollback. This refuses narrowing if such cases exist.
  await db.execute(sql`
    ALTER TABLE moderation_cases DROP CONSTRAINT IF EXISTS moderation_cases_target_type_check;
    ALTER TABLE moderation_cases ADD CONSTRAINT moderation_cases_target_type_check CHECK (target_type IN ('comment','forum_post','forum_topic','member_profile','message'));
  `)
}

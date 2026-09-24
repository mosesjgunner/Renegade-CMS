import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE page_layouts ADD COLUMN IF NOT EXISTS published_presentation jsonb;
    UPDATE page_layouts SET published_presentation = jsonb_build_object(
      'version',1,'path',path,'visibility',visibility,'revision',COALESCE(published_revision,revision),
      'document',jsonb_build_object('version',1,'siteId',site_id,
        'theme',jsonb_build_object('id',theme_id,'version','1.0.0'),
        'template',jsonb_build_object('id','layout','version','1.0.0'),'surface','layout',
        'slots',jsonb_build_object('main',COALESCE(blocks,'[]'::jsonb) || COALESCE(unknown_blocks,'[]'::jsonb))))
    WHERE published_presentation IS NULL AND status='published' AND layout_version=1;
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE page_layouts DROP COLUMN IF EXISTS published_presentation;`)
}

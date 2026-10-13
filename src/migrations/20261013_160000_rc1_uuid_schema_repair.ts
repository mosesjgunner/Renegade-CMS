import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-postgres'

/** Reconcile integer columns with the installed UUID contract without dropping stored rows. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE target record; populated boolean;
    BEGIN
      -- These references never had a valid mapping to the UUID parent tables.
      -- Refuse to guess ownership or erase a populated legacy reference.
      FOR target IN SELECT * FROM (VALUES
        ('consent_events', 'actor_id'),
        ('email_messages', 'parent_message_id'),
        ('email_templates', 'site_id'),
        ('audience_experiments', 'site_id')
      ) AS refs(table_name, column_name) LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public'
          AND c.table_name=target.table_name AND c.column_name=target.column_name AND c.data_type='integer') THEN
          EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE %I IS NOT NULL)', target.table_name, target.column_name)
            INTO populated;
          IF populated THEN
            RAISE EXCEPTION 'RC1 UUID reconciliation requires an explicit legacy mapping for %.%; stored references were preserved', target.table_name, target.column_name;
          END IF;
        END IF;
      END LOOP;
      FOR target IN SELECT * FROM (VALUES
        ('email_templates', 'renegade:email-templates:'),
        ('audience_experiments', 'renegade:audience-experiments:'),
        ('network_settings', 'renegade:network-settings:')
      ) AS ids(table_name, namespace) LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public'
          AND c.table_name=target.table_name AND c.column_name='id' AND c.data_type='integer') THEN
          EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS legacy_integer_id integer', target.table_name);
          EXECUTE format('UPDATE %I SET legacy_integer_id=id', target.table_name);
          EXECUTE format('ALTER TABLE %I ALTER COLUMN id DROP DEFAULT', target.table_name);
          EXECUTE format('ALTER TABLE %I ALTER COLUMN id TYPE uuid USING md5(%L || id::text)::uuid', target.table_name, target.namespace);
          EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT gen_random_uuid()', target.table_name);
        END IF;
      END LOOP;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
        AND table_name='email_messages' AND column_name='email_template_id' AND data_type='integer') THEN
        ALTER TABLE email_messages ALTER COLUMN email_template_id TYPE uuid
          USING md5('renegade:email-templates:' || email_template_id::text)::uuid;
      END IF;
      FOR target IN SELECT * FROM (VALUES
        ('consent_events', 'actor_id'), ('email_messages', 'parent_message_id'),
        ('email_templates', 'site_id'), ('audience_experiments', 'site_id')
      ) AS refs(table_name, column_name) LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public'
          AND c.table_name=target.table_name AND c.column_name=target.column_name AND c.data_type='integer') THEN
          EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULL::uuid', target.table_name, target.column_name);
        END IF;
      END LOOP;
    END $$;
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Restore the pre-migration database backup to reverse UUID reconciliation; new UUID rows must not be discarded.',
  )
}

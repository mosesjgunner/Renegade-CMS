import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE TABLE IF NOT EXISTS search_documents (
      id bigserial PRIMARY KEY, site_id varchar NOT NULL, collection varchar NOT NULL, canonical_id varchar NOT NULL,
      canonical_revision_id varchar, canonical_url text NOT NULL, path text NOT NULL, content_type varchar NOT NULL,
      title text NOT NULL, excerpt text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '', author text,
      taxonomy text NOT NULL DEFAULT '', published_at timestamptz, modified_at timestamptz, language varchar,
      media_hints jsonb NOT NULL DEFAULT '[]'::jsonb, visibility varchar NOT NULL DEFAULT 'public', index_version integer NOT NULL, indexed_at timestamptz NOT NULL DEFAULT now(),
      search_vector tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title,'')), 'A') || setweight(to_tsvector('simple', coalesce(excerpt,'')), 'B') || setweight(to_tsvector('simple', coalesce(taxonomy,'')), 'B') || setweight(to_tsvector('simple', coalesce(body,'')), 'C')) STORED,
      UNIQUE(collection, canonical_id)
    );
    CREATE INDEX IF NOT EXISTS search_documents_public_idx ON search_documents(site_id, content_type, published_at DESC) WHERE visibility = 'public';
    CREATE INDEX IF NOT EXISTS search_documents_vector_idx ON search_documents USING gin(search_vector);
    CREATE INDEX IF NOT EXISTS search_documents_title_trgm_idx ON search_documents USING gin(title gin_trgm_ops);
  `)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS search_documents;`)
}

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { SignJWT } from 'jose'
import { execSync } from 'node:child_process'

// 64x64 valid test PNG (red square with border)
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAtSURBVHgB7c4xEQAgDAAxhJk+uIIP4M9p4GqT7q2m2t07AAAAAAAAAAAAAAAAAAAAfOAFVUkAp17eB3YAAAAASUVORK5CYII=',
  'base64'
)

async function main() {
  const mediaDir = path.resolve('media')
  fs.mkdirSync(mediaDir, { recursive: true })
  const filename = 'renegade-banner.png'
  fs.writeFileSync(path.join(mediaDir, filename), PNG_BUFFER)

  // Query site and user IDs
  const userOutput = execSync(
    `docker exec renegade-cms-postgres-1 psql -U renegade -d renegade -t -A -c "SELECT id, email FROM users WHERE email = 'founder@renegadeparty.org' LIMIT 1;"`
  ).toString().trim()
  const [userId, userEmail] = userOutput.split('|')

  const siteId = execSync(
    `docker exec renegade-cms-postgres-1 psql -U renegade -d renegade -t -A -c "SELECT id FROM sites LIMIT 1;"`
  ).toString().trim()

  const assetId = crypto.randomUUID()
  const storageLocation = `local://${filename}`
  
  // Insert or replace asset in media_assets
  const insertAssetSql = `
    INSERT INTO media_assets (
      id, site_id, title, original_filename, storage_location, storage_provider,
      mime_type, size_bytes, width, height, processing_state, rights_status, kind,
      created_at, updated_at
    ) VALUES (
      '${assetId}', '${siteId}', 'Renegade Brand Banner', '${filename}', '${storageLocation}', 'local',
      'image/png', ${PNG_BUFFER.length}, 64, 64, 'ready', 'approved', 'image',
      NOW(), NOW()
    );
  `
  execSync(`docker exec renegade-cms-postgres-1 psql -U renegade -d renegade -c "${insertAssetSql.replace(/\n/g, ' ')}"`)

  // Create admin session
  const sessionId = crypto.randomUUID()
  const insertSessionSql = `
    INSERT INTO admin_sessions (id, user_id, expires_at)
    VALUES ('${sessionId}', '${userId}', NOW() + interval '8 hours');
  `
  execSync(`docker exec renegade-cms-postgres-1 psql -U renegade -d renegade -c "${insertSessionSql.replace(/\n/g, ' ')}"`)

  // Sign JWT
  const secret = '/hPA/thVib6fgIVNPW3+L19ahfNbi0F4w3jI+Fkpx4A+vJYqhpfm9EqFtVKvttHD'
  const token = await new SignJWT({
    collection: 'users',
    email: userEmail,
    id: userId,
    sid: sessionId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(new TextEncoder().encode(secret))

  const result = {
    userId,
    userEmail,
    siteId,
    assetId,
    filename,
    token,
    mediaLibraryUrl: `http://localhost:3000/admin/media-library?siteId=${siteId}`,
  }

  fs.writeFileSync('scratch/proof-session.json', JSON.stringify(result, null, 2))
  console.log('READY_FOR_BROWSER:', JSON.stringify(result, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

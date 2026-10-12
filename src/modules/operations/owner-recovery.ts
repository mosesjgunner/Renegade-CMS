import { createHmac, randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import type { Pool } from 'pg'

/** Local server recovery only. No HTTP route exposes this operation. */
export async function rotateOwnerRecoveryCodes(payload: Payload, email: string) {
  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new Error('A valid existing owner email is required.')
  const pool = (payload.db as unknown as { pool?: Pool }).pool
  if (!pool) throw new Error('PostgreSQL is required for local owner recovery.')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE lower(email) = $1 AND role = 'owner' FOR UPDATE",
      [normalized],
    )
    const user = result.rows[0]
    if (!user)
      throw new Error('The email does not identify an existing owner. No credentials changed.')
    const codes = Array.from({ length: 10 }, () => randomBytes(10).toString('hex').toUpperCase())
    await client.query(
      'UPDATE recovery_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [user.id],
    )
    for (const code of codes)
      await client.query('INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)', [
        user.id,
        createHmac('sha256', payload.config.secret).update(code).digest('hex'),
      ])
    await client.query(
      'UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [user.id],
    )
    await client.query(
      "INSERT INTO admin_auth_audit_events (user_id, event) VALUES ($1, 'owner.local_recovery_codes.rotated')",
      [user.id],
    )
    await client.query('COMMIT')
    return codes
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

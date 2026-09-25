import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'

import {
  getInstallationReadiness,
  authenticateWithRecoveryCode,
  InstallationError,
} from '../../src/modules/operations/installation'
import { loadConfig, type AppConfig } from '../../src/modules/core/config'

const testConfig: AppConfig = {
  ...loadConfig(),
  ownerEmail: 'admin@renegade.test',
  payloadSecret: '01234567890123456789012345678901',
}

function hashValue(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

describe('installation readiness probe', () => {
  it('reports database disconnected when pool cannot connect', async () => {
    const mockPayload = {
      config: { secret: testConfig.payloadSecret },
      db: {
        get pool() {
          throw new Error('Postgres down')
        },
      },
    }

    const readiness = await getInstallationReadiness(mockPayload as never, testConfig)
    expect(readiness.ready).toBe(false)
    expect(readiness.database).toBe('disconnected')
    expect(readiness.migrationState).toBe('uninitialized')
    expect(readiness.recoveryAction).toContain('PostgreSQL')
  })

  it('reports migrationState uninitialized when payload_migrations table does not exist', async () => {
    const mockPayload = {
      config: { secret: testConfig.payloadSecret },
      db: {
        pool: {
          query: async (text: string) => {
            if (text === 'SELECT 1') return { rows: [{ '?column?': 1 }] }
            if (text.includes('payload_migrations')) return { rows: [] }
            return { rows: [] }
          },
        },
      },
    }

    const readiness = await getInstallationReadiness(mockPayload as never, testConfig)
    expect(readiness.ready).toBe(false)
    expect(readiness.database).toBe('connected')
    expect(readiness.migrationState).toBe('uninitialized')
    expect(readiness.appliedMigrations).toBe(0)
    expect(readiness.recoveryAction).toContain('npm run db:migrate')
  })

  it('reports migrationState pending when some migrations are unapplied', async () => {
    const mockPayload = {
      config: { secret: testConfig.payloadSecret },
      db: {
        pool: {
          query: async (text: string) => {
            if (text === 'SELECT 1') return { rows: [{ '?column?': 1 }] }
            if (text.includes('table_name FROM information_schema.tables')) {
              return { rows: [{ table_name: 'payload_migrations' }] }
            }
            if (text.includes('SELECT name FROM payload_migrations')) {
              return { rows: [{ name: '20260812_075640_m01_baseline_schema' }] }
            }
            return { rows: [] }
          },
        },
      },
    }

    const readiness = await getInstallationReadiness(mockPayload as never, testConfig)
    expect(readiness.ready).toBe(false)
    expect(readiness.database).toBe('connected')
    expect(readiness.migrationState).toBe('pending')
    expect(readiness.appliedMigrations).toBe(1)
    expect(readiness.pendingMigrations.length).toBeGreaterThan(0)
    expect(readiness.recoveryAction).toContain('pending migration')
  })
})

describe('emergency recovery code authentication', () => {
  const validCode = 'A1B2C3D4E5F6A7B8C9D0'
  const validHash = hashValue(validCode, testConfig.payloadSecret)

  it('rejects recovery codes that are not 20 characters', async () => {
    const mockPayload = {
      config: { secret: testConfig.payloadSecret },
      db: { pool: { query: async () => ({ rows: [] }) } },
    }

    await expect(
      authenticateWithRecoveryCode(mockPayload as never, testConfig, {
        email: 'admin@renegade.test',
        recoveryCode: 'SHORT',
      }),
    ).rejects.toThrow('Recovery code must be 20 characters.')
  })

  it('rejects invalid or unknown user email', async () => {
    const mockPayload = {
      config: { secret: testConfig.payloadSecret },
      db: {
        pool: {
          query: async (text: string) => {
            if (text.includes('admin_auth_rate_limits')) {
              return { rows: [{ attempts: 1, window_started_at: new Date() }] }
            }
            if (text.includes('SELECT id, email, role FROM users')) {
              return { rows: [] } // User not found
            }
            return { rows: [] }
          },
        },
      },
    }

    await expect(
      authenticateWithRecoveryCode(mockPayload as never, testConfig, {
        email: 'admin@renegade.test',
        recoveryCode: validCode,
      }),
    ).rejects.toThrow('Invalid recovery credentials.')
  })

  it('rejects an already used recovery code', async () => {
    const mockPayload = {
      config: { secret: testConfig.payloadSecret },
      db: {
        pool: {
          query: async (text: string) => {
            if (text.includes('admin_auth_rate_limits')) {
              return { rows: [{ attempts: 1, window_started_at: new Date() }] }
            }
            if (text.includes('SELECT id, email, role FROM users')) {
              return { rows: [{ id: 'user-1', email: 'admin@renegade.test', role: 'owner' }] }
            }
            if (text.includes('UPDATE recovery_codes')) {
              return { rowCount: 0, rows: [] } // Code already burned or non-existent
            }
            return { rows: [] }
          },
        },
      },
    }

    await expect(
      authenticateWithRecoveryCode(mockPayload as never, testConfig, {
        email: 'admin@renegade.test',
        recoveryCode: validCode,
      }),
    ).rejects.toThrow('Invalid or already used recovery code.')
  })

  it('successfully burns a valid code and creates an authenticated session', async () => {
    const insertedSessions: unknown[] = []
    const auditLogs: unknown[] = []

    const mockPayload = {
      config: { secret: testConfig.payloadSecret },
      db: {
        pool: {
          query: async (text: string, values?: readonly unknown[]) => {
            if (text.includes('admin_auth_rate_limits')) {
              return { rows: [{ attempts: 1, window_started_at: new Date() }] }
            }
            if (text.includes('SELECT id, email, role FROM users')) {
              return { rows: [{ id: 'user-1', email: 'admin@renegade.test', role: 'owner' }] }
            }
            if (text.includes('UPDATE recovery_codes')) {
              return { rowCount: 1, rows: [{ id: 'code-1', user_id: 'user-1' }] }
            }
            if (text.includes('INSERT INTO admin_sessions')) {
              insertedSessions.push(values)
              return { rowCount: 1, rows: [] }
            }
            if (text.includes('INSERT INTO admin_auth_audit_events')) {
              auditLogs.push(values)
              return { rowCount: 1, rows: [] }
            }
            return { rows: [] }
          },
        },
      },
    }

    const session = await authenticateWithRecoveryCode(mockPayload as never, testConfig, {
      email: 'admin@renegade.test',
      recoveryCode: validCode,
    })

    expect(session.token).toBeDefined()
    expect(session.expirationSeconds).toBeGreaterThan(0)
    expect(insertedSessions).toHaveLength(1)
    expect(auditLogs).toHaveLength(1)
  })
})
